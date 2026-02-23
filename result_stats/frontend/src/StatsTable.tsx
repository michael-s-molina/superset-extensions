import React from 'react';
import { Tag, Tooltip } from 'antd';
import { core, useTheme, SupersetTheme } from '@apache-superset/core';
import { ColumnStats, ResultStats } from './types';

const TYPE_CONFIG: Record<core.GenericDataType, { label: string; color: string }> = {
  [core.GenericDataType.Numeric]: { label: 'number', color: 'green' },
  [core.GenericDataType.String]: { label: 'string', color: 'blue' },
  [core.GenericDataType.Temporal]: { label: 'date', color: 'purple' },
  [core.GenericDataType.Boolean]: { label: 'boolean', color: 'orange' },
};

const formatValue = (value: string | number | null | undefined): string => {
  if (value === null) return 'NULL';
  if (value === undefined) return '-';
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof value === 'string' && value.length > 30) {
    return value.substring(0, 30) + '...';
  }
  return String(value);
};

const getCellStyle = (theme: SupersetTheme): React.CSSProperties => ({
  padding: `${theme.paddingXS}px ${theme.paddingSM}px`,
  borderBottom: `${theme.lineWidth}px solid ${theme.colorBorderSecondary}`,
  fontSize: theme.fontSizeSM,
  textAlign: 'left',
});

const getHeaderStyle = (theme: SupersetTheme): React.CSSProperties => ({
  ...getCellStyle(theme),
  fontWeight: theme.fontWeightStrong,
  backgroundColor: theme.colorFillAlter,
  borderBottom: `${theme.lineWidth}px solid ${theme.colorBorder}`,
});

// Reusable cell components

const CountCell: React.FC<{ value: number; percent: number; label?: string }> = ({ value, percent, label }) => {
  const theme = useTheme();
  const content = (
    <span>
      {formatValue(value)}{' '}
      <span style={{ color: theme.colorTextTertiary }}>({percent.toFixed(1)}%)</span>
    </span>
  );
  return label ? <Tooltip title={label}>{content}</Tooltip> : content;
};

const TopFrequentCell: React.FC<{ entries: { value: string | number | null; count: number }[] }> = ({ entries }) => {
  const theme = useTheme();
  if (!entries || entries.length === 0) return <span>-</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.marginXXS }}>
      {entries.map((entry, i) => (
        <span key={i}>
          {formatValue(entry.value)}{' '}
          <span style={{ color: theme.colorTextTertiary }}>({formatValue(entry.count)})</span>
        </span>
      ))}
    </div>
  );
};

// Reusable cell renderers

const renderNameCell = (row: ColumnStats, cellStyle: React.CSSProperties, theme: SupersetTheme) => (
  <td style={{ ...cellStyle, fontWeight: theme.fontWeightStrong }}>{row.name}</td>
);

const renderEmptyCell = (row: ColumnStats, cellStyle: React.CSSProperties) => (
  <td style={cellStyle}>
    <CountCell value={row.emptyCount} percent={row.emptyPercent} label="null or empty values" />
  </td>
);

const renderDistinctCell = (row: ColumnStats, cellStyle: React.CSSProperties) => (
  <td style={cellStyle}>
    <CountCell value={row.distinctCount} percent={row.distinctPercent} label="distinct non-empty values" />
  </td>
);

const renderTopValueCell = (row: ColumnStats, cellStyle: React.CSSProperties) => (
  <td style={cellStyle}><TopFrequentCell entries={row.topFrequent} /></td>
);

const renderZeroCell = (row: ColumnStats, cellStyle: React.CSSProperties) => (
  <td style={cellStyle}>
    {row.numericStats
      ? <CountCell value={row.numericStats.zeroCount} percent={row.numericStats.zeroPercent} label="zero values" />
      : '-'}
  </td>
);

const renderCommonCells = (row: ColumnStats, cellStyle: React.CSSProperties, theme: SupersetTheme) => (
  <>
    {renderNameCell(row, cellStyle, theme)}
    {renderEmptyCell(row, cellStyle)}
    {renderDistinctCell(row, cellStyle)}
    {renderTopValueCell(row, cellStyle)}
  </>
);

// Table wrapper — purely structural

interface StatsTableWrapperProps {
  headers: string[];
  data: ColumnStats[];
  renderCells: (row: ColumnStats, cellStyle: React.CSSProperties, theme: SupersetTheme) => React.ReactNode;
}

const StatsTableWrapper: React.FC<StatsTableWrapperProps> = ({ headers, data, renderCells }) => {
  const theme = useTheme();
  const cellStyle = getCellStyle(theme);
  const headerStyle = getHeaderStyle(theme);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {headers.map(header => (
            <th key={header} style={headerStyle}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.name}>{renderCells(row, cellStyle, theme)}</tr>
        ))}
      </tbody>
    </table>
  );
};

// Type-specific tables

