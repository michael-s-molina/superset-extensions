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
Type definitions for Query Estimator.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ResourceLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WarningSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class EngineType(str, Enum):
    TRINO = "trino"
    POSTGRES = "postgres"
    UNKNOWN = "unknown"


@dataclass
class Warning:
    severity: WarningSeverity
    title: str
    description: str
    recommendation: str | None = None
    affected_tables: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity.value,
            "title": self.title,
            "description": self.description,
            "recommendation": self.recommendation,
            "affectedTables": self.affected_tables,
        }


@dataclass
class PlanNode:
    """Represents a node in the query execution plan tree."""

    node_type: str
    rows: int | None = None
    cost: float | None = None
    details: dict[str, Any] = field(default_factory=dict)
    children: list["PlanNode"] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodeType": self.node_type,
            "rows": self.rows,
            "cost": self.cost,
            "details": self.details,
            "children": [c.to_dict() for c in self.children],
        }


@dataclass
class EstimationMetrics:
    """
    Metrics extracted directly from database EXPLAIN output.
    Different databases provide different metrics - fields will be None if not available.
    """

    # Actual execution time (from EXPLAIN ANALYZE) in milliseconds
    execution_time_ms: float | None = None
    execution_time_label: str = "N/A"

    # Planning time in milliseconds
    planning_time_ms: float | None = None
    planning_time_label: str = "N/A"

    # Memory usage reported by database (bytes)
    memory_bytes: int | None = None
    memory_label: str = "N/A"

    # Estimated rows from planner
    rows_estimated: int | None = None
    rows_label: str = "N/A"

    # PostgreSQL-specific: cost units (relative, not time)
    cost: float | None = None
    cost_label: str = "N/A"

    def to_dict(self) -> dict[str, Any]:
        return {
            "executionTimeMs": self.execution_time_ms,
            "executionTimeLabel": self.execution_time_label,
            "planningTimeMs": self.planning_time_ms,
            "planningTimeLabel": self.planning_time_label,
            "memoryBytes": self.memory_bytes,
            "memoryLabel": self.memory_label,
            "rowsEstimated": self.rows_estimated,
            "rowsLabel": self.rows_label,
            "cost": self.cost,
            "costLabel": self.cost_label,
        }


@dataclass
class EstimationResult:
    resource_level: ResourceLevel
    metrics: EstimationMetrics
    warnings: list[Warning] = field(default_factory=list)
    raw_plan: str | None = None
    plan_tree: PlanNode | None = None
    engine_type: EngineType = EngineType.UNKNOWN

    def to_dict(self) -> dict[str, Any]:
        return {
            "resourceLevel": self.resource_level.value,
            "metrics": self.metrics.to_dict(),
            "warnings": [w.to_dict() for w in self.warnings],
            "rawPlan": self.raw_plan,
            "planTree": self.plan_tree.to_dict() if self.plan_tree else None,
            "engineType": self.engine_type.value,
        }
