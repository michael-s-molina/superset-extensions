import React, { useState, useMemo } from "react";
import {
  Modal,
  Select,
  Tag,
  Empty,
  Tabs,
  Typography,
  Button,
  Tooltip,
} from "antd";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { useTheme } from "@apache-superset/core";
import { compareResults, CompareResult, Column } from "./compare";

const { Text } = Typography;

export interface StoredQueryResult {
  queryId: string;
  tabId: string;
  tabTitle: string;
  sql: string;
  columns: Column[];
  data: Array<Record<string, unknown>>;
  timestamp: number;
}

interface CompareModalProps {
  visible: boolean;
  results: StoredQueryResult[];
  onClose: () => void;
}

// Convert row data to a formatted string for diff display
function formatRowsForDiff(
  data: Array<Record<string, unknown>>,
  columns: string[]
): string {
  if (data.length === 0) return "";

  return data
    .map((row, idx) => {
      const values = columns.map((col) => {
        const val = row[col];
        if (val === null) return "NULL";
        if (val === undefined) return "";
        return String(val);
      });
      return `${idx + 1}: ${values.join(" | ")}`;
    })
    .join("\n");
}

// Format schema for diff display
function formatSchemaForDiff(columns: Column[]): string {
  if (columns.length === 0) return "";
  return columns
    .map((col) => `${col.column_name}: ${col.type || "unknown"}`)
    .join("\n");
}

// GitHub-style stats bar component
interface DiffStatsProps {
  added: number;
  removed: number;
  successColor: string;
  errorColor: string;
}

