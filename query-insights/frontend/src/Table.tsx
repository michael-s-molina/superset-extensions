// eslint-disable-next-line no-restricted-syntax
import React from 'react';
import { Avatar, Tag, Tooltip } from 'antd';
import { SlackOutlined, CodeOutlined } from '@ant-design/icons';
import { theme } from '@apache-superset/core';
import { TableMetadata, OwnerTeam } from './types';
import MidasIcon from './MidasIcon';

const { useTheme } = theme;

const useTableStyles = () => {
  const t = useTheme();
  return {
    borderColor: t.colorBorderSecondary,
    headerColor: t.colorFillAlter,
    secondaryTextColor: t.colorTextSecondary,
    primaryColor: t.colorPrimary,
    bgFill: t.colorFillSecondary,
    colorText: t.colorText,
    cellStyle: {
      padding: '4px 8px',
      borderColor: t.colorBorderSecondary,
      borderWidth: 1,
      borderStyle: 'solid' as const,
    },
  };
};

const CENTERED_CELL_STYLE = {
  textAlign: 'center',
} as const;

const TRUNCATED_TEXT_STYLE = {
  maxWidth: '200px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  lineHeight: '1.3',
} as const;

// DQ Score color mapping
const getDQScoreColor = (score: number): string => {
  if (score >= 80) return '#52c41a'; // Great (green)
  if (score >= 65) return '#1890ff'; // Good (blue)
  if (score >= 45) return '#faad14'; // Okay (orange)
  return '#ff4d4f'; // Poor (red)
};

// Utility functions
const getInitials = (fullName?: string): string => {
  if (!fullName) return '?';
  return fullName
    .split(' ')
    .map(name => name[0].toUpperCase())
    .join('');
};

const formatRetentionDays = (days: number): { value: string; unit: string } => {
  if (days <= 99) {
    return { value: String(days), unit: days === 1 ? 'day' : 'days' };
  }
  if (days < 365) {
    const months = days / 30;
    const roundedMonths = Math.round(months * 10) / 10;
    const value =
      roundedMonths % 1 === 0
        ? String(Math.round(roundedMonths))
        : roundedMonths.toFixed(1);
    return {
      value,
      unit: roundedMonths === 1 ? 'month' : 'months',
    };
  }
  const years = days / 365;
  const roundedYears = Math.round(years * 10) / 10;
  const value =
    roundedYears % 1 === 0
      ? String(Math.round(roundedYears))
      : roundedYears.toFixed(1);
  return { value, unit: roundedYears === 1 ? 'year' : 'years' };
};

const getPartitionSchemeLabel = (scheme: string): string => {
  const schemeMap: { [key: string]: string } = {
    daily: 'D',
    month_end: 'ME',
    month_start: 'MS',
    quarter_end: 'QE',
    quarter_start: 'QS',
    week_start_sun: 'W',
    year_end: 'YE',
    year_start: 'YS',
  };
  return schemeMap[scheme] || scheme.toUpperCase();
};

const getPartitionSchemeTooltip = (scheme: string): string => {
  const tooltipMap: { [key: string]: string } = {
    daily: 'Daily partitions',
    month_end: 'End of month partitions',
    month_start: 'Start of month partitions',
    quarter_end: 'End of quarter partitions',
    quarter_start: 'Start of quarter partitions',
    week_start_sun: 'Weekly partitions starting on Sunday',
    year_end: 'End of year partitions',
    year_start: 'Start of year partitions',
  };
  return tooltipMap[scheme] || scheme;
};

const formatPartitionTag = (
  scheme?: string,
  outputDelay?: number,
): { label: string; tooltip: string } | null => {
  if (!scheme) return null;

  const schemeLabel = getPartitionSchemeLabel(scheme);
  const schemeTooltip = getPartitionSchemeTooltip(scheme);

  if (outputDelay && outputDelay > 0) {
    return {
      label: `${schemeLabel}+${outputDelay}`,
      tooltip: `${schemeTooltip} with output delay of ${outputDelay} ${
        outputDelay === 1 ? 'day' : 'days'
      }`,
    };
  }

  return {
    label: schemeLabel,
    tooltip: schemeTooltip,
  };
};

const EmptyStateSpan: React.FC = () => (
  <span style={{ display: 'block', textAlign: 'center' }}>-</span>
);

