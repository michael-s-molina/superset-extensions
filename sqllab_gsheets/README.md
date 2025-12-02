# SQL Lab Google Sheets Export

A Superset extension that allows users to export SQL Lab query results directly to Google Sheets.

## Features

- Export query results to a new Google Sheets spreadsheet with one click
- Automatically shares the spreadsheet with the current user
- Handles data type conversions (dates, timestamps, null values)
- Preserves column headers

## Installation

1. Bundle the extension:

```bash
cd sqllab_gsheets
superset-extensions bundle
```

2. Copy the generated `.supx` file to your Superset extensions directory (configured via `EXTENSIONS_PATH` in `superset_config.py`):

```python
EXTENSIONS_PATH = "/path/to/extensions"
```

3. Restart Superset. The extension will be automatically loaded.

For more details, see the [deployment documentation](https://superset.apache.org/developer_portal/extensions/deployment).

## Configuration

This extension requires a Google Cloud Platform service account to create and share spreadsheets. Add the following to your `superset_config.py`:

```python
GSHEETS_SERVICE_ACCOUNT = {
    "type": "service_account",
    "project_id": "your-project-id",
    "private_key_id": "your-private-key-id",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "your-service-account@your-project-id.iam.gserviceaccount.com",
    "client_id": "123456789",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}
```

### Setting up Google Cloud Platform

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API** and **Google Drive API**
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > Service Account**
6. Fill in the service account details and click **Create**
7. Click on the created service account, go to **Keys** tab
8. Click **Add Key > Create new key > JSON**
9. Download the JSON file and copy its contents to your `superset_config.py`

## Usage

1. Run a query in SQL Lab
2. Click the **Export to Google Sheets** button in the editor toolbar
3. A new spreadsheet will be created and opened in a new tab
4. The spreadsheet is automatically shared with your email (based on your Superset user account)
