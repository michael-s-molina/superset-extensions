import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import {
  AppstoreAddOutlined,
  BugOutlined,
  ColumnWidthOutlined,
  MessageOutlined,
  CloseOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { Bubble, Sender } from "@ant-design/x";
import type { BubbleDataType } from "@ant-design/x/es/bubble/BubbleList";
import MarkdownIt from "markdown-it";
import { authentication, chat, theme } from "@apache-superset/core";
import useDashboardTools, { type ClientTool } from "./hooks/useDashboardTools";
import { buildDefaultDashboardReport } from "./defaultDashboard";
import { serializeDashboardConfig } from "./dashboardDebug";

const { useTheme } = theme;

let nextKey = 1;

// html: false — markdown-it escapes literal HTML tags in the source instead
// of passing them through, so rendering its output via dangerouslySetInnerHTML
// below doesn't open an XSS hole even though the content originates from an LLM.
const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

function renderMarkdown(content: unknown): React.ReactNode {
  return (
    <div
      className="chat-markdown"
      dangerouslySetInnerHTML={{ __html: md.render(String(content ?? "")) }}
    />
  );
}

// Bubble calls `loadingRender()` with no arguments (see @ant-design/x's
// Bubble.js — while `loading` is true, `content`/`messageRender` are
// ignored entirely), so the elapsed-time counter has to track its own start
// time and tick itself rather than being fed a value from ChatPanel. Doing
// it this way also means the tick interval only ever re-renders this one
// small element, not the whole panel — recreating array/object props on
// every render is exactly what caused the previous typing-lag bug.
function ThinkingIndicator() {
  const startRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <LoadingOutlined spin />
      <span>Thinking… {elapsedSeconds}s</span>
    </span>
  );
}

// Depend on nothing per-render (no theme, no props, no state) — hoisted so
// Bubble.List/Sender see a stable reference across re-renders instead of a
// fresh object every keystroke. Bubble.List in particular re-processes its
// full `items` list (including re-running markdown-it + dangerouslySetInnerHTML
// for every past assistant bubble via renderMarkdown) when it sees `roles`
// change identity, which used to happen every keystroke via ChatPanel's own
// `value` state update — the more turns in the conversation, the worse the
// per-keystroke lag got.
const BUBBLE_LIST_STYLE: React.CSSProperties = { flex: 1, padding: 16, minHeight: 0, overflowY: "auto" };
const SENDER_STYLES = { input: { outline: "none", boxShadow: "none" } };

interface ChatTurn {
  role: string;
  content: string;
}

// Backend ToolSpec shape (snake_case input_schema) — what the chat
// extension's API and MCP tools both use.
interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// Discriminated union mirroring the backend's Turn dataclasses.
type Turn =
  | { type: "final"; content: string }
  | {
      type: "client_action";
      state: unknown;
      resolved_results: unknown[];
      calls: { id: string; name: string; arguments: Record<string, unknown> }[];
    };

// A send()/resume() round trip that returns a non-final turn without making
// progress (e.g. the model repeatedly asking for tools) has no other natural
// stopping point — this caps total network round trips for one user message.
// Every dashboard tool call is a client tool (dashboard state lives only in
// this browser tab), and most are sequentially dependent — add a row canvas,
// then add a chart into it, then the next — so the model can't batch them
// into one round trip the way it can with server-only tools. A multi-chart
// dashboard (get root, add a row, add each chart, plus any correction
// retries) can genuinely need well more than a handful of round trips, so
// this is sized with headroom rather than tightly to the common case.
const MAX_TURN_ROUND_TRIPS = 30;

async function postJson(path: string, body: unknown, signal: AbortSignal): Promise<Turn> {
  const csrfToken = await authentication.getCSRFToken();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken!,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message) errorMessage = errorData.message;
    } catch {
      // Response body wasn't JSON (or was empty) — keep the status-based message.
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.result as Turn;
}

async function runChatTurn(
  history: ChatTurn[],
  clientTools: ClientTool[],
  toolSpecs: ToolSpec[],
  signal: AbortSignal,
): Promise<string> {
  const toolsByName = new Map(clientTools.map((tool) => [tool.name, tool]));

  let turn = await postJson(
    "/extensions/michael-s-molina/chat/send",
    { history, client_tools: toolSpecs },
    signal,
  );

  for (let i = 0; i < MAX_TURN_ROUND_TRIPS && turn.type === "client_action"; i += 1) {
    const results = await Promise.all(
      turn.calls.map(async (call) => {
        const tool = toolsByName.get(call.name);
        const result = tool
          ? await tool.handler(call.arguments)
          : { success: false, message: `Unknown client tool "${call.name}"` };
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(result),
        };
      }),
    );

    turn = await postJson(
      "/extensions/michael-s-molina/chat/resume",
      { state: turn.state, resolved_results: turn.resolved_results, results, client_tools: toolSpecs },
      signal,
    );
  }

  if (turn.type === "client_action") {
    throw new Error("Chat turn did not resolve after the maximum number of tool round trips.");
  }

  return turn.content;
}

