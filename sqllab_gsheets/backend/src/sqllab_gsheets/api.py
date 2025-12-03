from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

import pandas as pd
from flask import current_app, g, Response
from flask_appbuilder.api import expose, permission_name, protect
from flask_babel import gettext as __
from google.oauth2 import service_account
from googleapiclient.discovery import build
from superset_core.api.daos import QueryDAO
from superset_core.api.rest_api import RestApi

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
            # 1. Get query
            query = self._get_query(client_id)
            if query is None:
                return self.response(
                    404,
                    message=__(
                        "The query associated with these results could not be found. "
                        "You need to re-run the original query."
                    ),
                )

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

        except Exception as ex:
            logger.exception("Error exporting to Google Sheets: %s", str(ex))
            return self.response(500, message=str(ex))

    def _get_query(self, client_id: str):
        """Get query by client_id.

        Returns the query object or None if not found.
        Access control is handled by the @protect() decorator at the API level.
        """
        return QueryDAO.find_one_or_none(client_id=client_id)

    def _get_dataframe(self, query) -> pd.DataFrame:
        """Get query results as a pandas DataFrame by re-executing the query."""
        logger.info("Executing query to get results")
        sql = query.sql
        df = query.database.get_df(
            sql,
            query.catalog,
            query.schema,
        )
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