const NumericTable: React.FC<{ data: ColumnStats[] }> = ({ data }) => (
  <StatsTableWrapper
    headers={['Column', 'Empty', 'Zeros', 'Distinct', 'Most Frequent', 'Min', 'Max', 'Mean', 'Std Dev', 'P25', 'P50', 'P75']}
    data={data}
    renderCells={(row, cellStyle, theme) => (
      <>
        {renderNameCell(row, cellStyle, theme)}
        {renderEmptyCell(row, cellStyle)}
        {renderZeroCell(row, cellStyle)}
        {renderDistinctCell(row, cellStyle)}
        {renderTopValueCell(row, cellStyle)}
        <td style={cellStyle}>{formatValue(row.numericStats?.min)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.max)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.mean)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.stdDev)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.p25)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.p50)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.p75)}</td>
      </>
    )}
  />
);

const StringTable: React.FC<{ data: ColumnStats[] }> = ({ data }) => (
  <StatsTableWrapper
    headers={['Column', 'Empty', 'Distinct', 'Most Frequent', 'Min Length', 'Max Length', 'Avg Length']}
    data={data}
    renderCells={(row, cellStyle, theme) => (
      <>
        {renderCommonCells(row, cellStyle, theme)}
        <td style={cellStyle}>{formatValue(row.stringStats?.minLength)}</td>
        <td style={cellStyle}>{formatValue(row.stringStats?.maxLength)}</td>
        <td style={cellStyle}>{formatValue(row.stringStats?.avgLength)}</td>
      </>
    )}
  />
);

const TemporalTable: React.FC<{ data: ColumnStats[] }> = ({ data }) => (
  <StatsTableWrapper
    headers={['Column', 'Empty', 'Distinct', 'Most Frequent', 'Min', 'Max', 'Range']}
    data={data}
    renderCells={(row, cellStyle, theme) => (
      <>
        {renderCommonCells(row, cellStyle, theme)}
        <td style={cellStyle}>{row.temporalStats?.min || '-'}</td>
        <td style={cellStyle}>{row.temporalStats?.max || '-'}</td>
        <td style={cellStyle}>{row.temporalStats?.rangeDescription || '-'}</td>
      </>
    )}
  />
);

const BooleanTable: React.FC<{ data: ColumnStats[] }> = ({ data }) => (
  <StatsTableWrapper
    headers={['Column', 'Empty', 'Most Frequent', 'True', 'False']}
    data={data}
    renderCells={(row, cellStyle, theme) => {
      const bs = row.booleanStats;
      return (
        <>
          {renderNameCell(row, cellStyle, theme)}
          {renderEmptyCell(row, cellStyle)}
          {renderTopValueCell(row, cellStyle)}
          <td style={cellStyle}>
            {bs ? <CountCell value={bs.trueCount} percent={bs.truePercent} label="true values" /> : '-'}
          </td>
          <td style={cellStyle}>
            {bs ? <CountCell value={bs.falseCount} percent={bs.falsePercent} label="false values" /> : '-'}
          </td>
        </>
      );
    }}
  />
);

const TABLE_COMPONENTS: Record<core.GenericDataType, React.FC<{ data: ColumnStats[] }>> = {
  [core.GenericDataType.Numeric]: NumericTable,
  [core.GenericDataType.String]: StringTable,
  [core.GenericDataType.Temporal]: TemporalTable,
  [core.GenericDataType.Boolean]: BooleanTable,
};

interface TypeSectionProps {
  type: core.GenericDataType;
  data: ColumnStats[];
}

const TypeSection: React.FC<TypeSectionProps> = ({ type, data }) => {
  const theme = useTheme();
  const config = TYPE_CONFIG[type];
  const TableComponent = TABLE_COMPONENTS[type];

  if (!config || !TableComponent || data.length === 0) return null;

  return (
    <div style={{ marginBottom: theme.marginLG }}>
      <div style={{ marginBottom: theme.marginXS, fontSize: theme.fontSizeSM }}>
        <Tag color={config.color} style={{ marginRight: theme.marginXXS }}>{config.label}</Tag>({data.length})
      </div>
      <TableComponent data={data} />
    </div>
  );
};

interface StatsTableProps {
  stats: ResultStats;
}

const TYPE_ORDER = [
  core.GenericDataType.Numeric,
  core.GenericDataType.String,
  core.GenericDataType.Temporal,
  core.GenericDataType.Boolean,
] as const;

const StatsTable: React.FC<StatsTableProps> = ({ stats }) => {
  const theme = useTheme();

  const dataByType = stats.columns.reduce<Partial<Record<core.GenericDataType, ColumnStats[]>>>(
    (acc, col) => {
      const bucket = acc[col.typeGeneric];
      if (bucket) {
        bucket.push(col);
      } else {
        acc[col.typeGeneric] = [col];
      }
      return acc;
    },
    {},
  );

  const hasData = TYPE_ORDER.some(type => (dataByType[type]?.length ?? 0) > 0);

  if (!hasData) {
    return <div style={{ color: theme.colorTextTertiary, padding: theme.padding }}>No columns to display</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: theme.marginMD, color: theme.colorText, fontSize: theme.fontSizeSM }}>
        Statistics are computed on the {stats.rowCount.toLocaleString()} row{stats.rowCount !== 1 ? 's' : ''} and {stats.columnCount} column{stats.columnCount !== 1 ? 's' : ''} returned by the query.
      </div>
      {TYPE_ORDER.map(type => (
        <TypeSection key={type} type={type} data={dataByType[type] ?? []} />
      ))}
    </div>
  );
};

export default StatsTable;
