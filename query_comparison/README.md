# Query Comparison Extension

A Superset SQL Lab extension that enables side-by-side comparison of query results across different tabs.

## Features

- **Compare query results** from different SQL Lab tabs
- **Data differences** - View row-level changes with GitHub-style diff visualization
- **Schema changes** - Detect added/removed columns between queries
- **GitHub-style stats** - Visual indicators showing additions and removals
- **Swap queries** - Quickly switch base and comparison results
- **Automatic storage** - Query results are captured automatically when executed

## Usage

1. Open SQL Lab and create multiple tabs with different queries
2. Execute queries in each tab
3. Click the "Compare Results" button in the editor toolbar
4. Select the base result and the result to compare
5. View data differences and schema changes in the tabbed interface

## How It Works

The extension listens for successful query executions in SQL Lab and stores the results in session storage. Only the latest result per tab is kept to avoid clutter. When you open the comparison modal, you can select any two stored results to compare.

Results are automatically cleaned up when:
- A tab is closed
- The page is refreshed (session storage is cleared)

## Development

### Building

```bash
# From the extension directory
superset-extensions build
```

### Project Structure

```
query_comparison/
├── frontend/
│   ├── src/
│   │   ├── index.tsx        # Extension entry point, event handlers
│   │   ├── CompareModal.tsx # Main comparison UI component
│   │   └── compare.ts       # Comparison logic utilities
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
├── extension.json           # Extension manifest
└── README.md
```

## License

MIT
