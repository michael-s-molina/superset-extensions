import React, { useState, useMemo } from 'react';
import { Tree } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useTheme, SupersetTheme } from '@apache-superset/core';
import type { DataNode } from 'antd/es/tree';
import { PlanNode } from '../types';

interface PlanTreeProps {
  plan: PlanNode;
}

function formatNumber(num: number | undefined): string {
  if (num === undefined) return '';
  if (num < 1000) return num.toString();
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}K`;
  if (num < 1_000_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  return `${(num / 1_000_000_000).toFixed(1)}B`;
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined) return '';
  if (cost < 1000) return cost.toFixed(0);
  if (cost < 1_000_000) return `${(cost / 1000).toFixed(1)}K`;
  return `${(cost / 1_000_000).toFixed(1)}M`;
}

function buildNodeTitle(node: PlanNode, theme: SupersetTheme): React.ReactNode {
  const parts: React.ReactNode[] = [];

  // Node type (bold)
  parts.push(
    <span key="type" style={{ fontWeight: theme.fontWeightStrong }}>
      {node.nodeType}
    </span>
  );

  // Table name if present
  if (node.details?.table) {
    parts.push(
      <span key="table" style={{ color: theme.colorPrimary, marginLeft: 4 }}>
        {node.details.table}
      </span>
    );
  }

  // Index name if present
  if (node.details?.index) {
    parts.push(
      <span key="index" style={{ color: theme.colorSuccess, marginLeft: 4 }}>
        [{node.details.index}]
      </span>
    );
  }

  // Rows and cost in a lighter color
  const metrics: string[] = [];
  if (node.rows !== undefined) {
    metrics.push(`${formatNumber(node.rows)} rows`);
  }
  if (node.cost !== undefined) {
    metrics.push(`cost: ${formatCost(node.cost)}`);
  }
  if (metrics.length > 0) {
    parts.push(
      <span key="metrics" style={{ color: theme.colorTextSecondary, marginLeft: 8 }}>
        ({metrics.join(', ')})
      </span>
    );
  }

  return <span>{parts}</span>;
}

function buildTreeData(node: PlanNode, theme: SupersetTheme, key: string = '0'): DataNode {
  const children = node.children?.map((child, index) =>
    buildTreeData(child, theme, `${key}-${index}`)
  );

  return {
    key,
    title: buildNodeTitle(node, theme),
    children,
  };
}

function getAllKeys(node: PlanNode, key: string = '0'): string[] {
  const keys = [key];
  node.children?.forEach((child, index) => {
    keys.push(...getAllKeys(child, `${key}-${index}`));
  });
  return keys;
}

export const PlanTree: React.FC<PlanTreeProps> = ({ plan }) => {
  const theme = useTheme();
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(() => getAllKeys(plan));

  const treeData = useMemo(() => [buildTreeData(plan, theme)], [plan, theme]);

  return (
    <div className="query-plan-tree">
      <style>
        {`
          .query-plan-tree .ant-tree .ant-tree-treenode,
          .query-plan-tree .ant-tree .ant-tree-node-content-wrapper,
          .query-plan-tree .ant-tree .ant-tree-node-content-wrapper:hover,
          .query-plan-tree .ant-tree .ant-tree-title {
            cursor: text !important;
          }
          .query-plan-tree .ant-tree .ant-tree-node-content-wrapper:hover {
            background-color: transparent !important;
          }
        `}
      </style>
      <Tree
        showLine
        switcherIcon={<DownOutlined />}
        expandedKeys={expandedKeys}
        onExpand={(keys) => setExpandedKeys(keys)}
        treeData={treeData}
        selectable={false}
        style={{
          background: 'transparent',
          fontSize: theme.fontSizeSM,
        }}
      />
    </div>
  );
};
