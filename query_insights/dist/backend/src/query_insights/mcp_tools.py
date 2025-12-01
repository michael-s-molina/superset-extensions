import logging
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field
from superset_core.mcp import tool

from .service import get_query_metadata

logger = logging.getLogger(__name__)


class QueryInsightsRequest(BaseModel):
    sql: str = Field(
        description="The SQL query to analyze for table metadata insights"
    )
    default_schema: Optional[str] = Field(
        default=None,
        description="The default schema to use when resolving table names"
    )


@tool(
    name="query_insights.get_metadata",
    description="Get metadata insights for tables referenced in a SQL query. Returns information about each table including description, data quality score, latest partition, retention period, owner team, and example queries.",
    tags=["query_insights", "metadata", "sql"]
)
def get_query_insights(request: QueryInsightsRequest) -> dict:
    """
    Analyze a SQL query and return metadata insights for the referenced tables.

    This tool helps understand the tables used in a query by providing:
    - Table descriptions
    - Data quality scores
    - Latest partition dates
    - Retention periods
    - Owner team information
    - Example queries for each table
    """
    try:
        logger.info(
            "MCP tool query_insights.get_metadata called - schema: %s, sql length: %d",
            request.default_schema,
            len(request.sql) if request.sql else 0,
        )

        result = get_query_metadata(request.sql, request.default_schema)

        return {
            "status": "success",
            "result": result,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.exception("Error in query_insights.get_metadata: %s", str(e))
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
