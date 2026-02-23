# Editor Snippets Extension

A Superset SQL Lab extension for managing and inserting reusable code snippets into the editor.

## Features

- **Save snippets** - Store frequently used code for quick access
- **Insert into editor** - Insert snippets directly into the SQL editor
- **Copy to clipboard** - Copy snippet content to clipboard
- **Server storage** - Snippets are persisted per user in the database via a REST API

## Usage

1. Open SQL Lab
2. Click the "Editor Snippets" button in the editor toolbar
3. Create, edit, or insert snippets as needed

### Creating a Snippet

1. Click the + icon at the bottom of the modal
2. Enter a name for your snippet
3. Enter the content in the editor
4. Click "Save"

### Inserting a Snippet

- Click the insert icon (Enter) next to a snippet to insert it at the end of the current editor content
- Or click the copy icon to copy the content to your clipboard

## Development

### Building

```bash
# From the extension directory
superset-extensions build
```

### Project Structure

```
editor_snippets/
├── backend/
│   └── src/
│       └── editor_snippets/
│           ├── __init__.py
│           ├── api.py              # REST API endpoints (GET/PUT snippets)
│           └── entrypoint.py      # Backend entry point
├── frontend/
│   ├── src/
│   │   ├── index.tsx              # Extension entry point
│   │   ├── SnippetsModal.tsx      # Modal UI component
│   │   ├── storage.ts             # API helpers
│   │   └── types.ts               # TypeScript type definitions
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
├── extension.json                 # Extension manifest
└── README.md
```