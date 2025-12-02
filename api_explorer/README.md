# API Explorer

A Superset extension that provides an interactive panel for exploring and testing the SQL Lab Extensions API.

## Overview

API Explorer adds a panel to SQL Lab that allows developers to:

- Execute API commands and view their responses
- Monitor real-time events from SQL Lab
- Debug and test extension integrations

## Installation

1. Bundle the extension:

```bash
cd api_explorer
superset-extensions bundle
```

2. Copy the generated `.supx` file to your Superset extensions directory (configured via `EXTENSIONS_PATH` in `superset_config.py`):

```python
EXTENSIONS_PATH = "/path/to/extensions"
```

3. Restart Superset. The extension will be automatically loaded.

For more details, see the [deployment documentation](https://superset.apache.org/developer_portal/extensions/deployment).

## Features

### Commands

The extension registers and exposes the following commands:

| Command                      | Description                      |
| ---------------------------- | -------------------------------- |
| `api_explorer.getTabs`       | Returns all open SQL Lab tabs    |
| `api_explorer.getCurrentTab` | Returns the currently active tab |
| `api_explorer.getDatabases`  | Returns available databases      |

### Events

The panel automatically subscribes to and displays SQL Lab events:

- `onDidChangeEditorContent` - Editor content changes
- `onDidChangeEditorDatabase` - Database selection changes
- `onDidChangeEditorCatalog` - Catalog selection changes
- `onDidChangeEditorSchema` - Schema selection changes
- `onDidChangeEditorTable` - Table selection changes
- `onDidClosePanel` - Panel closed
- `onDidChangeActivePanel` - Active panel changed
- `onDidChangeTabTitle` - Tab title changed
- `onDidQueryRun` - Query execution started
- `onDidQueryStop` - Query execution stopped
- `onDidQueryFail` - Query execution failed
- `onDidQuerySuccess` - Query execution succeeded
- `onDidCloseTab` - Tab closed
- `onDidChangeActiveTab` - Active tab changed
- `onDidRefreshDatabases` - Databases refreshed
- `onDidRefreshCatalogs` - Catalogs refreshed
- `onDidRefreshSchemas` - Schemas refreshed
- `onDidRefreshTables` - Tables refreshed
