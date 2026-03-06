import React from 'react';
import ReactDOM from 'react-dom';
import { sqlLab, commands, menus, theme } from '@apache-superset/core';
import { message } from 'antd';
import { CompareModal, StoredQueryResult } from './CompareModal';

const { SupersetThemeProvider } = theme.themeObject;

const STORAGE_KEY = 'queryComparisonResults';

function loadResults(): StoredQueryResult[] {
  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveResults(results: StoredQueryResult[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch (e) {
    console.warn('[Query Comparison] Failed to save to sessionStorage:', e);
  }
}

function addResult(result: StoredQueryResult): void {
  const results = loadResults();
  // Remove existing results from the same tab (only keep latest per tab)
  const filtered = results.filter((r) => r.tabId !== result.tabId);
  filtered.push(result);
  saveResults(filtered);
}

function removeResultsByTabId(tabId: string): void {
  const results = loadResults();
  const filtered = results.filter((r) => r.tabId !== tabId);
  saveResults(filtered);
}

let modalContainer: HTMLDivElement | null = null;

function showCompareModal(results: StoredQueryResult[]) {
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'query-comparison-modal-container';
    document.body.appendChild(modalContainer);
  }

  const handleClose = () => {
    ReactDOM.render(
      <SupersetThemeProvider>
        <CompareModal
          visible={false}
          results={results}
          onClose={handleClose}
        />
      </SupersetThemeProvider>,
      modalContainer
    );
  };

  ReactDOM.render(
    <SupersetThemeProvider>
      <CompareModal
        visible={true}
        results={results}
        onClose={handleClose}
      />
    </SupersetThemeProvider>,
    modalContainer
  );
}

// Listen for successful queries and store their results
sqlLab.onDidQuerySuccess((queryResult) => {
  const queryId = queryResult.clientId;
  addResult({
    queryId,
    tabId: queryResult.tab.id,
    tabTitle: queryResult.tab.title,
    sql: queryResult.executedSql,
    columns: queryResult.result.columns,
    data: queryResult.result.data,
    timestamp: queryResult.endDttm,
  });
});

// Clean up results when tabs are closed
sqlLab.onDidCloseTab((tab) => {
  removeResultsByTabId(tab.id);
});

menus.registerMenuItem(
  { view: 'builtin.editor', command: 'query_comparison.compare' },
  'sqllab.editor',
  'secondary',
);

commands.registerCommand(
  { id: 'query_comparison.compare', title: 'Compare Queries', description: 'Open the query comparison modal' },
  async () => {
    const results = loadResults();

    if (results.length < 1) {
      message.warning(
        'No query results captured yet. Run queries in your tabs to make them available for comparison.'
      );
      return;
    }

    if (results.length < 2) {
      message.info(
        'Only 1 query result available. Run another query to compare results.'
      );
    }

    showCompareModal(results);
  },
);
