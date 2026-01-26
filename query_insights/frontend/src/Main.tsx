import React, { useEffect, useReducer, useRef } from 'react';
import { Alert, Spin } from 'antd';
import { authentication, sqlLab } from '@apache-superset/core';
import Table from './Table';
import { TableMetadata, QueryState, QueryAction } from './types';

const SUPPORTED_DATABASE_IDS = [1];
const PANEL_ID = 'query_insights.main';

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

interface PendingQuery {
  content: string;
  databaseId: number;
  schema: string;
}

interface ExtendedQueryState extends QueryState {
  pendingQuery: PendingQuery | null;
}

type ExtendedQueryAction =
  | QueryAction
  | { type: 'SET_PENDING_QUERY'; payload: PendingQuery }
  | { type: 'CLEAR_PENDING_QUERY' };

const queryReducer = (
  state: ExtendedQueryState,
  action: ExtendedQueryAction,
): ExtendedQueryState => {
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
        pendingQuery: null,
      };
    case 'QUERY_FAIL':
      return {
        ...state,
        metadata: [],
        errorState: action.payload,
        loading: false,
        pendingQuery: null,
      };
    case 'DATABASE_CHANGED':
      return {
        metadata: [],
        errorState: null,
        loading: false,
        databaseId: action.payload,
        pendingQuery: null,
      };
    case 'SET_PENDING_QUERY':
      return {
        ...state,
        pendingQuery: action.payload,
      };
    case 'CLEAR_PENDING_QUERY':
      return {
        ...state,
        pendingQuery: null,
      };
    default:
      return state;
  }
};

const initialQueryState: ExtendedQueryState = {
  metadata: [],
  errorState: null,
  loading: false,
  databaseId: null,
  pendingQuery: null,
};

const Main: React.FC = () => {
  const [state, dispatch] = useReducer(queryReducer, initialQueryState);
  const [isPanelActive, setIsPanelActive] = React.useState(false);
  const isPanelActiveRef = useRef(false);

  // Check if this panel is the active one
  const checkPanelActive = (): boolean => {
    const activePanel = sqlLab.getActivePanel();
    return activePanel.id === PANEL_ID;
  };

  // Fetch query insights helper
  const fetchAndDispatchInsights = async (
    content: string,
    databaseId: number,
    schema: string,
  ) => {
    dispatch({ type: 'QUERY_START' });
    try {
      const metadata = await fetchQueryInsights(content, databaseId, schema);
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
  };

  // Effect to process pending queries when panel becomes active
  useEffect(() => {
    if (isPanelActive && state.pendingQuery) {
      fetchAndDispatchInsights(
        state.pendingQuery.content,
        state.pendingQuery.databaseId,
        state.pendingQuery.schema,
      );
    }
  }, [isPanelActive, state.pendingQuery]);

  useEffect(() => {
    const currentTab = sqlLab.getCurrentTab();
    if (currentTab?.editor?.databaseId) {
      dispatch({
        type: 'DATABASE_CHANGED',
        payload: currentTab.editor.databaseId,
      });
    }

    // Initialize panel active state
    const initialActive = checkPanelActive();
    isPanelActiveRef.current = initialActive;
    setIsPanelActive(initialActive);

    const queryRun = sqlLab.onDidQueryRun(
      (queryContext: sqlLab.QueryContext) => {
        const { editor } = queryContext.tab;

        // Only dispatch if the database is supported
        if (!SUPPORTED_DATABASE_IDS.includes(editor.databaseId)) {
          return;
        }

        // Only show loading state if panel is active
        if (isPanelActiveRef.current) {
          dispatch({ type: 'QUERY_START' });
        }
      },
    );

    const querySuccess = sqlLab.onDidQuerySuccess(
      async (queryContext: sqlLab.QueryContext) => {
        const { editor } = queryContext.tab;

        // Only process if the database is supported
        if (!SUPPORTED_DATABASE_IDS.includes(editor.databaseId)) {
          return;
        }

        if (isPanelActiveRef.current) {
          // Panel is active, fetch insights immediately
          await fetchAndDispatchInsights(
            editor.content,
            editor.databaseId,
            editor.schema,
          );
        } else {
          // Panel is inactive, store the query for later processing
          dispatch({
            type: 'SET_PENDING_QUERY',
            payload: {
              content: editor.content,
              databaseId: editor.databaseId,
              schema: editor.schema,
            },
          });
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

        // Always dispatch QUERY_FAIL to stop loading state, since Superset
        // switches to the Results panel when a query runs, making the panel
        // inactive even if it was active when the query started
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

    // Listen for panel changes to update active state
    const panelChanged = sqlLab.onDidChangeActivePanel(panel => {
      const isNowActive = panel.id === PANEL_ID;
      isPanelActiveRef.current = isNowActive;
      setIsPanelActive(isNowActive);
    });

    return () => {
      queryRun.dispose();
      querySuccess.dispose();
      queryFail.dispose();
      databaseChanged.dispose();
      panelChanged.dispose();
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
