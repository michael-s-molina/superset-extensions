from superset_core.api import rest_api

from .api import QueryInsightsAPI
from . import mcp_tools  # noqa: F401 - registers MCP tools

rest_api.add_extension_api(QueryInsightsAPI)
