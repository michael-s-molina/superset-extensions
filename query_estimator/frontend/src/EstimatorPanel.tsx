import React, { useReducer } from 'react';
import { Button, Spin, Alert } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useTheme, authentication, sqlLab } from '@apache-superset/core';
import { ResourceGauge } from './components/ResourceGauge';
import { MetricsColumn } from './components/MetricsColumn';
import { WarningsColumn } from './components/WarningsColumn';
import { PlanTree } from './components/PlanTree';
import { EstimationState, EstimationAction, EstimationResult } from './types';
import { getCenteredContainerStyle, getColumnStyle, getSectionHeaderStyle } from './styles';

const initialState: EstimationState = {
  loading: false,
  error: null,
  result: null,
};

function estimationReducer(state: EstimationState, action: EstimationAction): EstimationState {
  switch (action.type) {
    case 'ESTIMATE_START':
      return { loading: true, error: null, result: null };
    case 'ESTIMATE_SUCCESS':
      return { loading: false, error: null, result: action.payload };
    case 'ESTIMATE_ERROR':
      return { loading: false, error: action.payload, result: null };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

async function fetchEstimation(
  sql: string,
  databaseId: number,
  catalog: string | null,
  schema: string,
): Promise<EstimationResult> {
  const csrfToken = await authentication.getCSRFToken();
  const response = await fetch('/extensions/query_estimator/estimate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken!,
    },
    body: JSON.stringify({
      sql,
      databaseId,
      catalog,
      schema,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.result;
}

export const EstimatorPanel: React.FC = () => {
  const theme = useTheme();
  const [state, dispatch] = useReducer(estimationReducer, initialState);

  const handleEstimate = async () => {
    const currentTab = sqlLab.getCurrentTab();
    if (!currentTab) {
      dispatch({ type: 'ESTIMATE_ERROR', payload: 'No active SQL Lab tab found' });
      return;
    }

    const editor = await currentTab.getEditor();
    const content = editor.getValue();

    if (!content.trim()) {
      dispatch({ type: 'ESTIMATE_ERROR', payload: 'Please enter a SQL query' });
      return;
    }

    dispatch({ type: 'ESTIMATE_START' });

    try {
      const result = await fetchEstimation(
        content,
        currentTab.databaseId,
        currentTab.catalog,
        currentTab.schema ?? '',
      );
      dispatch({ type: 'ESTIMATE_SUCCESS', payload: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to estimate query';
      dispatch({ type: 'ESTIMATE_ERROR', payload: message });
    }
  };

  // Empty state
  if (!state.loading && !state.error && !state.result) {
    return (
      <div style={{ ...getCenteredContainerStyle(theme), gap: theme.marginMD, color: theme.colorTextSecondary }}>
        <ThunderboltOutlined style={{ fontSize: 48, opacity: 0.3 }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: theme.marginSM }}>
            Analyze your query before running it
          </div>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={handleEstimate}>
            Estimate Query
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (state.loading) {
    return (
      <div style={{ ...getCenteredContainerStyle(theme), gap: theme.marginSM }}>
        <Spin size="large" />
        <span style={{ color: theme.colorTextSecondary }}>Analyzing query...</span>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div style={{ padding: theme.paddingMD }}>
        <Alert
          message="Estimation Failed"
          description={state.error}
          type="error"
          showIcon
          style={{ marginBottom: theme.marginMD }}
        />
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={handleEstimate}>
          Try Again
        </Button>
      </div>
    );
  }

  // Results - Three column layout
  const { result } = state;
  if (!result) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with Re-estimate button */}
      <div
        style={{
          padding: `${theme.paddingSM}px ${theme.paddingMD}px`,
          borderBottom: `1px solid ${theme.colorBorderSecondary}`,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <Button
          type="default"
          size="small"
          icon={<ThunderboltOutlined />}
          onClick={handleEstimate}
        >
          Re-estimate
        </Button>
      </div>

      {/* Three column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Column 1: Gauge + Metrics (25%) */}
        <div style={getColumnStyle(theme, '25%', 200, true)}>
          <ResourceGauge level={result.resourceLevel} />
          <div style={{ marginTop: theme.marginMD }}>
            <MetricsColumn metrics={result.metrics} engineType={result.engineType} />
          </div>
        </div>

        {/* Column 2: Warnings (25%) */}
        <div style={getColumnStyle(theme, '25%', 200, true)}>
          <WarningsColumn warnings={result.warnings} />
        </div>

        {/* Column 3: Query Plan (50%) */}
        <div style={getColumnStyle(theme, '50%', 300)}>
          <div style={getSectionHeaderStyle(theme)}>Query Plan</div>
          {result.planTree ? (
            <PlanTree plan={result.planTree} />
          ) : (
            <div style={{ color: theme.colorTextSecondary }}>
              No plan data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
