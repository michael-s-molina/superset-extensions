# Query Statements Extension

A Superset SQL Lab extension that parses the active editor content into individual SQL statements and lets you navigate, copy, and execute each one independently.

## Features

- **Automatic parsing** - Detects statements in real time as you type, with debounced updates to avoid excessive re-parsing
- **Tab-aware** - Subscribes to the active tab and re-parses automatically when you switch tabs
- **Line range** - Each row shows the start and end line numbers of the statement in the editor
- **Type badge** - Color-coded badge (SELECT, INSERT, UPDATE, DELETE, CREATE, etc.) for quick scanning
- **Navigate** - Click any row to scroll the editor to the statement and select it
- **Execute** - Run a single statement directly without modifying the editor selection
- **Copy** - Copy the statement SQL to the clipboard with a confirmation checkmark
- **Open in new tab** - Open a statement in a new editor tab, inheriting the current database, catalog, and schema context

## Usage

1. Open SQL Lab and write a multi-statement SQL file
2. Open the **Statements** panel in the side panel area
3. The list updates as you type
4. Click a row to navigate to that statement in the editor
5. Use the action buttons on each row to execute, copy, or open in a new tab

## Development

### Building

```bash
# From the extension directory
PYENV_VERSION=superset superset-extensions build
```

### Project Structure

```
query-statements/
├── frontend/
│   ├── src/
│   │   ├── index.tsx                # Extension entry point
│   │   ├── QueryStatementsPanel.tsx # Main panel component
│   │   └── sqlParser.ts             # SQL statement parser
│   ├── package.json
│   └── tsconfig.json
├── extension.json                   # Extension manifest
└── README.md
```

## License

MIT