const DiffStats: React.FC<DiffStatsProps> = ({
  added,
  removed,
  successColor,
  errorColor,
}) => {
  const total = added + removed;
  const addedRatio = total > 0 ? added / total : 0.5;
  const addedBlocks = Math.round(addedRatio * 5);

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 24 }}
    >
      <span style={{ color: successColor, fontWeight: 500 }}>+{added}</span>
      <span style={{ color: errorColor, fontWeight: 500 }}>−{removed}</span>
      <div style={{ display: "flex", gap: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: i < addedBlocks ? successColor : errorColor,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export const CompareModal: React.FC<CompareModalProps> = ({
  visible,
  results,
  onClose,
}) => {
  const theme = useTheme();

  const [leftQueryId, setLeftQueryId] = useState<string | null>(
    results.length >= 1 ? results[0].queryId : null
  );
  const [rightQueryId, setRightQueryId] = useState<string | null>(
    results.length >= 2 ? results[1].queryId : null
  );

  const leftResult = useMemo(
    () => results.find((r) => r.queryId === leftQueryId),
    [results, leftQueryId]
  );
  const rightResult = useMemo(
    () => results.find((r) => r.queryId === rightQueryId),
    [results, rightQueryId]
  );

  // Compute comparison results automatically when both results are selected
  const comparison = useMemo((): CompareResult | null => {
    if (!leftResult || !rightResult) {
      return null;
    }
    return compareResults(
      { columns: leftResult.columns, data: leftResult.data },
      { columns: rightResult.columns, data: rightResult.data }
    );
  }, [leftResult, rightResult]);

  // Get all columns for diff display
  const allColumns = useMemo(() => {
    if (!leftResult && !rightResult) return [];
    const cols = new Set<string>();
    leftResult?.columns.forEach((c) => cols.add(c.column_name));
    rightResult?.columns.forEach((c) => cols.add(c.column_name));
    return Array.from(cols);
  }, [leftResult, rightResult]);

  // Format data for diff viewer
  const leftDiffText = useMemo(() => {
    if (!leftResult) return "";
    return formatRowsForDiff(leftResult.data, allColumns);
  }, [leftResult, allColumns]);

  const rightDiffText = useMemo(() => {
    if (!rightResult) return "";
    return formatRowsForDiff(rightResult.data, allColumns);
  }, [rightResult, allColumns]);

  const resultOptions = results.map((result) => ({
    value: result.queryId,
    label: `${result.tabTitle} (${
      result.data.length
    } rows) - ${result.sql.slice(0, 30)}...`,
  }));

  const leftSchemaText = useMemo(() => {
    if (!leftResult) return "";
    return formatSchemaForDiff(leftResult.columns);
  }, [leftResult]);

  const rightSchemaText = useMemo(() => {
    if (!rightResult) return "";
    return formatSchemaForDiff(rightResult.columns);
  }, [rightResult]);

  // Calculate if results are identical
  const isIdentical =
    comparison &&
    comparison.rowDiffs.length === 0 &&
    comparison.schemaChanges.length === 0;

  // Theme-based diff viewer styles
  const diffStyles = useMemo(
    () => ({
      variables: {
        light: {
          diffViewerBackground: theme.colorBgContainer,
          diffViewerColor: theme.colorText,
          addedBackground: theme.colorSuccessBg,
          addedColor: theme.colorText,
          removedBackground: theme.colorErrorBg,
          removedColor: theme.colorText,
          wordAddedBackground: theme.colorSuccessBgHover,
          wordRemovedBackground: theme.colorErrorBgHover,
          addedGutterBackground: theme.colorSuccessBg,
          removedGutterBackground: theme.colorErrorBg,
          gutterBackground: theme.colorBgLayout,
          gutterBackgroundDark: theme.colorBgLayout,
          highlightBackground: theme.colorWarningBg,
          highlightGutterBackground: theme.colorWarningBgHover,
          codeFoldGutterBackground: theme.colorInfoBg,
          codeFoldBackground: theme.colorInfoBgHover,
          emptyLineBackground: theme.colorBgLayout,
        },
      },
      titleBlock: {
        background: theme.colorBgLayout,
        borderBottom: `1px solid ${theme.colorBorderSecondary}`,
        padding: "8px 12px",
      },
      contentText: {
        fontSize: "12px",
        lineHeight: "1.5",
        fontFamily: theme.fontFamilyCode,
      },
      gutter: {
        minWidth: "40px",
        padding: "0 8px",
      },
      line: {
        padding: "0 8px",
      },
    }),
    [theme]
  );

  return (
    <Modal
      title="Compare Query Results"
      open={visible}
      onCancel={onClose}
      width={1200}
      footer={null}
      destroyOnHidden
      styles={{ body: { height: "75vh", overflow: "hidden" } }}
    >
      {/* Query Selection Container */}
      <div
        style={{
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        {/* Query Selection */}
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: 1 }}>
            <Text
              type="secondary"
              style={{ fontSize: 12, display: "block", marginBottom: 4 }}
            >
              BASE RESULT
            </Text>
            <Select
              style={{ width: "100%" }}
              placeholder="Select a result"
              value={leftQueryId}
              onChange={setLeftQueryId}
              options={resultOptions}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              paddingBottom: 4,
            }}
          >
            <Tooltip title="Swap queries">
              <Button
                type="text"
                style={{
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => {
                  const temp = leftQueryId;
                  setLeftQueryId(rightQueryId);
                  setRightQueryId(temp);
                }}
              >
                ⇄
              </Button>
            </Tooltip>
          </div>
          <div style={{ flex: 1 }}>
            <Text
              type="secondary"
              style={{ fontSize: 12, display: "block", marginBottom: 4 }}
            >
              COMPARE WITH
            </Text>
            <Select
              style={{ width: "100%" }}
              placeholder="Select a result"
              value={rightQueryId}
              onChange={setRightQueryId}
              options={resultOptions}
            />
          </div>
        </div>
      </div>

      {/* Empty states */}
      {results.length < 2 && (
        <Empty
          description={
            results.length === 0
              ? "No query results available. Run queries in your tabs first."
              : "Only 1 query result available. Run another query to compare."
          }
        />
      )}

      {results.length >= 2 && (!leftResult || !rightResult) && (
        <Empty description="Select two query results to compare" />
      )}

      {/* Comparison Results */}
      {comparison && (
        <>
          {/* Diff Content */}
          {isIdentical ? (
            <Empty
              description="Results are identical!"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Tabs
              tabBarStyle={{ marginBottom: 12 }}
              items={[
                {
                  key: "data",
                  label: (
                    <span>
                      Data Differences{" "}
                      <Tag
                        style={{
                          fontSize: 11,
                          padding: "0 4px",
                          lineHeight: "16px",
                        }}
                      >
                        {comparison.rowDiffs.length}
                      </Tag>
                    </span>
                  ),
                  children: (
                    <div
                      style={{
                        border: `1px solid ${theme.colorBorderSecondary}`,
                        borderRadius: theme.borderRadius,
                        overflow: "hidden",
                        height: "calc(75vh - 140px)",
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 12px",
                          borderBottom: `1px solid ${theme.colorBorderSecondary}`,
                          fontSize: 12,
                          color: theme.colorTextSecondary,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <strong style={{ color: theme.colorText }}>
                            Columns:
                          </strong>{" "}
                          <span style={{ fontFamily: theme.fontFamilyCode }}>
                            {allColumns.join(" | ")}
                          </span>
                        </div>
                        {comparison.rowDiffs.length > 0 && (
                          <DiffStats
                            added={comparison.summary.addedRows}
                            removed={comparison.summary.removedRows}
                            successColor={theme.colorSuccess}
                            errorColor={theme.colorError}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          height: "calc(100% - 37px)",
                          overflowY: "auto",
                        }}
                      >
                        {comparison.rowDiffs.length > 0 ? (
                          <ReactDiffViewer
                            oldValue={leftDiffText}
                            newValue={rightDiffText}
                            splitView={true}
                            compareMethod={DiffMethod.LINES}
                            styles={diffStyles}
                            useDarkTheme={false}
                          />
                        ) : (
                          <Empty
                            description="No data differences - all rows match"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            style={{ paddingTop: 40 }}
                          />
                        )}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "schema",
                  label: (
                    <span>
                      Schema Changes{" "}
                      <Tag
                        style={{
                          fontSize: 11,
                          padding: "0 4px",
                          lineHeight: "16px",
                        }}
                      >
                        {comparison.schemaChanges.length}
                      </Tag>
                    </span>
                  ),
                  children: (
                    <div
                      style={{
                        border: `1px solid ${theme.colorBorderSecondary}`,
                        borderRadius: theme.borderRadius,
                        overflow: "hidden",
                        height: "calc(75vh - 140px)",
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 12px",
                          borderBottom: `1px solid ${theme.colorBorderSecondary}`,
                          fontSize: 12,
                          color: theme.colorTextSecondary,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <strong style={{ color: theme.colorText }}>
                          Columns
                        </strong>
                        {comparison.schemaChanges.length > 0 && (
                          <DiffStats
                            added={
                              comparison.schemaChanges.filter(
                                (c) => c.type === "added"
                              ).length
                            }
                            removed={
                              comparison.schemaChanges.filter(
                                (c) => c.type === "removed"
                              ).length
                            }
                            successColor={theme.colorSuccess}
                            errorColor={theme.colorError}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          height: "calc(100% - 37px)",
                          overflowY: "auto",
                        }}
                      >
                        {comparison.schemaChanges.length > 0 ? (
                          <ReactDiffViewer
                            oldValue={leftSchemaText}
                            newValue={rightSchemaText}
                            splitView={true}
                            compareMethod={DiffMethod.LINES}
                            styles={diffStyles}
                            useDarkTheme={false}
                          />
                        ) : (
                          <Empty
                            description="No schema changes - columns are identical"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            style={{ paddingTop: 40 }}
                          />
                        )}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </Modal>
  );
};
