import React, { useEffect, useReducer } from 'react';
import { Alert, Spin } from 'antd';
import { authentication, sqlLab } from '@apache-superset/core';
import Table from './Table';
import { TableMetadata, QueryState, QueryAction } from './types';

const SUPPORTED_DATABASE_IDS = [1];

const formatErrorMessage = (message: string): string => {
  const jsonDetailMatch = message.match(/Query insight service error: ({.*})/);
  if (jsonDetailMatch) {
    try {
      const detailJson = JSON.parse(jsonDetailMatch[1]);
      if (detailJson.detail) {
        return detailJson.detail.replace(/\\n/g, '\n');
      }
    } catch {
      // If JSON parsing fails, return the original message
    }
  }
  return message;
};

const fetchQueryInsights = async (
  sql: string,
  databaseId: number,
  schema?: string,
): Promise<TableMetadata[]> => {
  const csrfToken = await authentication.getCSRFToken();
  const response = await fetch('/extensions/query_insights/metadata', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken!,
    },
    body: JSON.stringify({
      sql,
      default_schema: schema,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = formatErrorMessage(errorData.message);
      }
    } catch {
      // If we can't parse the error response, use the default message
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.result?.tables || [];
};

const queryReducer = (state: QueryState, action: QueryAction): QueryState => {
  switch (action.type) {
    case 'QUERY_START':
      return {
        ...state,
        metadata: [],
        errorState: null,
        loading: true,
      };
    case 'QUERY_SUCCESS':
      return {
        ...state,
        metadata: action.payload,
        errorState: null,
        loading: false,
      };
    case 'QUERY_FAIL':
      return {
        ...state,
        metadata: [],
        errorState: action.payload,
        loading: false,
      };
    case 'DATABASE_CHANGED':
      return {
        metadata: [],
        errorState: null,
        loading: false,
        databaseId: action.payload,
      };
    default:
      return state;
  }
};

const initialQueryState: QueryState = {
  metadata: [],
  errorState: null,
  loading: false,
  databaseId: null,
};

const Main: React.FC = () => {
  const [state, dispatch] = useReducer(queryReducer, initialQueryState);

  useEffect(() => {
    const currentTab = sqlLab.getCurrentTab();
    if (currentTab?.editor?.databaseId) {
      dispatch({
        type: 'DATABASE_CHANGED',
        payload: currentTab.editor.databaseId,
      });
    }

    const queryRun = sqlLab.onDidQueryRun(
      (queryContext: sqlLab.QueryContext) => {
        const { editor } = queryContext.tab;

        // Only dispatch if the database is supported
        if (!SUPPORTED_DATABASE_IDS.includes(editor.databaseId)) {
          return;
        }

        dispatch({ type: 'QUERY_START' });
      },
    );

    const querySuccess = sqlLab.onDidQuerySuccess(
      async (queryContext: sqlLab.QueryContext) => {
        const { editor } = queryContext.tab;

        // Only fetch metadata if the database is supported
        if (!SUPPORTED_DATABASE_IDS.includes(editor.databaseId)) {
          return;
        }

        try {
          const metadata = await fetchQueryInsights(
            editor.content,
            editor.databaseId,
            editor.schema,
          );
          dispatch({
            type: 'QUERY_SUCCESS',
            payload: metadata,
          });
        } catch (err) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : 'An unexpected error occurred while fetching query insights';
          dispatch({ type: 'QUERY_FAIL', payload: errorMessage });
        }
      },
    );

    const queryFail = sqlLab.onDidQueryFail(
      (queryContext: sqlLab.QueryContext) => {
        const { editor } = queryContext.tab;

        // Only dispatch if the database is supported
        if (!SUPPORTED_DATABASE_IDS.includes(editor.databaseId)) {
          return;
        }

        dispatch({
          type: 'QUERY_FAIL',
          payload:
            'Query insights cannot be generated because the query failed',
        });
      },
    );

    const databaseChanged = sqlLab.onDidChangeEditorDatabase(dbId => {
      dispatch({ type: 'DATABASE_CHANGED', payload: dbId });
    });

    return () => {
      queryRun.dispose();
      querySuccess.dispose();
      queryFail.dispose();
      databaseChanged.dispose();
    };
  }, []);

  const isDatabaseSupported =
    state.databaseId !== null &&
    SUPPORTED_DATABASE_IDS.includes(state.databaseId);

  if (!isDatabaseSupported) {
    return (
      <Alert message="Query insights are not available for this database" />
    );
  }

  if (state.errorState) {
    return (
      <Alert
        message={
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {state.errorState}
          </pre>
        }
        type="error"
      />
    );
  }

  if (state.loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <Spin size="default" />
        <div style={{ marginLeft: '8px', color: '#666', fontSize: '14px' }}>
          Loading...
        </div>
      </div>
    );
  }

  return <Table metadata={state.metadata} />;
};

export default Main;
