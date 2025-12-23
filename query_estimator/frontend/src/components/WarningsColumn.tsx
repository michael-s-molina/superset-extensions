import React from 'react';
import {
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTheme } from '@apache-superset/core';
import { Warning } from '../types';
import { getSectionHeaderStyle } from '../styles';

interface WarningsColumnProps {
  warnings: Warning[];
}

export const WarningsColumn: React.FC<WarningsColumnProps> = ({ warnings }) => {
  const theme = useTheme();

  const getWarningIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <ExclamationCircleOutlined style={{ color: theme.colorError }} />;
      case 'warning':
        return <WarningOutlined style={{ color: theme.colorWarning }} />;
      case 'info':
        return <InfoCircleOutlined style={{ color: theme.colorInfo }} />;
      default:
        return <InfoCircleOutlined style={{ color: theme.colorTextSecondary }} />;
    }
  };

  if (warnings.length === 0) {
    return (
      <div>
        <div style={getSectionHeaderStyle(theme)}>Warnings</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.marginXS,
            color: theme.colorSuccess,
            padding: theme.paddingSM,
            background: theme.colorSuccessBg,
            borderRadius: theme.borderRadius,
          }}
        >
          <CheckCircleOutlined />
          <span>No warnings</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={getSectionHeaderStyle(theme)}>Warnings ({warnings.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.marginSM }}>
        {warnings.map((warning, index) => (
          <div
            key={index}
            style={{
              padding: theme.paddingSM,
              background: theme.colorBgContainer,
              borderRadius: theme.borderRadius,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.marginXS,
                fontWeight: theme.fontWeightStrong,
                marginBottom: theme.marginXS,
              }}
            >
              {getWarningIcon(warning.severity)}
              <span>{warning.title}</span>
            </div>
            <div
              style={{
                fontSize: theme.fontSizeSM,
                color: theme.colorTextSecondary,
                marginBottom: warning.recommendation ? theme.marginXS : 0,
              }}
            >
              {warning.description}
            </div>
            {warning.recommendation && (
              <div
                style={{
                  fontSize: theme.fontSizeSM,
                  color: theme.colorPrimary,
                }}
              >
                {warning.recommendation}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
