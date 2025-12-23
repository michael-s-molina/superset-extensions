# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""
EXPLAIN output parsers for different database engines.

These parsers extract metrics directly from database EXPLAIN output.
No artificial estimates are made - only values reported by the database are used.
"""

from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from typing import Any

from .types import (
    EngineType,
    EstimationMetrics,
    EstimationResult,
    PlanNode,
    ResourceLevel,
    Warning,
    WarningSeverity,
)

logger = logging.getLogger(__name__)

# Thresholds for warnings (based on actual database-reported values)
MEMORY_THRESHOLD_CRITICAL = 800 * 1024 * 1024 * 1024  # 800 GB
MEMORY_THRESHOLD_HIGH = 200 * 1024 * 1024 * 1024  # 200 GB
MEMORY_THRESHOLD_MEDIUM = 50 * 1024 * 1024 * 1024  # 50 GB

TIME_THRESHOLD_CRITICAL = 5 * 60 * 1000  # 5 minutes in ms
TIME_THRESHOLD_HIGH = 2 * 60 * 1000  # 2 minutes in ms
TIME_THRESHOLD_MEDIUM = 30 * 1000  # 30 seconds in ms

ROWS_THRESHOLD_CRITICAL = 1_000_000_000  # 1B rows
ROWS_THRESHOLD_HIGH = 100_000_000  # 100M rows
ROWS_THRESHOLD_MEDIUM = 10_000_000  # 10M rows

COST_THRESHOLD_CRITICAL = 10_000_000  # Very high cost
COST_THRESHOLD_HIGH = 1_000_000  # High cost
COST_THRESHOLD_MEDIUM = 100_000  # Medium cost


def format_bytes(bytes_val: int | None) -> str:
    """Format bytes to human readable string."""
    if bytes_val is None:
        return "N/A"
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024**2:
        return f"{bytes_val / 1024:.1f} KB"
    elif bytes_val < 1024**3:
        return f"{bytes_val / 1024**2:.1f} MB"
    elif bytes_val < 1024**4:
        return f"{bytes_val / 1024**3:.1f} GB"
    else:
        return f"{bytes_val / 1024**4:.1f} TB"


def format_rows(rows: int | None) -> str:
    """Format row count to human readable string."""
    if rows is None:
        return "N/A"
    if rows < 1000:
        return str(rows)
    elif rows < 1_000_000:
        return f"{rows / 1000:.1f}K"
    elif rows < 1_000_000_000:
        return f"{rows / 1_000_000:.1f}M"
    else:
        return f"{rows / 1_000_000_000:.1f}B"


def format_time_ms(ms: float | None) -> str:
    """Format milliseconds to human readable string."""
    if ms is None:
        return "N/A"
    if ms < 1:
        return "< 1 ms"
    elif ms < 1000:
        return f"{ms:.1f} ms"
    elif ms < 60000:
        return f"{ms / 1000:.2f} sec"
    elif ms < 3600000:
        return f"{ms / 60000:.1f} min"
    else:
        return f"{ms / 3600000:.1f} hr"


def format_cost(cost: float | None) -> str:
    """Format PostgreSQL cost units to human readable string."""
    if cost is None:
        return "N/A"
    if cost < 1000:
        return f"{cost:.0f}"
    elif cost < 1_000_000:
        return f"{cost / 1000:.1f}K"
    else:
        return f"{cost / 1_000_000:.1f}M"


def deduplicate_warnings(warnings: list[Warning]) -> list[Warning]:
    """Remove duplicate warnings based on title."""
    seen_titles: set[str] = set()
    unique_warnings: list[Warning] = []
    for warning in warnings:
        if warning.title not in seen_titles:
            seen_titles.add(warning.title)
            unique_warnings.append(warning)
    return unique_warnings


def calculate_resource_level(
    rows: int | None = None,
    time_ms: float | None = None,
    memory_bytes: int | None = None,
    cost: float | None = None,
) -> ResourceLevel:
    """Calculate overall resource level based on database-reported metrics."""
    # Check memory (if provided by database)
    if memory_bytes is not None:
        if memory_bytes > MEMORY_THRESHOLD_CRITICAL:
            return ResourceLevel.CRITICAL
        if memory_bytes > MEMORY_THRESHOLD_HIGH:
            return ResourceLevel.HIGH
        if memory_bytes > MEMORY_THRESHOLD_MEDIUM:
            return ResourceLevel.MEDIUM

    # Check time (if provided by database)
    if time_ms is not None:
        if time_ms > TIME_THRESHOLD_CRITICAL:
            return ResourceLevel.CRITICAL
        if time_ms > TIME_THRESHOLD_HIGH:
            return ResourceLevel.HIGH
        if time_ms > TIME_THRESHOLD_MEDIUM:
            return ResourceLevel.MEDIUM

    # Check rows
    if rows is not None:
        if rows > ROWS_THRESHOLD_CRITICAL:
            return ResourceLevel.CRITICAL
        if rows > ROWS_THRESHOLD_HIGH:
            return ResourceLevel.HIGH
        if rows > ROWS_THRESHOLD_MEDIUM:
            return ResourceLevel.MEDIUM

    # Check cost (PostgreSQL-specific)
    if cost is not None:
        if cost > COST_THRESHOLD_CRITICAL:
            return ResourceLevel.CRITICAL
        if cost > COST_THRESHOLD_HIGH:
            return ResourceLevel.HIGH
        if cost > COST_THRESHOLD_MEDIUM:
            return ResourceLevel.MEDIUM

    return ResourceLevel.LOW


class BaseParser(ABC):
    """Abstract base class for EXPLAIN output parsers."""

    @abstractmethod
    def get_explain_sql(self, sql: str) -> str:
        """Generate the EXPLAIN SQL for this engine."""
        ...

    @abstractmethod
    def parse(self, explain_output: Any, raw_plan: str) -> EstimationResult:
        """Parse EXPLAIN output and return estimation result."""
        ...


class TrinoParser(BaseParser):
    """Parser for Trino EXPLAIN output.

    Uses EXPLAIN (without ANALYZE) to get planner estimates without executing.
    Trino provides:
    - Estimated rows
    - Estimated memory per node
    - Distribution information
    """

    def get_explain_sql(self, sql: str) -> str:
        # Use EXPLAIN without ANALYZE - plans but doesn't execute
        return f"EXPLAIN (TYPE DISTRIBUTED, FORMAT JSON) {sql}"

    def parse(self, explain_output: Any, raw_plan: str) -> EstimationResult:
        warnings: list[Warning] = []
        memory_bytes: int | None = None
        rows: int | None = None
        plan_tree: PlanNode | None = None

        try:
            plan_str = self._extract_plan_text(explain_output)

            if plan_str:
                memory_bytes, rows, warnings = self._parse_trino_plan(plan_str, warnings)
                # Build tree from text plan
                plan_tree = self._build_plan_tree(plan_str)

        except Exception as e:
            logger.warning(f"Error parsing Trino EXPLAIN output: {e}")

        metrics = EstimationMetrics(
            execution_time_ms=None,  # Not available without ANALYZE
            execution_time_label="N/A",
            planning_time_ms=None,
            planning_time_label="N/A",
            memory_bytes=memory_bytes,
            memory_label=format_bytes(memory_bytes),
            rows_estimated=rows,
            rows_label=format_rows(rows),
            cost=None,
            cost_label="N/A",
        )

        # Generate warnings based on estimates
        warnings.extend(self._generate_threshold_warnings(memory_bytes, rows))

        # Remove duplicate warnings
        warnings = deduplicate_warnings(warnings)

        resource_level = calculate_resource_level(
            rows=rows,
            memory_bytes=memory_bytes,
        )

        return EstimationResult(
            resource_level=resource_level,
            metrics=metrics,
            warnings=warnings,
            raw_plan=raw_plan,
            plan_tree=plan_tree,
            engine_type=EngineType.TRINO,
        )

    def _extract_plan_text(self, explain_output: Any) -> str:
        """Extract the plan text from various output formats."""
        if isinstance(explain_output, str):
            return explain_output

        if isinstance(explain_output, list) and len(explain_output) > 0:
            first_item = explain_output[0]
            if isinstance(first_item, dict):
                # Try common column names
                for key in ["Query Plan", "QUERY PLAN", "query plan"]:
                    if key in first_item:
                        return str(first_item[key])
                # Return first value
                for value in first_item.values():
                    return str(value)
            elif isinstance(first_item, str):
                return first_item

        return str(explain_output)

    def _parse_trino_plan(
        self,
        plan_str: str,
        warnings: list[Warning],
    ) -> tuple[int | None, int | None, list[Warning]]:
        """Parse Trino EXPLAIN output for estimates."""
        memory_bytes: int | None = None
        rows: int | None = None

        # Parse estimated memory (e.g., "Memory: 100MB" or "estimatedMemory=1.2GB")
        memory_match = re.search(
            r"(?:Memory|estimatedMemory)[=:]\s*([\d.]+)\s*(B|KB|MB|GB|TB)",
            plan_str,
            re.I,
        )
        if memory_match:
            value = float(memory_match.group(1))
            unit = memory_match.group(2).upper()
            multipliers = {"B": 1, "KB": 1024, "MB": 1024**2, "GB": 1024**3, "TB": 1024**4}
            memory_bytes = int(value * multipliers.get(unit, 1))

        # Parse estimated rows (e.g., "rows=1000" or "estimatedRows: 1000")
        rows_match = re.search(r"(?:rows|estimatedRows)[=:]\s*([\d,]+)", plan_str, re.I)
        if rows_match:
            rows = int(rows_match.group(1).replace(",", ""))

        # Check for full table scans
        if "TableScan" in plan_str:
            table_matches = re.findall(r"TableScan\[.*?table\s*=\s*(\S+)", plan_str)
            # Check if there's no filter pushdown
            if table_matches and not re.search(r"filterPredicate|constraint", plan_str, re.I):
                warnings.append(
                    Warning(
                        severity=WarningSeverity.WARNING,
                        title="Full Table Scan",
                        description="No filter pushdown detected on table scan.",
                        recommendation="Add WHERE clause on partition column.",
                        affected_tables=table_matches[:3],
                    )
                )

        # Check for cross joins
        if "CrossJoin" in plan_str:
            warnings.append(
                Warning(
                    severity=WarningSeverity.CRITICAL,
                    title="Cartesian Join",
                    description="Cross join detected. This produces a cartesian product.",
                    recommendation="Add join conditions to reduce row explosion.",
                )
            )

        return memory_bytes, rows, warnings

    def _build_plan_tree(self, plan_str: str) -> PlanNode | None:
        """Build a PlanNode tree from Trino EXPLAIN text output.

        Trino's text plan uses indentation to show hierarchy.
        Each line typically starts with operators like Fragment, Output, etc.
        """
        lines = plan_str.strip().split("\n")
        if not lines:
            return None

        # Parse lines into nodes based on indentation
        def get_indent(line: str) -> int:
            return len(line) - len(line.lstrip())

        def parse_node_type(line: str) -> tuple[str, dict[str, Any]]:
            """Extract node type and details from a line."""
            line = line.strip()
            details: dict[str, Any] = {}

            # Try to extract rows info
            rows_match = re.search(r"rows[=:]\s*([\d,]+)", line, re.I)
            if rows_match:
                details["rows"] = int(rows_match.group(1).replace(",", ""))

            # Extract the main node type (first word or bracketed content)
            # e.g., "- Output[...]" -> "Output"
            # e.g., "Fragment 0 [...]" -> "Fragment 0"
            node_match = re.match(r"[-\s]*([A-Za-z][A-Za-z0-9\s]*?)(?:\[|$|\s*\()", line)
            if node_match:
                node_type = node_match.group(1).strip()
            else:
                # Just use the first part of the line
                node_type = line.split("[")[0].split("(")[0].strip().lstrip("- ")

            return node_type or "Unknown", details

        def build_tree(
            lines: list[str], start_idx: int, parent_indent: int
        ) -> tuple[list[PlanNode], int]:
            """Recursively build tree from indented lines."""
            nodes: list[PlanNode] = []
            idx = start_idx

            while idx < len(lines):
                line = lines[idx]
                if not line.strip():
                    idx += 1
                    continue

                indent = get_indent(line)

                if indent <= parent_indent and idx > start_idx:
                    # This line belongs to parent or sibling
                    break

                node_type, details = parse_node_type(line)
                rows = details.get("rows")

                # Find children (lines with greater indentation)
                children: list[PlanNode] = []
                if idx + 1 < len(lines):
                    next_indent = get_indent(lines[idx + 1]) if lines[idx + 1].strip() else indent
                    if next_indent > indent:
                        children, idx = build_tree(lines, idx + 1, indent)
                    else:
                        idx += 1
                else:
                    idx += 1

                nodes.append(
                    PlanNode(
                        node_type=node_type,
                        rows=rows,
                        details=details,
                        children=children,
                    )
                )

            return nodes, idx

        # Build the tree starting from root
        nodes, _ = build_tree(lines, 0, -1)

        if nodes:
            # If multiple root nodes, wrap them in a Query node
            if len(nodes) == 1:
                return nodes[0]
            return PlanNode(node_type="Query", children=nodes)

        return None

    def _generate_threshold_warnings(
        self,
        memory_bytes: int | None,
        rows: int | None,
    ) -> list[Warning]:
        """Generate warnings based on planner estimates."""
        warnings: list[Warning] = []

        if memory_bytes and memory_bytes > MEMORY_THRESHOLD_CRITICAL:
            warnings.append(
                Warning(
                    severity=WarningSeverity.CRITICAL,
                    title="Excessive Memory Estimate",
                    description=f"Estimated memory usage: {format_bytes(memory_bytes)}.",
                    recommendation="Add filters to reduce data volume or break into smaller queries.",
                )
            )
        elif memory_bytes and memory_bytes > MEMORY_THRESHOLD_HIGH:
            warnings.append(
                Warning(
                    severity=WarningSeverity.WARNING,
                    title="High Memory Estimate",
                    description=f"Estimated memory usage: {format_bytes(memory_bytes)}.",
                    recommendation="Consider optimizing to reduce memory consumption.",
                )
            )

        if rows and rows > ROWS_THRESHOLD_CRITICAL:
            warnings.append(
                Warning(
                    severity=WarningSeverity.CRITICAL,
                    title="Very Large Result Set",
                    description=f"Planner estimates {format_rows(rows)} rows.",
                    recommendation="Add WHERE clause or LIMIT to reduce result size.",
                )
            )
        elif rows and rows > ROWS_THRESHOLD_HIGH:
            warnings.append(
                Warning(
                    severity=WarningSeverity.WARNING,
                    title="Large Result Set",
                    description=f"Planner estimates {format_rows(rows)} rows.",
                    recommendation="Consider if all rows are needed.",
                )
            )

        return warnings


class PostgresParser(BaseParser):
    """Parser for PostgreSQL EXPLAIN output.

    Uses EXPLAIN (without ANALYZE) to get planner estimates without executing.
    PostgreSQL provides:
    - Estimated rows (planner prediction)
    - Cost units (relative, not time-based)
    - Does NOT provide memory or time estimates without ANALYZE
    """

    def get_explain_sql(self, sql: str) -> str:
        # Use EXPLAIN without ANALYZE - plans but doesn't execute
        return f"EXPLAIN (FORMAT JSON, COSTS) {sql}"

    def parse(self, explain_output: Any, raw_plan: str) -> EstimationResult:
        warnings: list[Warning] = []
        rows_scanned: int = 0
        total_cost: float | None = None
        plan_tree: PlanNode | None = None

        try:
            plan_json = self._extract_plan_json(explain_output)

            if plan_json and isinstance(plan_json, list) and len(plan_json) > 0:
                plan_data = plan_json[0]

                if isinstance(plan_data, dict) and "Plan" in plan_data:
                    plan = plan_data["Plan"]
                    # Get cost from root node
                    total_cost = plan.get("Total Cost")
                    # Parse tree for warnings and sum of scanned rows
                    rows_scanned, warnings = self._parse_plan_node(plan, warnings)
                    # Build the plan tree for visualization
                    plan_tree = self._build_plan_tree(plan)

        except Exception as e:
            logger.exception(f"Error parsing PostgreSQL EXPLAIN output: {e}")

        metrics = EstimationMetrics(
            execution_time_ms=None,  # Not available without ANALYZE
            execution_time_label="N/A",
            planning_time_ms=None,
            planning_time_label="N/A",
            memory_bytes=None,  # PostgreSQL doesn't provide memory estimates
            memory_label="N/A",
            rows_estimated=rows_scanned if rows_scanned > 0 else None,
            rows_label=format_rows(rows_scanned) if rows_scanned > 0 else "N/A",
            cost=total_cost,
            cost_label=format_cost(total_cost),
        )

        # Generate warnings based on planner estimates
        warnings.extend(self._generate_threshold_warnings(rows_scanned, total_cost))

        # Remove duplicate warnings
        warnings = deduplicate_warnings(warnings)

        resource_level = calculate_resource_level(
            rows=rows_scanned if rows_scanned > 0 else None,
            cost=total_cost,
        )

        return EstimationResult(
            resource_level=resource_level,
            metrics=metrics,
            warnings=warnings,
            raw_plan=raw_plan,
            plan_tree=plan_tree,
            engine_type=EngineType.POSTGRES,
        )

    def _extract_plan_json(self, explain_output: Any) -> list[dict] | None:
        """Extract the JSON plan from various output formats."""
        if isinstance(explain_output, list) and len(explain_output) > 0:
            first_item = explain_output[0]

            if isinstance(first_item, dict):
                if "Plan" in first_item:
                    return [first_item]
                elif "QUERY PLAN" in first_item:
                    json_str = first_item["QUERY PLAN"]
                    if isinstance(json_str, str):
                        return json.loads(json_str)
                    return json_str
                else:
                    for value in first_item.values():
                        if isinstance(value, str) and value.strip().startswith("["):
                            try:
                                return json.loads(value)
                            except json.JSONDecodeError:
                                pass
                        elif isinstance(value, list):
                            return value
            elif isinstance(first_item, str):
                return json.loads(first_item)

        elif isinstance(explain_output, str):
            return json.loads(explain_output)

        return None

    def _parse_plan_node(
        self,
        node: dict[str, Any],
        warnings: list[Warning],
    ) -> tuple[int, list[Warning]]:
        """Recursively parse PostgreSQL plan nodes.

        Returns the sum of rows from scan nodes (actual data read from tables),
        not the inflated row counts from joins.
        """
        rows_scanned: int = 0
        node_type = node.get("Node Type", "")
        plan_rows = node.get("Plan Rows", 0)

        # Scan nodes are where actual data is read from tables
        scan_types = {"Seq Scan", "Index Scan", "Index Only Scan", "Bitmap Heap Scan"}

        if node_type in scan_types:
            rows_scanned = int(plan_rows)
            relation = node.get("Relation Name", "unknown")

            # Warn about sequential scans on large tables
            if node_type == "Seq Scan" and plan_rows > 100000:
                warnings.append(
                    Warning(
                        severity=WarningSeverity.WARNING,
                        title="Sequential Scan",
                        description=f"Sequential scan on '{relation}' (~{format_rows(plan_rows)} rows).",
                        recommendation="Consider adding an index or WHERE clause.",
                        affected_tables=[relation],
                    )
                )

        # Check for nested loops without join conditions (cartesian product)
        if node_type == "Nested Loop":
            join_filter = node.get("Join Filter")
            if not join_filter:
                warnings.append(
                    Warning(
                        severity=WarningSeverity.CRITICAL,
                        title="Cartesian Product",
                        description="Nested loop without join condition detected.",
                        recommendation="Add JOIN conditions to avoid cartesian product.",
                    )
                )

        # Recursively process child nodes and sum their scanned rows
        if "Plans" in node:
            for child in node["Plans"]:
                child_rows, warnings = self._parse_plan_node(child, warnings)
                rows_scanned += child_rows

        return rows_scanned, warnings

    def _build_plan_tree(self, node: dict[str, Any]) -> PlanNode:
        """Build a PlanNode tree from PostgreSQL EXPLAIN JSON."""
        node_type = node.get("Node Type", "Unknown")
        rows = node.get("Plan Rows")
        cost = node.get("Total Cost")

        # Build details dict with relevant info
        details: dict[str, Any] = {}
        if "Relation Name" in node:
            details["table"] = node["Relation Name"]
        if "Index Name" in node:
            details["index"] = node["Index Name"]
        if "Filter" in node:
            details["filter"] = node["Filter"]
        if "Join Filter" in node:
            details["joinFilter"] = node["Join Filter"]
        if "Sort Key" in node:
            details["sortKey"] = node["Sort Key"]

        # Build children recursively
        children: list[PlanNode] = []
        if "Plans" in node:
            for child in node["Plans"]:
                children.append(self._build_plan_tree(child))

        return PlanNode(
            node_type=node_type,
            rows=int(rows) if rows is not None else None,
            cost=float(cost) if cost is not None else None,
            details=details,
            children=children,
        )

    def _generate_threshold_warnings(
        self,
        rows: int | None,
        cost: float | None,
    ) -> list[Warning]:
        """Generate warnings based on planner estimates."""
        warnings: list[Warning] = []

        if rows and rows > ROWS_THRESHOLD_CRITICAL:
            warnings.append(
                Warning(
                    severity=WarningSeverity.CRITICAL,
                    title="Very Large Result Set",
                    description=f"Planner estimates {format_rows(rows)} rows.",
                    recommendation="Add WHERE clause or LIMIT to reduce result size.",
                )
            )
        elif rows and rows > ROWS_THRESHOLD_HIGH:
            warnings.append(
                Warning(
                    severity=WarningSeverity.WARNING,
                    title="Large Result Set",
                    description=f"Planner estimates {format_rows(rows)} rows.",
                    recommendation="Consider if all rows are needed.",
                )
            )

        if cost and cost > COST_THRESHOLD_CRITICAL:
            warnings.append(
                Warning(
                    severity=WarningSeverity.CRITICAL,
                    title="Very High Cost Query",
                    description=f"Query has cost of {format_cost(cost)} units.",
                    recommendation="Review query plan for optimization opportunities.",
                )
            )
        elif cost and cost > COST_THRESHOLD_HIGH:
            warnings.append(
                Warning(
                    severity=WarningSeverity.WARNING,
                    title="High Cost Query",
                    description=f"Query has cost of {format_cost(cost)} units.",
                    recommendation="Consider adding indexes or filters.",
                )
            )

        return warnings


def get_parser(engine_type: EngineType) -> BaseParser:
    """Get the appropriate parser for the given engine type."""
    if engine_type == EngineType.TRINO:
        return TrinoParser()
    elif engine_type == EngineType.POSTGRES:
        return PostgresParser()
    else:
        # Default to Trino parser
        return TrinoParser()


def detect_engine_type(backend: str) -> EngineType:
    """Detect engine type from database backend string."""
    backend_lower = backend.lower()
    if "trino" in backend_lower or "presto" in backend_lower:
        return EngineType.TRINO
    elif "postgres" in backend_lower or "redshift" in backend_lower:
        return EngineType.POSTGRES
    else:
        return EngineType.UNKNOWN
