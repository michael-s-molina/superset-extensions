export interface Snippet {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
  updatedAt: number;
}

export interface SnippetsState {
  snippets: Snippet[];
  editingSnippet: Snippet | null;
  isFormVisible: boolean;
}

export type SnippetsAction =
  | { type: 'SET_SNIPPETS'; payload: Snippet[] }
  | { type: 'ADD_SNIPPET'; payload: Snippet }
  | { type: 'UPDATE_SNIPPET'; payload: Snippet }
  | { type: 'DELETE_SNIPPET'; payload: string }
  | { type: 'SET_EDITING_SNIPPET'; payload: Snippet | null }
  | { type: 'SET_FORM_VISIBLE'; payload: boolean };

export interface AceEditorInstance {
  getValue: () => string;
  setValue: (value: string, cursorPos?: number) => void;
  insert: (text: string) => void;
  focus: () => void;
  resize: () => void;
  navigateFileEnd: () => void;
}

declare global {
  const ace: {
    edit: (element: HTMLElement) => AceEditorInstance;
  };
}
