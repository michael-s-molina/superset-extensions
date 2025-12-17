from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

import pandas as pd
from flask import current_app, g, request, Response
from flask_appbuilder.api import expose, permission_name, protect
from flask_babel import gettext as __
from google.oauth2 import service_account
from googleapiclient.discovery import build
from superset_core.api.daos import DatabaseDAO
from superset_core.api.rest_api import RestApi
from superset_core.api.types import QueryOptions, QueryStatus

logger = logging.getLogger(__name__)


class GSheetsExportAPI(RestApi):
    resource_name = "sqllab_gsheets"
    openapi_spec_tag = "SQL Lab Google Sheets Export"
    class_permission_name = "sqllab_gsheets"

    @expose("/export/", methods=("POST",))
    @protect()
    @permission_name("read")
    def export_gsheets(self) -> Response:
        """Export SQL query results to Google Sheets.

        Request body:
            sql: SQL query to execute
            databaseId: Database ID to execute against
            catalog: Optional catalog name
            schema: Optional schema name
        """
        try:
            # 1. Parse request body
            body = request.json or {}
            sql = body.get("sql")
            database_id = body.get("databaseId")
            catalog = body.get("catalog")
            schema = body.get("schema")

            if not sql:
                return self.response(400, message=__("SQL query is required"))

            if not database_id:
                return self.response(400, message=__("Database ID is required"))

            # 2. Get database
            database = DatabaseDAO.find_one_or_none(id=database_id)
            if database is None:
                return self.response(404, message=__("Database not found"))

            # 3. Execute query
            df = self._execute_query(database, sql, catalog, schema)

            # 4. Get Google Sheets credentials
            creds = self._get_credentials()

            # 5. Create new spreadsheet
            service = build("sheets", "v4", credentials=creds)
            title = f"SQL_Export_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            spreadsheet = (
                service.spreadsheets()
                .create(body={"properties": {"title": title}})
                .execute()
            )
            spreadsheet_id = spreadsheet["spreadsheetId"]
            spreadsheet_url = spreadsheet["spreadsheetUrl"]

            # 6. Write data to spreadsheet
            values = self._dataframe_to_values(df)
            service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range="A1",
                valueInputOption="RAW",
                body={"values": values},
            ).execute()

            # 7. Share spreadsheet with current user
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

        except Exception as ex:
            logger.exception("Error exporting to Google Sheets: %s", str(ex))
            return self.response(500, message=str(ex))

    def _execute_query(
        self,
        database: Any,
        sql: str,
        catalog: str | None,
        schema: str | None,
    ) -> pd.DataFrame:
        """Execute query and return results as DataFrame."""
        logger.info("Executing query on database %s", database.id)

        options = QueryOptions(
            catalog=catalog,
            schema=schema,
        )

        result = database.execute(sql, options)

        if result.status != QueryStatus.SUCCESS:
            raise ValueError(result.error_message or "Query execution failed")

        if not result.statements or result.statements[0].data is None:
            return pd.DataFrame()

        return result.statements[0].data

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
            raise ValueError(__("GSHEETS_SERVICE_ACCOUNT config is not set"))

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
            raise ValueError(
                __(
                    "Missing keys in GSHEETS_SERVICE_ACCOUNT: %(keys)s",
                    keys=", ".join(missing_keys),
                )
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
