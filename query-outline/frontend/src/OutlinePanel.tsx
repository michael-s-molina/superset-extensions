import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button, Empty, Tooltip, Spin } from "antd";
import { PlayCircleOutlined, PlaySquareOutlined, CopyOutlined, CheckOutlined, ExportOutlined } from "@ant-design/icons";
import { sqlLab, theme, common } from "@apache-superset/core";
import { parseStatements, SqlStatement } from "./sqlParser";

type Disposable = common.Disposable;

const { useTheme } = theme;

const ActionButton: React.FC<{
  tooltip: string;
  icon: React.ReactNode;
  color: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}> = ({ tooltip, icon, color, onClick, disabled }) => (
  <Tooltip title={tooltip} placement="left">
    <Button
      type="text"
      size="small"
      icon={icon}
      disabled={disabled}
      onClick={onClick}
      style={{ flexShrink: 0, color, padding: "0 4px" }}
    />
  </Tooltip>
);

type BadgeColors = { bg: string; color: string };

function getBadgeColors(type: string, t: theme.SupersetTheme): BadgeColors {
  const solid = t.colorTextLightSolid;
  switch (type) {
    case "SELECT":
    case "WITH":     return { bg: t.colorPrimary, color: solid };
    case "INSERT":   return { bg: t.colorSuccess, color: solid };
    case "UPDATE":
    case "ALTER":    return { bg: t.colorWarning, color: solid };
    case "DELETE":
    case "DROP":
    case "TRUNCATE": return { bg: t.colorError,   color: solid };
    case "CREATE":   return { bg: t.colorInfo,    color: solid };
    case "CTE":      return { bg: t.colorTextTertiary, color: solid };
    default:         return { bg: t.colorFillSecondary, color: t.colorTextSecondary };
  }
}

const PARSE_DEBOUNCE_MS = 1000;

function getPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const OutlinePanel: React.FC = () => {
  const antdTheme = useTheme();
  const [statements, setStatements] = useState<SqlStatement[]>([]);
  const [executingIndex, setExecutingIndex] = useState<number | null>(null);
  const [executingUpToIndex, setExecutingUpToIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // Holds the onDidChangeContent subscription for the current tab's editor
  const contentListenerRef = useRef<Disposable | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleParseStatements = useCallback((sql: string) => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      setStatements(parseStatements(sql));
    }, PARSE_DEBOUNCE_MS);
  }, []);

  const subscribeToTab = useCallback(async () => {
    // Tear down any existing listener and pending debounce before switching tabs
    contentListenerRef.current?.dispose();
    contentListenerRef.current = null;
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const tab = sqlLab.getCurrentTab();
    if (!tab) {
      setStatements([]);
      return;
    }

    const editor = await tab.getEditor();

    // Parse the current content immediately (no debounce on initial load),
    // then debounce all subsequent changes from the user typing
    setStatements(parseStatements(editor.getValue()));
    contentListenerRef.current = editor.onDidChangeContent((e) => {
      scheduleParseStatements(e.getValue());
    });
  }, [scheduleParseStatements]);

  // Subscribe on mount
  useEffect(() => {
    subscribeToTab();
    return () => {
      contentListenerRef.current?.dispose();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [subscribeToTab]);

  // Re-subscribe when the user switches to a different tab
  useEffect(() => {
    const disposable = sqlLab.onDidChangeActiveTab(() => subscribeToTab());
    return () => disposable.dispose();
  }, [subscribeToTab]);

  const handleNavigate = useCallback(async (stmt: SqlStatement) => {
    const tab = sqlLab.getCurrentTab();
    if (!tab) return;
    const editor = await tab.getEditor();
    editor.scrollToLine(stmt.startLine);
    editor.setSelection({
      start: { line: stmt.startLine, column: stmt.startColumn },
      end: { line: stmt.endLine, column: stmt.endColumn },
    });
    editor.focus();
  }, []);

  const handleOpenInNewTab = useCallback(
    async (e: React.MouseEvent, stmt: SqlStatement) => {
      e.stopPropagation();
      const tab = sqlLab.getCurrentTab();
      await sqlLab.createTab({
        sql: stmt.text,
        databaseId: tab?.databaseId,
        catalog: tab?.catalog,
        schema: tab?.schema,
      });
    },
    [],
  );

  const handleCopy = useCallback(
    (e: React.MouseEvent, stmt: SqlStatement) => {
      e.stopPropagation();
      navigator.clipboard.writeText(stmt.text);
      setCopiedIndex(stmt.index);
      setTimeout(() => setCopiedIndex(null), 1500);
    },
    [],
  );

  const handleExecuteUpTo = useCallback(
    async (e: React.MouseEvent, stmt: SqlStatement) => {
      e.stopPropagation();
      setExecutingUpToIndex(stmt.index);
      try {
        for (const s of statements.slice(0, stmt.index + 1)) {
          await sqlLab.executeQuery({ sql: s.cumulativeText });
        }
        await sqlLab.setActivePanel("Results");
      } finally {
        setExecutingUpToIndex(null);
      }
    },
    [statements],
  );

  const handleExecute = useCallback(
    async (e: React.MouseEvent, stmt: SqlStatement) => {
      e.stopPropagation();
      await handleNavigate(stmt);
      setExecutingIndex(stmt.index);
      try {
        await sqlLab.executeQuery({ sql: stmt.text });
        await sqlLab.setActivePanel("Results");
      } finally {
        setExecutingIndex(null);
      }
    },
    [handleNavigate],
  );

  const maxEndLine = statements.length > 0
    ? Math.max(...statements.map(s => s.endLine + 1))
    : 1;
  // Width for "DDDD–DDDD": two numbers of equal digit length + em dash
  const digits = String(maxEndLine).length;
  const lineNumWidth = `${digits * 2 + 1}ch`;

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {statements.length === 0 ? (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No statements found"
          />
        </div>
      ) : (
        <>
          {statements.map((stmt) => {
            const type = stmt.type;
            const badge = getBadgeColors(type, antdTheme);
            const isHovered = hoveredIndex === stmt.index;
            const isExecuting = executingIndex === stmt.index;
            const isExecutingUpTo = executingUpToIndex === stmt.index;
            const isCopied = copiedIndex === stmt.index;

            return (
              <div
                key={stmt.index}
                onClick={() => handleNavigate(stmt)}
                onMouseEnter={() => setHoveredIndex(stmt.index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  height: 50,
                  boxSizing: "border-box",
                  paddingRight: antdTheme.paddingSM,
                  cursor: "pointer",
                  background: isHovered
                    ? antdTheme.colorFillTertiary
                    : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: antdTheme.marginSM,
                  transition: "background 0.15s",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: lineNumWidth,
                    fontSize: antdTheme.fontSizeSM,
                    color: antdTheme.colorTextTertiary,
                    textAlign: "right",
                    userSelect: "none",
                  }}
                >
                  {stmt.startLine === stmt.endLine
                    ? stmt.startLine + 1
                    : `${stmt.startLine + 1}–${stmt.endLine + 1}`}
                </span>

                <span
                  style={{
                    flexShrink: 0,
                    width: "5.5em",
                    fontSize: 10,
                    fontWeight: 600,
                    background: badge.bg,
                    color: badge.color,
                    borderRadius: antdTheme.borderRadiusSM,
                    padding: "1px 5px",
                    lineHeight: "18px",
                    letterSpacing: "0.03em",
                    textAlign: "center",
                    userSelect: "none",
                  }}
                >
                  {type}
                </span>

                <span
                  style={{
                    flex: 1,
                    fontSize: antdTheme.fontSizeSM,
                    color: antdTheme.colorText,
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                    marginTop: 2,
                  }}
                >
                  {getPreview(stmt.displayText)}
                </span>

                <ActionButton
                  tooltip="Execute this statement"
                  icon={isExecuting ? <Spin size="small" /> : <PlayCircleOutlined />}
                  color={antdTheme.colorPrimary}
                  disabled={isExecuting || executingUpToIndex !== null}
                  onClick={(e) => handleExecute(e, stmt)}
                />

                <ActionButton
                  tooltip="Execute from first statement to here"
                  icon={isExecutingUpTo ? <Spin size="small" /> : <PlaySquareOutlined />}
                  color={antdTheme.colorPrimary}
                  disabled={isExecutingUpTo || executingIndex !== null}
                  onClick={(e) => handleExecuteUpTo(e, stmt)}
                />

                <ActionButton
                  tooltip={isCopied ? "Copied!" : "Copy SQL"}
                  icon={isCopied ? <CheckOutlined /> : <CopyOutlined />}
                  color={isCopied ? antdTheme.colorSuccess : antdTheme.colorPrimary}
                  onClick={(e) => handleCopy(e, stmt)}
                />

                <ActionButton
                  tooltip="Open in new tab"
                  icon={<ExportOutlined />}
                  color={antdTheme.colorPrimary}
                  onClick={(e) => handleOpenInNewTab(e, stmt)}
                />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

export default OutlinePanel;
