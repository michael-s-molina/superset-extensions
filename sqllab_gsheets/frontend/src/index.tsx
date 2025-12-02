import { core, sqlLab, commands, authentication } from '@apache-superset/core';
import { message } from 'antd';

// Track last successful query's clientId per tab (tabId -> clientId)
const tabClientIds = new Map<string, string>();

export const activate = (_context: core.ExtensionContext) => {
  // Listen for successful queries and store the clientId per tab
  sqlLab.onDidQuerySuccess((queryResult: sqlLab.QueryResultContext) => {
    tabClientIds.set(queryResult.tab.id, queryResult.clientId);
  });

  // Clean up when tab is closed
  // Note: onDidCloseTab may not be implemented yet, so we wrap in try-catch
  try {
    sqlLab.onDidCloseTab((tab: sqlLab.Tab) => {
      tabClientIds.delete(tab.id);
    });
  } catch {
    // onDidCloseTab not implemented - tab cleanup won't happen but export still works
  }

  // Register the export command
  commands.registerCommand('sqllab_gsheets.export', async () => {
    const currentTab = sqlLab.getCurrentTab();

    if (!currentTab) {
      message.warning('No active tab found.');
      return;
    }

    const clientId = tabClientIds.get(currentTab.id);

    if (!clientId) {
      message.warning('No query results to export. Please run a query first.');
      return;
    }

    const hideLoading = message.loading('Exporting to Google Sheets...', 0);

    try {
      const csrfToken = await authentication.getCSRFToken();

      const response = await fetch(
        `/extensions/sqllab_gsheets/export/${clientId}/`,
        {
          method: 'GET',
          headers: {
            'X-CSRFToken': csrfToken!,
          },
        }
      );

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
