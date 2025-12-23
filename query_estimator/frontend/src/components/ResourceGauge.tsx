import React from 'react';
import { Progress } from 'antd';
import { useTheme } from '@apache-superset/core';
import { ResourceLevel } from '../types';
import { getSectionHeaderStyle } from '../styles';

interface ResourceGaugeProps {
  level: ResourceLevel;
}

export const ResourceGauge: React.FC<ResourceGaugeProps> = ({ level }) => {
  const theme = useTheme();

  const getLevelConfig = (level: ResourceLevel) => {
    switch (level) {
      case 'low':
        return { percent: 25, color: theme.colorSuccess, label: 'Low' };
      case 'medium':
        return { percent: 50, color: theme.colorWarning, label: 'Medium' };
      case 'high':
        return { percent: 75, color: theme.colorWarningActive, label: 'High' };
      case 'critical':
        return { percent: 100, color: theme.colorError, label: 'Critical' };
    }
  };

  const config = getLevelConfig(level);

  return (
    <div style={{ marginBottom: theme.marginMD }}>
      <div style={{ ...getSectionHeaderStyle(theme), marginBottom: theme.marginXS }}>
        Resource Impact
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.marginSM }}>
        <Progress
          percent={config.percent}
          showInfo={false}
          strokeColor={config.color}
          trailColor={theme.colorBgContainer}
          style={{ flex: 1, margin: 0 }}
        />
        <span
          style={{
            color: config.color,
            fontWeight: theme.fontWeightStrong,
            minWidth: 60,
          }}
        >
          {config.label}
        </span>
      </div>
    </div>
  );
};
