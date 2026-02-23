import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import { sqlLab, useTheme } from '@apache-superset/core';
import StatsTable from './StatsTable';
import { computeStats } from './computeStats';
import { StatsState, StatsAction, ResultStats, PendingResult } from './types';

const PANEL_ID = 'result_stats.main';

const statsReducer = (state: StatsState, action: StatsAction): StatsState => {
  switch (action.type) {
    case 'COMPUTE_START':
      return { ...state, stats: null, loading: true, error: null, pendingResult: null };
    case 'COMPUTE_SUCCESS':
      return { stats: action.payload, loading: false, error: null, pendingResult: null };
    case 'COMPUTE_ERROR':
      return { stats: null, loading: false, error: action.payload, pendingResult: null };
    case 'SET_PENDING':
      return { stats: null, loading: false, error: null, pendingResult: action.payload };
    case 'CLEAR':
      return { stats: null, loading: false, error: null, pendingResult: null };
    default:
      return state;
  }
};

const initialState: StatsState = {
  stats: null,
  loading: false,
  error: null,
  pendingResult: null,
};

const computeAndDispatch = (
  pending: PendingResult,
  dispatch: React.Dispatch<StatsAction>,
) => {
  try {
    const stats: ResultStats = computeStats(pending.data, pending.columns);
    dispatch({ type: 'COMPUTE_SUCCESS', payload: stats });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to compute statistics';
    dispatch({ type: 'COMPUTE_ERROR', payload: message });
  }
};

const Main: React.FC = () => {
  const theme = useTheme();
  const [state, dispatch] = useReducer(statsReducer, initialState);
  const [isPanelActive, setIsPanelActive] = useState(
    () => sqlLab.getActivePanel().id === PANEL_ID,
  );
  const isPanelActiveRef = useRef(isPanelActive);

  useEffect(() => {
    if (isPanelActive && state.pendingResult) {
      dispatch({ type: 'COMPUTE_START' });
      computeAndDispatch(state.pendingResult, dispatch);
    }
  }, [isPanelActive, state.pendingResult]);

  useEffect(() => {
    const queryRun = sqlLab.onDidQueryRun(() => {
      if (isPanelActiveRef.current) {
        dispatch({ type: 'COMPUTE_START' });
      }
    });

    const querySuccess = sqlLab.onDidQuerySuccess(
      (queryContext: sqlLab.QueryResultContext) => {
        const { result } = queryContext;
        if (!result || !result.data || result.data.length === 0) {
          dispatch({ type: 'CLEAR' });
          return;
        }

        if (isPanelActiveRef.current) {
          dispatch({ type: 'COMPUTE_START' });
          computeAndDispatch({ data: result.data, columns: result.columns }, dispatch);
        } else {
          dispatch({
            type: 'SET_PENDING',
            payload: { data: result.data, columns: result.columns },
          });
        }
      },
    );

    const queryFail = sqlLab.onDidQueryFail(() => {
      dispatch({
        type: 'COMPUTE_ERROR',
        payload: 'Cannot compute statistics for failed query',
      });
    });

    const panelChanged = sqlLab.onDidChangeActivePanel(panel => {
      const isNowActive = panel.id === PANEL_ID;
      isPanelActiveRef.current = isNowActive;
      setIsPanelActive(isNowActive);
    });

    return () => {
      queryRun.dispose();
      querySuccess.dispose();
      queryFail.dispose();
      panelChanged.dispose();
    };
  }, []);

  if (state.loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.padding,
        }}
      >
        <Spin size="default" />
        <span style={{ marginLeft: theme.marginXS, color: theme.colorTextSecondary, fontSize: theme.fontSizeSM }}>
          Computing statistics...
        </span>
      </div>
    );
  }

  if (state.error) {
    return <Alert message={state.error} type="error" />;
  }

  if (!state.stats) {
    return (
      <Alert
        message="Run a query to see result statistics"
        type="info"
      />
    );
  }

  return <StatsTable stats={state.stats} />;
};

export default Main;
