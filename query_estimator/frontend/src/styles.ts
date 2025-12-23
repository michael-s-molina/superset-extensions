import { SupersetTheme } from '@apache-superset/core';
import { CSSProperties } from 'react';

export const getSectionHeaderStyle = (theme: SupersetTheme): CSSProperties => ({
  fontSize: theme.fontSizeSM,
  color: theme.colorTextSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: theme.marginSM,
});

export const getCenteredContainerStyle = (theme: SupersetTheme): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.paddingLG * 2,
  height: '100%',
});

export const getColumnStyle = (
  theme: SupersetTheme,
  width: string,
  minWidth: number,
  hasBorderRight: boolean = false,
): CSSProperties => ({
  width,
  minWidth,
  ...(hasBorderRight && { borderRight: `1px solid ${theme.colorBorderSecondary}` }),
  padding: theme.paddingMD,
  overflowY: 'auto',
});