const TableLink: React.FC<{
  table: string;
}> = ({ table }) => {
  const { primaryColor } = useTableStyles();
  return (
    <span
      style={{
        color: primaryColor,
        fontWeight: 'bold',
      }}
    >
      {table}
    </span>
  );
};

const DescriptionCell: React.FC<{ description?: string }> = ({
  description,
}) => {
  const { cellStyle } = useTableStyles();
  return (
  <td style={cellStyle}>
    {description ? (
      <Tooltip title={description}>
        <div style={TRUNCATED_TEXT_STYLE}>{description}</div>
      </Tooltip>
    ) : (
      <EmptyStateSpan />
    )}
  </td>
  );
};

const MemberAvatars: React.FC<{
  members: Array<{ name?: string; profilePictureUrl?: string }>;
}> = ({ members }) => {
  const { borderColor, bgFill, secondaryTextColor } = useTableStyles();
  return (
    <div>
      {members.slice(0, 3).map((member, idx) => (
        <Tooltip title={member.name || 'Unknown member'} key={idx}>
          <Avatar
            src={member.profilePictureUrl}
            alt={member.name || 'Unknown member'}
            size="small"
            style={{ marginRight: 2, borderColor }}
          >
            {getInitials(member.name)}
          </Avatar>
        </Tooltip>
      ))}
      {members.length > 3 && (
        <Avatar
          size="small"
          style={{ backgroundColor: bgFill, color: secondaryTextColor }}
        >
          +{members.length - 3}
        </Avatar>
      )}
    </div>
  );
};

const OwnerTeamCell: React.FC<{ ownerTeam?: OwnerTeam }> = ({ ownerTeam }) => {
  const { cellStyle, secondaryTextColor } = useTableStyles();
  return (
    <td style={cellStyle}>
      {ownerTeam ? (
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            {ownerTeam.name}
          </div>
          {ownerTeam.slackChannel && (
            <div style={{ marginBottom: '8px' }}>
              <SlackOutlined style={{ marginRight: '4px' }} />
              <span style={{ fontSize: '11px', color: secondaryTextColor }}>
                #{ownerTeam.slackChannel}
              </span>
            </div>
          )}
          {ownerTeam.members && ownerTeam.members.length > 0 && (
            <MemberAvatars members={ownerTeam.members} />
          )}
        </div>
      ) : (
        <EmptyStateSpan />
      )}
    </td>
  );
};

const DQScoreCell: React.FC<{ dqScore?: { dataQualityScore?: number } }> = ({
  dqScore,
}) => {
  const { cellStyle, secondaryTextColor } = useTableStyles();
  return (
    <td style={cellStyle}>
      <div style={CENTERED_CELL_STYLE}>
        {dqScore?.dataQualityScore != null ? (
          <>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: getDQScoreColor(dqScore.dataQualityScore),
              }}
            >
              {dqScore.dataQualityScore}
            </div>
            <div style={{ fontSize: '10px', color: secondaryTextColor }}>
              Quality Score
            </div>
          </>
        ) : (
          <EmptyStateSpan />
        )}
      </div>
    </td>
  );
};

const MidasCertifiedCell: React.FC<{
  isCertified?: boolean;
}> = ({ isCertified }) => {
  const { cellStyle } = useTableStyles();
  return (
    <td style={cellStyle}>
      <div style={CENTERED_CELL_STYLE}>
        {isCertified ? (
          <Tooltip title="Midas Certified">
            <MidasIcon size={24} />
          </Tooltip>
        ) : (
          <EmptyStateSpan />
        )}
      </div>
    </td>
  );
};

const RetentionDaysCell: React.FC<{ retentionDays?: number }> = ({
  retentionDays,
}) => {
  const { cellStyle } = useTableStyles();

  if (retentionDays == null) {
    return (
      <td style={cellStyle}>
        <div style={CENTERED_CELL_STYLE}>
          <EmptyStateSpan />
        </div>
      </td>
    );
  }

  const { value, unit } = formatRetentionDays(retentionDays);
  const content = (
    <div style={{ fontSize: '12px' }}>
      {value} {unit}
    </div>
  );

  return (
    <td style={cellStyle}>
      <div style={CENTERED_CELL_STYLE}>
        {retentionDays > 99 ? (
          <Tooltip title={`${retentionDays} days`}>
            <div style={{ cursor: 'help' }}>{content}</div>
          </Tooltip>
        ) : (
          content
        )}
      </div>
    </td>
  );
};

