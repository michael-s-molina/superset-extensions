# Editors Bundle Extension

A Superset extension that demonstrates how to provide custom code editors for different languages. This extension showcases the editor contribution system by registering alternative editors that can replace Superset's default Ace editor.

## Features

- **Multiple editor implementations** - Provides Monaco, CodeMirror, and SimpleMDE editors
- **Language-specific editors** - Different editors optimized for SQL, CSS, and Markdown
- **Runtime switching** - Command to switch between SQL editor implementations without reloading
- **Theme support** - Editors adapt to Superset's light/dark theme
- **Full EditorHandle API** - Implements the complete editor interface for Superset integration

## Editors

| Language | Editor     | Description                                                       |
| -------- | ---------- | ----------------------------------------------------------------- |
| SQL      | Monaco     | Microsoft's VS Code editor with IntelliSense and advanced editing |
| CSS      | CodeMirror | Lightweight, extensible editor with CSS syntax highlighting       |
| Markdown | SimpleMDE  | Rich markdown editor with toolbar and live preview                |

## Commands

| Command                          | Description                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `editors_bundle.switchSQLEditor` | Cycles through SQL editor implementations (Ace -> Monaco -> CodeMirror -> SimpleMDE) |

## EditorHandle Interface

Each editor implements the `EditorHandle` interface, which provides:

| Method                                           | Description                       |
| ------------------------------------------------ | --------------------------------- |
| `focus()`                                        | Focus the editor                  |
| `getValue()` / `setValue()`                      | Get or set editor content         |
| `getCursorPosition()` / `moveCursorToPosition()` | Cursor manipulation               |
| `getSelections()` / `setSelection()`             | Selection management              |
| `getSelectedText()` / `insertText()`             | Text manipulation                 |
| `scrollToLine()`                                 | Scroll to a specific line         |
| `setAnnotations()` / `clearAnnotations()`        | Error/warning markers             |
| `registerCompletionProvider()`                   | Custom autocomplete (Monaco only) |

## Usage

1. Install and enable the extension in Superset
2. Open SQL Lab - Monaco will be available as the SQL editor
3. Use the "Switch SQL Editor" toolbar button to cycle between implementations
4. CSS and Markdown editors are automatically used in their respective contexts

## Development

### Building

```bash
# From the extension directory
superset-extensions build
```

### Project Structure

```
editors_bundle/
├── frontend/
│   ├── src/
│   │   ├── index.tsx                    # Extension entry point
│   │   └── editors/
│   │       ├── MonacoSQLEditor.tsx      # Monaco editor implementation
│   │       ├── CodeMirrorCSSEditor.tsx  # CodeMirror editor implementation
│   │       └── SimpleMDEEditor.tsx      # SimpleMDE editor implementation
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js
├── extension.json                        # Extension manifest
└── README.md
```

### Adding a New Editor

1. Create a new component in `frontend/src/editors/` that implements `EditorHandle`
2. Use `forwardRef` and `useImperativeHandle` to expose the handle methods
3. Register the editor in `index.tsx` using `editors.registerEditorProvider()`
4. Add the editor contribution to `extension.json`

## License

MIT
