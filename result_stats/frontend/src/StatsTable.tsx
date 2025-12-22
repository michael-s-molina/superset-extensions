import React from 'react';
import { Tag, Tooltip, Progress } from 'antd';
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

interface ProgressCellProps {
  percent: number;
  count: number;
  label: string;
  color?: string;
  danger?: boolean;
}

const ProgressCell: React.FC<ProgressCellProps> = ({ percent, count, label, color, danger }) => {
  const theme = useTheme();
  return (
    <Tooltip title={`${percent.toFixed(1)}% ${label} (${formatValue(count)})`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.marginXS }}>
        <Progress
          percent={percent}
          size="small"
          style={{ width: 50, margin: 0 }}
          showInfo={false}
          strokeColor={color}
          status={danger && percent > 50 ? 'exception' : 'normal'}
        />
        <span style={{ color: theme.colorTextSecondary }}>{percent.toFixed(1)}%</span>
      </div>
    </Tooltip>
  );
};

const MostFrequentCell: React.FC<{ freq?: { value: string | number | null; count: number } }> = ({ freq }) => {
  const theme = useTheme();
  if (!freq) return <span>-</span>;
  return (
    <Tooltip title={`Appears ${formatValue(freq.count)} times`}>
      <span>
        {formatValue(freq.value)} <span style={{ color: theme.colorTextTertiary }}>({formatValue(freq.count)})</span>
      </span>
    </Tooltip>
  );
};

interface CommonCellsProps {
  row: ColumnStats;
  cellStyle: React.CSSProperties;
  successColor: string;
}

const CommonCells: React.FC<CommonCellsProps> = ({ row, cellStyle, successColor }) => (
  <>
    <td style={cellStyle}>
      <ProgressCell percent={row.nullPercent} count={row.nullCount} label="null values" danger />
    </td>
    <td style={cellStyle}>
      <ProgressCell percent={row.distinctPercent} count={row.distinctCount} label="distinct values" color={successColor} />
    </td>
    <td style={cellStyle}><MostFrequentCell freq={row.mostFrequent} /></td>
  </>
);

const COMMON_HEADERS = ['Column', 'Nulls %', 'Distinct %', 'Most Frequent'];

interface StatsTableWrapperProps {
  headers: string[];
  data: ColumnStats[];
  renderExtraCells: (row: ColumnStats, cellStyle: React.CSSProperties) => React.ReactNode;
}

const StatsTableWrapper: React.FC<StatsTableWrapperProps> = ({ headers, data, renderExtraCells }) => {
  const theme = useTheme();
  const cellStyle = getCellStyle(theme);
  const headerStyle = getHeaderStyle(theme);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {[...COMMON_HEADERS, ...headers].map(header => (
            <th key={header} style={headerStyle}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.name}>
            <td style={{ ...cellStyle, fontWeight: theme.fontWeightStrong }}>{row.name}</td>
            <CommonCells row={row} cellStyle={cellStyle} successColor={theme.colorSuccess} />
            {renderExtraCells(row, cellStyle)}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const NumericTable: React.FC<{ data: ColumnStats[] }> = ({ data }) => (
  <StatsTableWrapper
    headers={['Min', 'Max', 'Mean', 'Median', 'Std Dev']}
    data={data}
    renderExtraCells={(row, cellStyle) => (
      <>
        <td style={cellStyle}>{formatValue(row.numericStats?.min)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.max)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.mean)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.median)}</td>
        <td style={cellStyle}>{formatValue(row.numericStats?.stdDev)}</td>
      </>
    )}
  />
);

const StringTable: React.FC<{ data: ColumnStats[] }> = ({ data }) => (
  <StatsTableWrapper
    headers={['Min Length', 'Max Length', 'Avg Length', 'Empty']}
    data={data}
    renderExtraCells={(row, cellStyle) => (
      <>
        <td style={cellStyle}>{formatValue(row.stringStats?.minLength)}</td>
        <td style={cellStyle}>{formatValue(row.stringStats?.maxLength)}</td>
        <td style={cellStyle}>{formatValue(row.stringStats?.avgLength)}</td>
        <td style={cellStyle}>{formatValue(row.stringStats?.emptyCount)}</td>
      </>
    )}
  />
);

const TemporalTable: React.FC<{ data: ColumnStats[] }> = ({ data }) => (
  <StatsTableWrapper
    headers={['Min', 'Max', 'Range']}
    data={data}
    renderExtraCells={(row, cellStyle) => (
      <>
        <td style={cellStyle}>{row.temporalStats?.min || '-'}</td>
        <td style={cellStyle}>{row.temporalStats?.max || '-'}</td>
        <td style={cellStyle}>{row.temporalStats?.rangeDescription || '-'}</td>
      </>
    )}
  />
);

const BooleanTable: React.FC<{ data: ColumnStats[] }> = ({ data }) => {
  const theme = useTheme();
  return (
    <StatsTableWrapper
      headers={['True', 'False', 'Distribution']}
      data={data}
      renderExtraCells={(row, cellStyle) => (
        <>
          <td style={cellStyle}>
            {row.booleanStats
              ? `${formatValue(row.booleanStats.trueCount)} (${formatValue(row.booleanStats.truePercent)}%)`
              : '-'}
          </td>
          <td style={cellStyle}>
            {row.booleanStats
              ? `${formatValue(row.booleanStats.falseCount)} (${formatValue(100 - row.booleanStats.truePercent)}%)`
              : '-'}
          </td>
          <td style={cellStyle}>
            {row.booleanStats ? (
              <Progress
                percent={row.booleanStats.truePercent}
                size="small"
                showInfo={false}
                strokeColor={theme.colorSuccess}
                trailColor={theme.colorError}
                style={{ width: 80 }}
              />
            ) : '-'}
          </td>
        </>
      )}
    />
  );
};

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

const StatsTable: React.FC<StatsTableProps> = ({ stats }) => {
  const theme = useTheme();

  const dataByType = {
    [core.GenericDataType.Numeric]: stats.columns.filter(c => c.typeGeneric === core.GenericDataType.Numeric),
    [core.GenericDataType.String]: stats.columns.filter(c => c.typeGeneric === core.GenericDataType.String),
    [core.GenericDataType.Temporal]: stats.columns.filter(c => c.typeGeneric === core.GenericDataType.Temporal),
    [core.GenericDataType.Boolean]: stats.columns.filter(c => c.typeGeneric === core.GenericDataType.Boolean),
  };

  const hasData = Object.values(dataByType).some(arr => arr.length > 0);

  if (!hasData) {
    return <div style={{ color: theme.colorTextTertiary, padding: theme.padding }}>No columns to display</div>;
  }

  return (
    <div>
      {Object.entries(dataByType).map(([type, data]) => (
        <TypeSection key={type} type={Number(type) as core.GenericDataType} data={data} />
      ))}
    </div>
  );
};

export default StatsTable;