const LatestPartitionCell: React.FC<{
  latestPartition?: string;
  partitionScheme?: string;
  outputDelay?: number;
}> = ({ latestPartition, partitionScheme, outputDelay }) => {
  const { cellStyle } = useTableStyles();
  const partitionTag = formatPartitionTag(partitionScheme, outputDelay);

  return (
    <td style={cellStyle}>
      <div style={CENTERED_CELL_STYLE}>
        {latestPartition ? (
          <div style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
            {partitionTag && (
              <Tooltip title={partitionTag.tooltip}>
                <Tag
                  color="default"
                  style={{ marginRight: '8px', cursor: 'help' }}
                >
                  {partitionTag.label}
                </Tag>
              </Tooltip>
            )}
            {latestPartition}
          </div>
        ) : (
          <EmptyStateSpan />
        )}
      </div>
    </td>
  );
};

const ExampleQueriesCell: React.FC<{ exampleQueries?: string[] }> = ({
  exampleQueries,
}) => {
  const { cellStyle, bgFill, colorText, primaryColor } = useTableStyles();
  return (
    <td style={cellStyle}>
      <div style={CENTERED_CELL_STYLE}>
        {exampleQueries && exampleQueries.length > 0 ? (
          <Tooltip
            title={
              <div
                style={{
                  maxHeight: '300px',
                  overflow: 'auto',
                  maxWidth: '600px',
                }}
              >
                {exampleQueries.map((query, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom:
                        idx < exampleQueries.length - 1 ? '16px' : '0',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                      Query {idx + 1}:
                    </div>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: '11px',
                        backgroundColor: bgFill,
                        color: colorText,
                        padding: '8px',
                        borderRadius: '4px',
                        margin: 0,
                      }}
                    >
                      {query}
                    </pre>
                  </div>
                ))}
              </div>
            }
            placement="left"
            // @ts-ignore - overlayStyle is deprecated but still functional
            overlayStyle={{ maxWidth: '600px' }}
          >
            <CodeOutlined
              style={{ fontSize: '16px', color: primaryColor, cursor: 'pointer' }}
            />
          </Tooltip>
        ) : (
          <EmptyStateSpan />
        )}
      </div>
    </td>
  );
};

const Table: React.FC<{
  metadata: TableMetadata[];
}> = ({ metadata }) => {
  const { borderColor, headerColor, cellStyle } = useTableStyles();
  return (
    <table
      style={{
        width: '100%',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor,
        fontSize: '12px',
      }}
    >
      <thead>
        <tr>
          <th style={{ ...cellStyle, background: headerColor }}>Table</th>
          <th style={{ ...cellStyle, background: headerColor }}>
            Description
          </th>
          <th style={{ ...cellStyle, background: headerColor }}>DQ Score</th>
          <th style={{ ...cellStyle, background: headerColor }}>
            Midas Certified
          </th>
          <th style={{ ...cellStyle, background: headerColor }}>
            Latest Partition
          </th>
          <th style={{ ...cellStyle, background: headerColor }}>Retention</th>
          <th style={{ ...cellStyle, background: headerColor }}>
            Owner Team
          </th>
          <th style={{ ...cellStyle, background: headerColor }}>
            Example Queries
          </th>
        </tr>
      </thead>
      <tbody>
        {metadata?.length > 0 ? (
          metadata.map((row, index) => (
            <tr key={index}>
              <td style={cellStyle}>
                <TableLink table={row.name} />
              </td>
              <DescriptionCell description={row.description} />
              <DQScoreCell dqScore={row.dqScore} />
              <MidasCertifiedCell isCertified={row.isMidasCertified} />
              <LatestPartitionCell
                latestPartition={row.latestPartition}
                partitionScheme={row.partitionScheme}
                outputDelay={row.outputDelay}
              />
              <RetentionDaysCell retentionDays={row.retentionDays} />
              <OwnerTeamCell ownerTeam={row.ownerTeam} />
              <ExampleQueriesCell exampleQueries={row.exampleQueries} />
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={8} style={cellStyle}>
              No data available
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

export default Table;
