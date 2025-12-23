import React from 'react';
import { useTheme } from '@apache-superset/core';
import { EstimationMetrics } from '../types';
import { getSectionHeaderStyle } from '../styles';

interface MetricsColumnProps {
  metrics: EstimationMetrics;
  engineType: string;
}

interface MetricRowProps {
  label: string;
  value: string;
}

const MetricRow: React.FC<MetricRowProps> = ({ label, value }) => {
  const theme = useTheme();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: `${theme.paddingXS}px 0`,
        borderBottom: `1px solid ${theme.colorBorderSecondary}`,
      }}
    >
      <span style={{ color: theme.colorTextSecondary }}>{label}</span>
      <span style={{ fontWeight: theme.fontWeightStrong }}>{value}</span>
    </div>
  );
};

export const MetricsColumn: React.FC<MetricsColumnProps> = ({ metrics, engineType }) => {
  const theme = useTheme();

  // Build metrics list based on what's available
  const metricRows: { label: string; value: string }[] = [];

  metricRows.push({ label: 'Rows', value: metrics.rowsLabel });

  if (engineType === 'postgres') {
    metricRows.push({ label: 'Cost', value: metrics.costLabel });
  }

  if (engineType === 'trino') {
    metricRows.push({ label: 'Memory', value: metrics.memoryLabel });
  }

  metricRows.push({ label: 'Time', value: metrics.executionTimeLabel });

  return (
    <div>
      <div style={getSectionHeaderStyle(theme)}>Metrics</div>
      <div>
        {metricRows.map((row) => (
          <MetricRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
};
