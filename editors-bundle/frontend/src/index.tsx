import { common, editors, commands, menus } from '@apache-superset/core';
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
];

// Current SQL editor state
let currentSQLEditorIndex = 0;
let currentSQLEditorDisposable: common.Disposable | null = null;

function registerCurrentSQLEditor(): common.Disposable | null {
  const editor = SQL_EDITORS[currentSQLEditorIndex];

  // If component is null (Ace), don't register anything
  // Superset will use its default Ace editor
  if (editor.component === null) {
    return null;
  }

  return editors.registerEditor(
    { id: editor.id, name: editor.name, languages: ['sql'] },
    editor.component,
  );
}

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

function getCurrentSQLEditorName(): string {
  return SQL_EDITORS[currentSQLEditorIndex].name;
}

// Start with Ace editor (index 0) - no registration needed, it's the default
currentSQLEditorIndex = 0;
currentSQLEditorDisposable = registerCurrentSQLEditor(); // Returns null for Ace

commands.registerCommand(
  { id: 'editors_bundle.switchSQLEditor', title: 'Switch SQL Editor', icon: 'FormOutlined', description: 'Switch to the next available SQL editor' },
  () => switchSQLEditor(),
);

commands.registerCommand(
  { id: 'editors_bundle.getCurrentSQLEditor', title: 'Get Current SQL Editor', description: 'Get the name of the currently active SQL editor' },
  () => getCurrentSQLEditorName(),
);

editors.registerEditor(
  { id: 'editors_bundle.codemirror_css', name: 'CodeMirror CSS', languages: ['css'] },
  CodeMirrorCSSEditor,
);

editors.registerEditor(
  { id: 'editors_bundle.md_editor', name: 'SimpleMDE Markdown', languages: ['markdown'] },
  SimpleMDEEditor,
);

menus.registerMenuItem(
  { view: 'sqllab.editor', command: 'editors_bundle.switchSQLEditor' },
  'sqllab.editor',
  'primary',
);