export default function ChatPanel() {
  const t = useTheme();
  const [messages, setMessages] = useState<BubbleDataType[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<chat.DisplayMode>(chat.getDisplayMode());
  const abortControllerRef = useRef<AbortController | null>(null);
  const dashboardTools = useDashboardTools();
  const dashboardToolSpecs = useMemo<ToolSpec[]>(
    () =>
      dashboardTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
    [dashboardTools],
  );

  useEffect(() => {
    const { dispose } = chat.onDidChangeDisplayMode((m) => setMode(m));
    return dispose;
  }, []);

  const roles: Record<
    string,
    {
      placement: "start" | "end";
      styles: { content: React.CSSProperties };
      messageRender?: (content: unknown) => React.ReactNode;
    }
  > = useMemo(
    () => ({
      user: {
        placement: "end",
        styles: { content: { backgroundColor: t.colorPrimary, color: t.colorTextLightSolid } },
      },
      assistant: {
        placement: "start",
        styles: { content: { backgroundColor: t.colorFillSecondary, color: t.colorText } },
        messageRender: renderMarkdown,
      },
    }),
    [t],
  );

  async function handleSubmit(text: string) {
    if (!text.trim() || loading) return;

    const history: ChatTurn[] = [
      ...messages.map((m) => ({ role: String(m.role), content: String(m.content ?? "") })),
      { role: "user", content: text },
    ];

    const thinkingKey = nextKey++;
    setMessages((prev) => [
      ...prev,
      { key: nextKey++, role: "user", content: text },
      {
        key: thinkingKey,
        role: "assistant",
        content: "",
        loading: true,
        loadingRender: () => <ThinkingIndicator />,
      },
    ]);
    setValue("");
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const content = await runChatTurn(
        history,
        dashboardTools,
        dashboardToolSpecs,
        controller.signal,
      );
      setMessages((prev) =>
        prev.map((m) => (m.key === thinkingKey ? { ...m, content, loading: false } : m)),
      );
    } catch (e) {
      // A user-initiated cancel rejects the in-flight fetch with this same
      // shape (DOMException named "AbortError") — show it as a deliberate
      // stop rather than routing it through the generic error message.
      const wasCancelled = controller.signal.aborted;
      const message = wasCancelled
        ? "Stopped."
        : e instanceof Error
          ? e.message
          : "An unexpected error occurred.";
      setMessages((prev) =>
        prev.map((m) =>
          m.key === thinkingKey
            ? { ...m, content: wasCancelled ? message : `⚠️ ${message}`, loading: false }
            : m,
        ),
      );
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  function toggleMode() {
    chat.setDisplayMode(mode === "floating" ? "panel" : "floating");
  }

  async function handlePrintDashboardConfig() {
    const json = serializeDashboardConfig();
    setMessages((prev) => [
      ...prev,
      { key: nextKey++, role: "assistant", content: `\`\`\`json\n${json}\n\`\`\`` },
    ]);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // config is still visible (and selectable) in the chat either way.
    }
  }

  const isPanel = mode === "panel";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: isPanel ? "100%" : "80vh",
        width: isPanel ? "100%" : 380,
        background: t.colorBgContainer,
        borderRadius: isPanel ? 0 : t.borderRadiusLG,
        boxShadow: isPanel ? "none" : t.boxShadowSecondary,
        overflow: "hidden",
      }}
    >
      <style>{`
        .chat-markdown { line-height: 1.5; }
        .chat-markdown > *:first-child { margin-top: 0; }
        .chat-markdown > *:last-child { margin-bottom: 0; }
        .chat-markdown pre { background: ${t.colorFillTertiary}; padding: 8px; border-radius: ${t.borderRadiusSM}px; overflow-x: auto; }
        .chat-markdown code { background: ${t.colorFillTertiary}; padding: 1px 4px; border-radius: 3px; }
        .chat-markdown pre code { background: none; padding: 0; }
        .chat-markdown ul, .chat-markdown ol { padding-left: 20px; margin: 4px 0; }
        .chat-markdown table { border-collapse: collapse; }
        .chat-markdown th, .chat-markdown td { border: 1px solid ${t.colorBorderSecondary}; padding: 4px 8px; }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `1px solid ${t.colorBorderSecondary}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: t.fontWeightStrong, fontSize: t.fontSize, color: t.colorText }}>
          Chat
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <Tooltip title="Build default dashboard">
            <Button
              type="text"
              size="small"
              icon={<AppstoreAddOutlined />}
              onClick={() => buildDefaultDashboardReport()}
            />
          </Tooltip>
          <Tooltip title="Copy dashboard config">
            <Button
              type="text"
              size="small"
              icon={<BugOutlined />}
              onClick={handlePrintDashboardConfig}
            />
          </Tooltip>
          <Tooltip title={isPanel ? "Float" : "Dock to side"}>
            <Button
              type="text"
              size="small"
              icon={isPanel ? <MessageOutlined /> : <ColumnWidthOutlined />}
              onClick={toggleMode}
            />
          </Tooltip>
          <Tooltip title="Close">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => chat.close()}
            />
          </Tooltip>
        </div>
      </div>
      <Bubble.List items={messages} roles={roles} style={BUBBLE_LIST_STYLE} autoScroll />
      <div style={{ padding: "0 16px 16px" }}>
        <Sender
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={loading}
          placeholder="Type a message…"
          styles={SENDER_STYLES}
        />
      </div>
    </div>
  );
}
