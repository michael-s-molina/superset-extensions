import React from 'react';
import ReactDOM from 'react-dom';
import { core, commands, themeObject } from '@apache-superset/core';
import { SnippetsModal } from './SnippetsModal';
import { AceEditorInstance } from './types';

const { SupersetThemeProvider } = themeObject;

function insertSqlIntoEditor(sql: string): boolean {
  // TODO: Replace this direct DOM manipulation with the SQL Lab editing API
  // once it's added to @apache-superset/core (e.g., sqlLab.setEditorContent())

  // Find the Ace editor instance in the DOM
  const aceEditor = document.querySelector('.ace_editor') as HTMLElement & {
    env?: { editor?: AceEditorInstance };
  };

  if (!aceEditor?.env?.editor) {
    console.error('[SQL Snippets] Ace editor not found');
    return false;
  }

  const editor = aceEditor.env.editor;

  // Move cursor to end and insert snippet
  editor.navigateFileEnd();
  const currentContent = editor.getValue();
  const insertText = currentContent ? `\n\n${sql}` : sql;
  editor.insert(insertText);

  return true;
}

// Modal container
let modalContainer: HTMLDivElement | null = null;

function showSnippetsModal() {
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'sql-snippets-modal-container';
    document.body.appendChild(modalContainer);
  }

  const handleClose = () => {
    ReactDOM.render(
      <SupersetThemeProvider>
        <SnippetsModal
          visible={false}
          onClose={handleClose}
          onInsert={handleInsert}
        />
      </SupersetThemeProvider>,
      modalContainer,
    );
  };

  const handleInsert = (sql: string) => {
    insertSqlIntoEditor(sql);
  };

  ReactDOM.render(
    <SupersetThemeProvider>
      <SnippetsModal
        visible={true}
        onClose={handleClose}
        onInsert={handleInsert}
      />
    </SupersetThemeProvider>,
    modalContainer,
  );
}

export const activate = (context: core.ExtensionContext) => {
  console.log('[SQL Snippets] Activating...');

  // Register the open snippets command
  context.disposables.push(
    commands.registerCommand('sql_snippets.open', async () => {
      showSnippetsModal();
    }),
  );

  console.log('[SQL Snippets] Activated successfully');
};

export const deactivate = () => {
  console.log('[SQL Snippets] Deactivating...');

  // Clean up modal container
  if (modalContainer) {
    ReactDOM.unmountComponentAtNode(modalContainer);
    modalContainer.remove();
    modalContainer = null;
  }
};
