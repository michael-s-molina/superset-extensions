import React, { useEffect, useReducer } from 'react';
import { Alert, Spin } from 'antd';
import { sqlLab, useTheme } from '@apache-superset/core';
import StatsTable from './StatsTable';
import { computeStats } from './computeStats';
import { StatsState, StatsAction, ResultStats } from './types';

const statsReducer = (state: StatsState, action: StatsAction): StatsState => {
  switch (action.type) {
    case 'COMPUTE_START':
      return { stats: null, loading: true, error: null };
    case 'COMPUTE_SUCCESS':
      return { stats: action.payload, loading: false, error: null };
    case 'COMPUTE_ERROR':
      return { stats: null, loading: false, error: action.payload };
    case 'CLEAR':
      return { stats: null, loading: false, error: null };
    default:
      return state;
  }
};

const initialState: StatsState = {
  stats: null,
  loading: false,
  error: null,
};

const Main: React.FC = () => {
  const theme = useTheme();
  const [state, dispatch] = useReducer(statsReducer, initialState);

  useEffect(() => {
    const queryRun = sqlLab.onDidQueryRun(() => {
      dispatch({ type: 'COMPUTE_START' });
    });

    const querySuccess = sqlLab.onDidQuerySuccess(
      async (queryContext: sqlLab.QueryResultContext) => {
        try {
          const { result } = queryContext;
          if (!result || !result.data || result.data.length === 0) {
            dispatch({ type: 'CLEAR' });
            return;
          }

          const stats: ResultStats = computeStats(result.data, result.columns);
          dispatch({ type: 'COMPUTE_SUCCESS', payload: stats });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to compute statistics';
          dispatch({ type: 'COMPUTE_ERROR', payload: message });
        }
      },
    );

    const queryFail = sqlLab.onDidQueryFail(() => {
      dispatch({
        type: 'COMPUTE_ERROR',
        payload: 'Cannot compute statistics for failed query',
      });
    });

    return () => {
      queryRun.dispose();
      querySuccess.dispose();
      queryFail.dispose();
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
