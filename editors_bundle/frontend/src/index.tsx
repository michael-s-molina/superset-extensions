import { core, editors, commands } from '@apache-superset/core';
import type { contributions } from '@apache-superset/core';
import MonacoSQLEditor from './editors/MonacoSQLEditor';
import CodeMirrorCSSEditor from './editors/CodeMirrorCSSEditor';
import SimpleMDEEditor from './editors/SimpleMDEEditor';

type EditorComponent = React.ForwardRefExoticComponent<
  editors.EditorProps & React.RefAttributes<editors.EditorHandle>
>;

interface SQLEditorOption {
  id: string;
  name: string;
  // null means use default Ace editor (no extension override)
  component: EditorComponent | null;
}

// Available SQL editor implementations
// Ace (null component) means the extension doesn't provide an editor,
// so Superset falls back to its default Ace editor
const SQL_EDITORS: SQLEditorOption[] = [
  {
    id: 'superset.ace_sql',
    name: 'Ace',
    component: null, // Default Superset editor
  },
  {
    id: 'editors_bundle.monaco_sql',
    name: 'Monaco',
    component: MonacoSQLEditor,
  },
  {
    id: 'editors_bundle.codemirror_sql',
    name: 'CodeMirror',
    component: CodeMirrorCSSEditor, // Reusing CodeMirror component
  },
  {
    id: 'editors_bundle.simplemde_sql',
    name: 'SimpleMDE',
    component: SimpleMDEEditor, // Reusing SimpleMDE component
  },
];

// Current SQL editor state
let currentSQLEditorIndex = 0;
let currentSQLEditorDisposable: core.Disposable | null = null;

/**
 * Register the current SQL editor based on the index.
 * Returns null if Ace is selected (no registration needed, Superset uses default).
 */
function registerCurrentSQLEditor(): core.Disposable | null {
  const editor = SQL_EDITORS[currentSQLEditorIndex];

  // If component is null (Ace), don't register anything
  // Superset will use its default Ace editor
  if (editor.component === null) {
    return null;
  }

  const contribution: contributions.EditorContribution = {
    id: editor.id,
    name: `${editor.name} SQL Editor`,
    languages: ['sql'],
    description: `SQL editor powered by ${editor.name}`,
  };
  return editors.registerEditorProvider(contribution, editor.component);
}

/**
 * Switch to the next SQL editor implementation.
 */
function switchSQLEditor(): string {
  // Dispose current registration
  if (currentSQLEditorDisposable) {
    currentSQLEditorDisposable.dispose();
    currentSQLEditorDisposable = null;
  }

  // Move to next editor
  currentSQLEditorIndex = (currentSQLEditorIndex + 1) % SQL_EDITORS.length;

  // Register new editor
  currentSQLEditorDisposable = registerCurrentSQLEditor();

  const newEditor = SQL_EDITORS[currentSQLEditorIndex];
  return newEditor.name;
}

/**
 * Get the current SQL editor name.
 */
function getCurrentSQLEditorName(): string {
  return SQL_EDITORS[currentSQLEditorIndex].name;
}

export const activate = (context: core.ExtensionContext) => {
  // Start with Ace editor (index 0) - no registration needed, it's the default
  currentSQLEditorIndex = 0;
  currentSQLEditorDisposable = registerCurrentSQLEditor(); // Returns null for Ace
  context.disposables.push({
    dispose: () => {
      if (currentSQLEditorDisposable) {
        currentSQLEditorDisposable.dispose();
        currentSQLEditorDisposable = null;
      }
    },
  });

  // Register command to switch SQL editors
  context.disposables.push(
    commands.registerCommand('editors_bundle.switchSQLEditor', () => {
      const newEditorName = switchSQLEditor();
      return newEditorName;
    }),
  );

  // Register command to get current SQL editor
  context.disposables.push(
    commands.registerCommand('editors_bundle.getCurrentSQLEditor', () => {
      return getCurrentSQLEditorName();
    }),
  );

  // Register CodeMirror for CSS
  context.disposables.push(
    editors.registerEditorProvider(
      {
        id: 'editors_bundle.codemirror_css',
        name: 'CodeMirror CSS Editor',
        languages: ['css'],
        description: 'CodeMirror-based CSS editor',
      },
      CodeMirrorCSSEditor,
    ),
  );

  // Register SimpleMDE for Markdown
  context.disposables.push(
    editors.registerEditorProvider(
      {
        id: 'editors_bundle.simplemde',
        name: 'SimpleMDE Markdown Editor',
        languages: ['markdown'],
        description: 'EasyMDE-based markdown editor with toolbar and preview',
      },
      SimpleMDEEditor,
    ),
  );

};

export const deactivate = () => {};
