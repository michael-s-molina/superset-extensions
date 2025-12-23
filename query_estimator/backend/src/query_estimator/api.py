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
Query Estimator REST API.
"""

from __future__ import annotations

import logging

from flask import request, Response
from flask_appbuilder.api import expose, permission_name, protect
from flask_babel import gettext as __
from superset_core.api.daos import DatabaseDAO
from superset_core.api.rest_api import RestApi
from superset_core.api.types import QueryOptions, QueryStatus

from .parsers import detect_engine_type, get_parser
from .types import EngineType

logger = logging.getLogger(__name__)


class QueryEstimatorAPI(RestApi):
    resource_name = "query_estimator"
    openapi_spec_tag = "Query Estimator"
    class_permission_name = "query_estimator"

    @expose("/estimate", methods=("POST",))
    @protect()
    @permission_name("read")
    def estimate(self) -> Response:
        """Estimate query cost and resource usage.

        Request body:
            sql: SQL query to estimate
            databaseId: Database ID to execute against
            catalog: Optional catalog name
            schema: Optional schema name
        """
        try:
            body = request.json or {}
            sql = body.get("sql")
            database_id = body.get("databaseId")
            catalog = body.get("catalog")
            schema = body.get("schema")

            if not sql:
                return self.response(400, message=__("SQL query is required"))

            if not database_id:
                return self.response(400, message=__("Database ID is required"))

            # Get database
            database = DatabaseDAO.find_one_or_none(id=database_id)
            if database is None:
                return self.response(404, message=__("Database not found"))

            # Detect engine type
            engine_type = detect_engine_type(database.backend)

            if engine_type == EngineType.UNKNOWN:
                return self.response(
                    400,
                    message=__(
                        "Query estimation is not supported for this database type (%(backend)s). "
                        "Supported: Trino, PostgreSQL",
                        backend=database.backend,
                    ),
                )

            # Get parser and build EXPLAIN query
            parser = get_parser(engine_type)
            explain_sql = parser.get_explain_sql(sql)

            logger.info(
                "Executing EXPLAIN for database %s (engine: %s)",
                database_id,
                engine_type.value,
            )

            # Execute EXPLAIN query
            options = QueryOptions(
                catalog=catalog,
                schema=schema,
            )

            result = database.execute(explain_sql, options)

            if result.status != QueryStatus.SUCCESS:
                error_msg = result.error_message or "EXPLAIN query failed"
                logger.error("EXPLAIN failed: %s", error_msg)
                return self.response(500, message=error_msg)

            if not result.statements or result.statements[0].data is None:
                return self.response(
                    500,
                    message=__("No EXPLAIN output received"),
                )

            # Get the explain output
            explain_data = result.statements[0].data
            raw_plan = (
                explain_data.to_string()
                if hasattr(explain_data, "to_string")
                else str(explain_data)
            )

            # Convert DataFrame to list of dicts for parsing
            if hasattr(explain_data, "to_dict"):
                explain_output = explain_data.to_dict(orient="records")
            else:
                explain_output = explain_data

            # Parse the EXPLAIN output
            estimation_result = parser.parse(explain_output, raw_plan)

            logger.info(
                "Estimation complete: level=%s, warnings=%d",
                estimation_result.resource_level.value,
                len(estimation_result.warnings),
            )

            return self.response(200, result=estimation_result.to_dict())

        except Exception as ex:
            logger.exception("Error estimating query: %s", str(ex))
            return self.response(500, message=str(ex))
