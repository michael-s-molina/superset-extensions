import logging

from flask import request, Response
from flask_appbuilder.api import expose, permission_name, protect, safe
from superset_core.api.rest_api import RestApi

from .service import get_query_metadata

logger = logging.getLogger(__name__)


class QueryInsightsAPI(RestApi):
    resource_name = "query_insights"
    openapi_spec_tag = "Query Insights"
    class_permission_name = "query_insights"

    @expose("/metadata", methods=("POST",))
    @protect()
    @safe
    @permission_name("read")
    def metadata(self) -> Response:
        sql: str = request.json.get("sql", "")
        default_schema: str = request.json.get("default_schema")

        logger.info(
            "Query insights requested - schema: %s, sql length: %d",
            default_schema,
            len(sql) if sql else 0,
        )

        try:
            result = get_query_metadata(sql, default_schema)
            return self.response(200, result=result)

        except Exception as e:
            logger.exception("Exception generating query insights: %s", str(e))
            return self.response(
                500, message=f"Error generating query insights: {str(e)}"
            )
