import React, { useState, useEffect, useCallback } from "react";
import { commands, sqlLab, theme } from "@apache-superset/core";

const { useTheme } = theme;

export interface Interaction {
  type: "command" | "event";
  name: string;
  timestamp: string;
  result?: unknown;
  error?: string;
}

let lastInteractionGlobal: Interaction | null = null;
const listeners: Set<(interaction: Interaction | null) => void> = new Set();

export function setLastInteraction(interaction: Interaction) {
  lastInteractionGlobal = interaction;
  listeners.forEach((listener) => listener(interaction));
}

function useLastInteraction() {
  const [interaction, setInteraction] = useState<Interaction | null>(
    lastInteractionGlobal
  );

  useEffect(() => {
    const listener = (newInteraction: Interaction | null) => {
      setInteraction(newInteraction);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return interaction;
}

export function APIExplorer() {
  const lastInteraction = useLastInteraction();
  const [loading, setLoading] = useState<string | null>(null);
  const t = useTheme();

  useEffect(() => {
    const disposables: Array<{ dispose: () => void }> = [];

    // Tab-scoped events
    disposables.push(
      sqlLab.onDidChangeEditorDatabase((databaseId: number) => {
        setLastInteraction({
          type: "event",
          name: "onDidChangeEditorDatabase",
          timestamp: new Date().toISOString(),
          result: databaseId,
        });
      })
    );

    disposables.push(
      sqlLab.onDidChangeEditorSchema((schema: string) => {
        setLastInteraction({
          type: "event",
          name: "onDidChangeEditorSchema",
          timestamp: new Date().toISOString(),
          result: schema,
        });
      })
    );

    disposables.push(
      sqlLab.onDidChangeActivePanel((panel: unknown) => {
        setLastInteraction({
          type: "event",
          name: "onDidChangeActivePanel",
          timestamp: new Date().toISOString(),
          result: panel,
        });
      })
    );

    disposables.push(
      sqlLab.onDidChangeTabTitle((title: string) => {
        setLastInteraction({
          type: "event",
          name: "onDidChangeTabTitle",
          timestamp: new Date().toISOString(),
          result: title,
        });
      })
    );

    disposables.push(
      sqlLab.onDidQueryRun((query: unknown) => {
        setLastInteraction({
          type: "event",
          name: "onDidQueryRun",
          timestamp: new Date().toISOString(),
          result: query,
        });
      })
    );

    disposables.push(
      sqlLab.onDidQueryStop((query: unknown) => {
        setLastInteraction({
          type: "event",
          name: "onDidQueryStop",
          timestamp: new Date().toISOString(),
          result: query,
        });
      })
    );

    disposables.push(
      sqlLab.onDidQueryFail((result: unknown) => {
        setLastInteraction({
          type: "event",
          name: "onDidQueryFail",
          timestamp: new Date().toISOString(),
          result: result,
        });
      })
    );

    disposables.push(
      sqlLab.onDidQuerySuccess((result: unknown) => {
        setLastInteraction({
          type: "event",
          name: "onDidQuerySuccess",
          timestamp: new Date().toISOString(),
          result: result,
        });
      })
    );

    // Global events
    disposables.push(
      sqlLab.onDidCloseTab((tab: unknown) => {
        setLastInteraction({
          type: "event",
          name: "onDidCloseTab",
          timestamp: new Date().toISOString(),
          result: tab,
        });
      })
    );

    disposables.push(
      sqlLab.onDidChangeActiveTab((tab: unknown) => {
        setLastInteraction({
          type: "event",
          name: "onDidChangeActiveTab",
          timestamp: new Date().toISOString(),
          result: tab,
        });
      })
    );

    disposables.push(
      sqlLab.onDidCreateTab((tab: unknown) => {
        setLastInteraction({
          type: "event",
          name: "onDidCreateTab",
          timestamp: new Date().toISOString(),
          result: tab,
        });
      })
    );

    return () => {
      disposables.forEach((d) => d.dispose());
    };
  }, []);

  const executeCommand = useCallback(async (commandId: string) => {
    setLoading(commandId);
    try {
      await commands.executeCommand(commandId);
    } catch (error) {
      console.error(`Error executing command ${commandId}:`, error);
    } finally {
      setLoading(null);
    }
  }, []);

  const apiCommands = [
    { id: "api_explorer.getTabs", label: "getTabs", icon: "📑" },
    { id: "api_explorer.getCurrentTab", label: "getCurrentTab", icon: "📄" },
    { id: "api_explorer.getDatabases", label: "getDatabases", icon: "🗄️" },
    { id: "api_explorer.getActivePanel", label: "getActivePanel", icon: "📊" },
    { id: "api_explorer.createTab", label: "createTab", icon: "➕" },
    { id: "api_explorer.executeQuery", label: "executeQuery", icon: "▶️" },
  ];

  const formatResult = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const getTypeColor = (interaction: Interaction) => {
    if (interaction.error)
      return { bg: t.colorErrorBg, border: t.colorErrorBorder, text: t.colorError };
    if (interaction.type === "event")
      return { bg: t.colorInfoBg, border: t.colorInfoBorder, text: t.colorInfo };
    return { bg: t.colorSuccessBg, border: t.colorSuccessBorder, text: t.colorSuccess };
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        height: "100%",
      }}
    >
      {/* Top Section - API Buttons */}
      <div
        style={{
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: t.colorTextTertiary,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "8px",
          }}
        >
          SQL Lab APIs
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
          }}
        >
          {apiCommands.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => executeCommand(cmd.id)}
              disabled={loading === cmd.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: loading === cmd.id ? t.colorFillSecondary : t.colorFillTertiary,
                cursor: loading === cmd.id ? "wait" : "pointer",
                fontSize: "13px",
                fontWeight: 500,
                color: t.colorText,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (loading !== cmd.id) {
                  e.currentTarget.style.backgroundColor = t.colorFillSecondary;
                }
              }}
              onMouseLeave={(e) => {
                if (loading !== cmd.id) {
                  e.currentTarget.style.backgroundColor = t.colorFillTertiary;
                }
              }}
            >
              <span style={{ fontSize: "14px" }}>{cmd.icon}</span>
              <span
                style={{
                  fontFamily: "Monaco, Consolas, monospace",
                  fontSize: "12px",
                }}
              >
                {cmd.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Section - Last Interaction */}
      <div
        style={{
          flex: 1,
          padding: "16px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: t.colorTextTertiary,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "12px",
          }}
        >
          Last Interaction
        </div>

        {lastInteraction ? (
          <div
            style={{
              backgroundColor: t.colorBgContainer,
              borderRadius: "12px",
              border: `1px solid ${t.colorBorderSecondary}`,
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              flex: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${t.colorBorderSecondary}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: t.colorFillAlter,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                    backgroundColor: getTypeColor(lastInteraction).bg,
                    color: getTypeColor(lastInteraction).text,
                    border: `1px solid ${getTypeColor(lastInteraction).border}`,
                  }}
                >
                  {lastInteraction.error ? "Error" : lastInteraction.type}
                </span>
                <span
                  style={{
                    fontFamily: "Monaco, Consolas, monospace",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: t.colorText,
                  }}
                >
                  {lastInteraction.name}
                </span>
              </div>
              <span
                style={{
                  fontSize: "12px",
                  color: t.colorTextTertiary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {new Date(lastInteraction.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {/* Result */}
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "16px 20px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: t.colorTextTertiary,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "12px",
                  paddingLeft: "4px",
                }}
              >
                {lastInteraction.error ? "Error Details" : "Response"}
              </div>
              <div
                style={{
                  backgroundColor: lastInteraction.error
                    ? t.colorErrorBg
                    : t.colorFillAlter,
                  borderRadius: "8px",
                  border: `1px solid ${
                    lastInteraction.error ? t.colorErrorBorder : t.colorBorderSecondary
                  }`,
                  overflow: "auto",
                  padding: "8px",
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    padding: "20px",
                    fontFamily: "Monaco, Consolas, 'Courier New', monospace",
                    fontSize: "12px",
                    lineHeight: 1.6,
                    color: lastInteraction.error ? t.colorError : t.colorText,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "transparent",
                  }}
                >
                  {lastInteraction.error
                    ? lastInteraction.error
                    : formatResult(lastInteraction.result)}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: t.colorBgContainer,
              borderRadius: "12px",
              border: `1px dashed ${t.colorBorder}`,
              color: t.colorTextTertiary,
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "32px", opacity: 0.5 }}>📡</span>
            <span style={{ fontSize: "13px" }}>
              Waiting for interactions...
            </span>
            <span style={{ fontSize: "12px", color: t.colorTextQuaternary }}>
              Click an API button or trigger an event in SQL Lab
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default APIExplorer;
