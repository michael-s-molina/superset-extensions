# SQL Snippets Extension

A Superset SQL Lab extension for managing and inserting reusable SQL code snippets.

## Features

- **Save SQL snippets** - Store frequently used SQL code for quick access
- **Insert into editor** - Insert snippets directly into the SQL editor
- **Copy to clipboard** - Copy snippet SQL to clipboard
- **Local storage** - Snippets are persisted in browser localStorage
- **Ace editor** - Full SQL syntax highlighting when editing snippets

## Usage

1. Open SQL Lab
2. Click the "SQL Snippets" button in the editor toolbar
3. Create, edit, or insert snippets as needed

### Creating a Snippet

1. Click the + icon at the bottom of the modal
2. Enter a name for your snippet
3. Enter the SQL code in the editor
4. Click "Save"

### Inserting a Snippet

- Click the insert icon (Enter) next to a snippet to insert it at the end of the current editor content
- Or click the copy icon to copy the SQL to your clipboard

## Development

### Building

```bash
# From the extension directory
superset-extensions build
```

### Project Structure

```
sql_snippets/
├── frontend/
│   ├── src/
│   │   ├── index.tsx          # Extension entry point
│   │   ├── SnippetsModal.tsx  # Modal UI component
│   │   ├── storage.ts         # localStorage helpers
│   │   └── types.ts           # TypeScript type definitions
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
├── extension.json             # Extension manifest
└── README.md
```

## License

MIT
