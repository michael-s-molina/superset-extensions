import React from 'react';
import ReactDOM from 'react-dom';
import { core, sqlLab, commands, themeObject } from '@apache-superset/core';
import { message } from 'antd';
import { CompareModal, StoredQueryResult } from './CompareModal';

const { SupersetThemeProvider } = themeObject;

const STORAGE_KEY = 'queryComparisonResults';

// Load results from sessionStorage
function loadResults(): StoredQueryResult[] {
  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Save results to sessionStorage
function saveResults(results: StoredQueryResult[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch (e) {
    console.warn('[Query Comparison] Failed to save to sessionStorage:', e);
  }
}

// Add a result (keeps only the latest result per tab)
function addResult(result: StoredQueryResult): void {
  const results = loadResults();
  // Remove existing results from the same tab (only keep latest per tab)
  const filtered = results.filter((r) => r.tabId !== result.tabId);
  filtered.push(result);
  saveResults(filtered);
}

// Remove results by tabId
function removeResultsByTabId(tabId: string): void {
  const results = loadResults();
  const filtered = results.filter((r) => r.tabId !== tabId);
  saveResults(filtered);
}

// Modal container
let modalContainer: HTMLDivElement | null = null;

function showCompareModal(results: StoredQueryResult[]) {
  // Create container if it doesn't exist
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

export const activate = (context: core.ExtensionContext) => {

  // Listen for successful queries and store their results
  context.disposables.push(
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
    })
  );

  // Clean up results when tabs are closed
  context.disposables.push(
    sqlLab.onDidCloseTab((tab) => {
      removeResultsByTabId(tab.id);
    })
  );

  // Register the compare command
  context.disposables.push(
    commands.registerCommand('query_comparison.compare', async () => {
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
    })
  );
};

export const deactivate = () => {
  // Clean up modal container
  if (modalContainer) {
    ReactDOM.unmountComponentAtNode(modalContainer);
    modalContainer.remove();
    modalContainer = null;
  }
};
