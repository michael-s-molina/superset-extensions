from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, cast

import pandas as pd
from flask import current_app, g, Response
from flask_appbuilder.api import expose, permission_name, protect
from flask_babel import gettext as __
from google.oauth2 import service_account
from googleapiclient.discovery import build
from superset import db, results_backend, results_backend_use_msgpack
from superset.errors import ErrorLevel, SupersetError, SupersetErrorType
from superset.exceptions import SupersetErrorException, SupersetSecurityException
from superset.models.sql_lab import Query
from superset.sql_parse import ParsedQuery
from superset.sqllab.limiting_factor import LimitingFactor
from superset.utils import core as utils
from superset.views.utils import _deserialize_results_payload
from superset_core.api.types.rest_api import RestApi

logger = logging.getLogger(__name__)


class GSheetsExportAPI(RestApi):
    resource_name = "sqllab_gsheets"
    openapi_spec_tag = "SQL Lab Google Sheets Export"
    class_permission_name = "sqllab_gsheets"

    @expose("/export/<string:client_id>/", methods=("GET",))
    @protect()
    @permission_name("read")
    def export_gsheets(self, client_id: str) -> Response:
        """Export SQL Lab query results to Google Sheets."""
        try:
            # 1. Get query and validate access
            query = self._get_query(client_id)

            # 2. Get query results as DataFrame
            df = self._get_dataframe(query)

            # 3. Get Google Sheets credentials
            creds = self._get_credentials()

            # 4. Create new spreadsheet
            service = build("sheets", "v4", credentials=creds)
            title = f"SQL_Export_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            spreadsheet = (
                service.spreadsheets()
                .create(body={"properties": {"title": title}})
                .execute()
            )
            spreadsheet_id = spreadsheet["spreadsheetId"]
            spreadsheet_url = spreadsheet["spreadsheetUrl"]

            # 5. Write data to spreadsheet
            values = self._dataframe_to_values(df)
            service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range="A1",
                valueInputOption="RAW",
                body={"values": values},
            ).execute()

            # 6. Share spreadsheet with current user
            self._share_with_user(creds, spreadsheet_id)

            logger.info(
                "Exported %d rows to Google Sheets: %s",
                len(df.index),
                spreadsheet_url,
            )

            return self.response(
                200,
                spreadsheet_url=spreadsheet_url,
                row_count=len(df.index),
            )

        except SupersetErrorException as ex:
            return self.response(ex.status, message=str(ex.error.message))
        except Exception as ex:
            logger.exception("Error exporting to Google Sheets: %s", str(ex))
            return self.response(500, message=str(ex))

    def _get_query(self, client_id: str) -> Query:
        """Get and validate query by client_id."""
        query = db.session.query(Query).filter_by(client_id=client_id).one_or_none()

        if query is None:
            raise SupersetErrorException(
                SupersetError(
                    message=__(
                        "The query associated with these results could not be found. "
                        "You need to re-run the original query."
                    ),
                    error_type=SupersetErrorType.RESULTS_BACKEND_ERROR,
                    level=ErrorLevel.ERROR,
                ),
                status=404,
            )

        try:
            query.raise_for_access()
        except SupersetSecurityException as ex:
            raise SupersetErrorException(
                SupersetError(
                    message=__("Cannot access the query"),
                    error_type=SupersetErrorType.QUERY_SECURITY_ACCESS_ERROR,
                    level=ErrorLevel.ERROR,
                ),
                status=403,
            ) from ex

        return query

    def _get_dataframe(self, query: Query) -> pd.DataFrame:
        """Get query results as a pandas DataFrame."""
        blob = None
        if results_backend and query.results_key:
            logger.info("Fetching data from results backend [%s]", query.results_key)
            blob = results_backend.get(query.results_key)

        if blob:
            logger.info("Decompressing cached results")
            payload = utils.zlib_decompress(
                blob, decode=not results_backend_use_msgpack
            )
            obj = _deserialize_results_payload(
                payload, query, cast(bool, results_backend_use_msgpack)
            )

            df = pd.DataFrame(
                data=obj["data"],
                dtype=object,
                columns=[c["name"] for c in obj["columns"]],
            )
        else:
            logger.info("Re-executing query to get results")
            if query.select_sql:
                sql = query.select_sql
                limit = None
            else:
                sql = query.executed_sql
                limit = ParsedQuery(
                    sql,
                    engine=query.database.db_engine_spec.engine,
                ).limit

            if limit is not None and query.limiting_factor in {
                LimitingFactor.QUERY,
                LimitingFactor.DROPDOWN,
                LimitingFactor.QUERY_AND_DROPDOWN,
            }:
                # remove extra row from `increased_limit`
                limit -= 1

            df = query.database.get_df(
                sql,
                query.catalog,
                query.schema,
            )[:limit]

        return df

    def _get_credentials(self) -> service_account.Credentials:
        """Load Google service account credentials from Superset config.

        Requires GSHEETS_SERVICE_ACCOUNT config dict with keys:
        - type: Service account type (usually "service_account")
        - project_id: Google Cloud project ID
        - private_key_id: Private key ID
        - private_key: Private key (PEM format)
        - client_email: Service account email
        - client_id: Client ID
        - auth_uri: Auth URI (usually "https://accounts.google.com/o/oauth2/auth")
        - token_uri: Token URI (usually "https://oauth2.googleapis.com/token")
        """
        service_account_info = current_app.config.get("GSHEETS_SERVICE_ACCOUNT")
        if not service_account_info:
            raise SupersetErrorException(
                SupersetError(
                    message=__("GSHEETS_SERVICE_ACCOUNT config is not set"),
                    error_type=SupersetErrorType.GENERIC_BACKEND_ERROR,
                    level=ErrorLevel.ERROR,
                ),
                status=500,
            )

        required_keys = [
            "type",
            "project_id",
            "private_key_id",
            "private_key",
            "client_email",
            "client_id",
            "auth_uri",
            "token_uri",
        ]
        missing_keys = [key for key in required_keys if key not in service_account_info]

        if missing_keys:
            raise SupersetErrorException(
                SupersetError(
                    message=__(
                        "Missing keys in GSHEETS_SERVICE_ACCOUNT: %(keys)s",
                        keys=", ".join(missing_keys),
                    ),
                    error_type=SupersetErrorType.GENERIC_BACKEND_ERROR,
                    level=ErrorLevel.ERROR,
                ),
                status=500,
            )

        return service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=[
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive",
            ],
        )

    def _dataframe_to_values(self, df: pd.DataFrame) -> list[list[Any]]:
        """Convert DataFrame to list of lists for Google Sheets API."""
        # Header row
        header = df.columns.tolist()

        # Data rows - convert to native Python types
        data_rows = []
        for _, row in df.iterrows():
            row_values = []
            for val in row:
                if pd.isna(val):
                    row_values.append("")
                elif isinstance(val, (date, datetime, pd.Timestamp)):
                    row_values.append(val.isoformat())
                else:
                    row_values.append(val)
            data_rows.append(row_values)

        return [header] + data_rows

    def _share_with_user(
        self, creds: service_account.Credentials, spreadsheet_id: str
    ) -> None:
        """Share the spreadsheet with the current user."""
        user_email = g.user.email if g.user else None
        if not user_email:
            logger.warning("No user email found, skipping sharing")
            return

        drive_service = build("drive", "v3", credentials=creds)
        drive_service.permissions().create(
            fileId=spreadsheet_id,
            body={
                "type": "user",
                "role": "writer",
                "emailAddress": user_email,
            },
            sendNotificationEmail=False,
        ).execute()

        logger.info("Shared spreadsheet %s with %s", spreadsheet_id, user_email)
