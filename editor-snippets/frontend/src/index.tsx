import React from "react";
import ReactDOM from "react-dom";
import { commands, menus, sqlLab, theme } from "@apache-superset/core";

const { SupersetThemeProvider } = theme.themeObject;
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

commands.registerCommand(
  {
    id: "editor_snippets.open",
    title: "Open Snippets",
    icon: "ProfileOutlined",
    description: "Open the Editor snippets library",
  },
  async () => {
    showSnippetsModal();
  },
);

menus.registerMenuItem(
  { view: "sqllab.editor", command: "editor_snippets.open" },
  "sqllab.editor",
  "primary",
);
