import React from "react";
import ReactDOM from "react-dom";
import { core, commands, sqlLab, themeObject } from "@apache-superset/core";

const { SupersetThemeProvider } = themeObject;
import { SnippetsModal } from "./SnippetsModal";

async function insertSqlIntoEditor(sql: string): Promise<boolean> {
  const currentTab = sqlLab.getCurrentTab();
  if (!currentTab) {
    console.error("[Editor Snippets] No active tab found");
    return false;
  }

  const editor = await currentTab.getEditor();
  editor.insertText(sql);
  editor.focus();

  return true;
}

let modalContainer: HTMLDivElement | null = null;

function showSnippetsModal() {
  if (!modalContainer) {
    modalContainer = document.createElement("div");
    modalContainer.id = "editor-snippets-modal-container";
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
  context.disposables.push(
    commands.registerCommand("editor_snippets.open", async () => {
      showSnippetsModal();
    }),
  );
};

export const deactivate = () => {
  if (modalContainer) {
    ReactDOM.unmountComponentAtNode(modalContainer);
    modalContainer.remove();
    modalContainer = null;
  }
};
