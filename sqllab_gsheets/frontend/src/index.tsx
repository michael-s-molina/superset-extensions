import { core, sqlLab, commands, authentication } from '@apache-superset/core';
import { message } from 'antd';

export const activate = (_context: core.ExtensionContext) => {
  // Register the export command
  commands.registerCommand('sqllab_gsheets.export', async () => {
    const currentTab = sqlLab.getCurrentTab();

    if (!currentTab) {
      message.warning('No active tab found.');
      return;
    }

    const editor = await currentTab.getEditor();
    const sql = editor.getValue()?.trim();

    if (!sql) {
      message.warning('No SQL query to export. Please write a query first.');
      return;
    }

    if (!currentTab.databaseId) {
      message.warning('No database selected. Please select a database first.');
      return;
    }

    const hideLoading = message.loading('Exporting to Google Sheets...', 0);

    try {
      const csrfToken = await authentication.getCSRFToken();

      const response = await fetch('/extensions/sqllab_gsheets/export/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken!,
        },
        body: JSON.stringify({
          sql,
          databaseId: currentTab.databaseId,
          catalog: currentTab.catalog,
          schema: currentTab.schema,
        }),
      });

      hideLoading();

      if (response.ok) {
        const data = await response.json();
        const spreadsheetUrl = data.spreadsheet_url;
        if (spreadsheetUrl) {
          message.success(`Exported ${data.row_count} rows to Google Sheets`);
          window.open(spreadsheetUrl, '_blank');
        }
      } else {
        let errorMessage = 'Export failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          errorMessage = `Export failed: ${response.statusText || `HTTP ${response.status}`}`;
        }
        message.error(errorMessage);
      }
    } catch (error) {
      hideLoading();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      message.error(`Export failed: ${errorMessage}`);
    }
  });
};

export const deactivate = () => {};
