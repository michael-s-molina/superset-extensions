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

// Feature-detected once at module load rather than in state — support
// doesn't change over the component's lifetime, so there's nothing to react to.
const SpeechRecognitionCtor: any =
  typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;

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

// One tool call made during a turn, and how it went. `origin` distinguishes a
// server (MCP) tool the model ran on the backend from a client tool this browser
// dispatched. `args`/`result` are the raw payloads sent to and returned from the
// tool, kept so the trace can show exactly what was exchanged (for debugging).
interface ToolStep {
  id: string;
  name: string;
  status: "running" | "success" | "error";
  origin: "server" | "client";
  message?: string;
  args?: unknown;
  result?: unknown;
}

const STEP_ICON: Record<ToolStep["status"], string> = {
  running: "⏳",
  success: "✅",
  error: "⚠️",
};

const stepPreStyle: React.CSSProperties = {
  margin: "2px 0 0",
  padding: "6px 8px",
  fontSize: 11,
  fontFamily: "monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 220,
  overflow: "auto",
  background: "rgba(0, 0, 0, 0.05)",
  borderRadius: 4,
};

function formatPayload(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// A small pill marking where a tool ran: "server" (backend MCP tool, e.g. schema
// discovery) vs "browser" (a client tool acting on this tab's canvas).
function OriginTag({ origin }: { origin: ToolStep["origin"] }) {
  const isServer = origin === "server";
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        padding: "0 4px",
        marginRight: 4,
        borderRadius: 3,
        border: "1px solid",
        borderColor: isServer ? "#722ed1" : "#1677ff",
        color: isServer ? "#722ed1" : "#1677ff",
      }}
    >
      {isServer ? "server" : "browser"}
    </span>
  );
}

// The head of a step row: status icon, origin pill, tool name, and any message.
function StepHead({ step }: { step: ToolStep }) {
  return (
    <>
      <span>{STEP_ICON[step.status]}</span> <OriginTag origin={step.origin} />
      <code>{step.name}</code>
      {step.message ? (
        <span style={{ opacity: 0.7 }}> — {step.message}</span>
      ) : null}
    </>
  );
}

// A collapsible trace of the tool calls made during a turn, so the user can see
// what the assistant is doing — both the backend MCP tools it ran (schema
// discovery, data queries) and the client tools it dispatched to the canvas —
// rather than only the final reply. Collapsed by default; the summary shows the
// count and, while in progress, a spinner. Each call is itself expandable to
// reveal the exact arguments sent and the result received.
function ToolSteps({ steps }: { steps: ToolStep[] }) {
  if (steps.length === 0) return null;
  const running = steps.some((s) => s.status === "running");
  const errors = steps.filter((s) => s.status === "error").length;
  const summary =
    `${steps.length} tool call${steps.length === 1 ? "" : "s"}` +
    (running ? "…" : errors ? ` · ${errors} error${errors === 1 ? "" : "s"}` : "");
  return (
    <details style={{ fontSize: 12, opacity: 0.9 }}>
      <summary style={{ cursor: "pointer", userSelect: "none" }}>
        {running ? <LoadingOutlined spin /> : "🔧"} {summary}
      </summary>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18, listStyle: "none" }}>
        {steps.map((s) => {
          const hasDetail = s.args !== undefined || s.result !== undefined;
          return (
            <li key={s.id} style={{ margin: "2px 0" }}>
              {hasDetail ? (
                <details>
                  <summary style={{ cursor: "pointer", userSelect: "none" }}>
                    <StepHead step={s} />
                  </summary>
                  {s.args !== undefined ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ opacity: 0.6 }}>Sent</div>
                      <pre style={stepPreStyle}>{formatPayload(s.args)}</pre>
                    </div>
                  ) : null}
                  {s.result !== undefined ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ opacity: 0.6 }}>Received</div>
                      <pre style={stepPreStyle}>{formatPayload(s.result)}</pre>
                    </div>
                  ) : null}
                </details>
              ) : (
                <StepHead step={s} />
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

// The full assistant turn: its tool-call trace (updating live), the thinking
// indicator while still working, and the final markdown reply once it arrives.
function TurnView({
  steps,
  text,
  loading,
}: {
  steps: ToolStep[];
  text: string;
  loading: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ToolSteps steps={steps} />
      {text ? renderMarkdown(text) : null}
      {loading ? <ThinkingIndicator /> : null}
    </div>
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

// A server (MCP) tool the model ran on the backend during a leg, mirrored from
// the backend Turn so the frontend can show it in the trace.
interface ServerCall {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  is_error?: boolean;
}

// Discriminated union mirroring the backend's Turn dataclasses.
type Turn =
  | { type: "final"; content: string; server_calls?: ServerCall[] }
  | {
      type: "client_action";
      state: unknown;
      resolved_results: unknown[];
      calls: { id: string; name: string; arguments: Record<string, unknown> }[];
      server_calls?: ServerCall[];
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

// Assistant bubbles carry their tool-call trace and the final text alongside
// the rendered `content` node, so the trace survives re-renders and the text
// can be serialized back into history (whose entries must be plain strings).
type ChatMessage = BubbleDataType & { steps?: ToolStep[]; text?: string };

async function runChatTurn(
  history: ChatTurn[],
  clientTools: ClientTool[],
  toolSpecs: ToolSpec[],
  signal: AbortSignal,
  onStep: (step: ToolStep) => void,
): Promise<string> {
  const toolsByName = new Map(clientTools.map((tool) => [tool.name, tool]));

  // Server (MCP) tools the model ran on the backend arrive already-completed on
  // each returned Turn; surface them in the trace, tagged as server-origin, in
  // the order they ran (before that leg's client calls).
  const emitServerCalls = (t: Turn) =>
    (t.server_calls ?? []).forEach((call) => {
      // The MCP gateway exposes a generic `call_tool` dispatcher whose real tool
      // name and arguments are nested in its input ({name, arguments}); unwrap
      // it so the trace shows the actual tool (e.g. get_widget_control_schema)
      // rather than the uninformative dispatcher name.
      const args = call.arguments;
      const dispatched =
        call.name === "call_tool" &&
        typeof args === "object" &&
        args !== null &&
        typeof (args as { name?: unknown }).name === "string";
      const inner = dispatched
        ? (args as { name: string; arguments?: unknown })
        : null;
      onStep({
        id: call.id,
        name: inner ? inner.name : call.name,
        status: call.is_error ? "error" : "success",
        origin: "server",
        args: inner ? inner.arguments : call.arguments,
        result: call.result,
      });
    });

  let turn = await postJson(
    "/extensions/michael-s-molina/chat/send",
    { history, client_tools: toolSpecs },
    signal,
  );
  emitServerCalls(turn);

  for (let i = 0; i < MAX_TURN_ROUND_TRIPS && turn.type === "client_action"; i += 1) {
    // Surface each call as "running" before dispatching, then resolve its
    // status from the tool result — so the trace updates live in the bubble.
    turn.calls.forEach((call) =>
      onStep({
        id: call.id,
        name: call.name,
        status: "running",
        origin: "client",
        args: call.arguments,
      }),
    );

    const results = await Promise.all(
      turn.calls.map(async (call) => {
        const tool = toolsByName.get(call.name);
        const result = tool
          ? await tool.handler(call.arguments)
          : { success: false, message: `Unknown client tool "${call.name}"` };
        const record = (result ?? {}) as { success?: boolean; message?: string };
        onStep({
          id: call.id,
          name: call.name,
          // Client tools return {success:false} on failure; anything else is a success.
          status: record.success === false ? "error" : "success",
          origin: "client",
          message: typeof record.message === "string" ? record.message : undefined,
          args: call.arguments,
          result,
        });
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
    emitServerCalls(turn);
  }

  if (turn.type === "client_action") {
    throw new Error("Chat turn did not resolve after the maximum number of tool round trips.");
  }

  return turn.content;
}

export default function ChatPanel() {
  const t = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<chat.DisplayMode>(chat.getDisplayMode());
  const abortControllerRef = useRef<AbortController | null>(null);
  // null means "not currently recalling history" — distinct from index 0,
  // which is the oldest message.
  const historyIndexRef = useRef<number | null>(null);
  const userHistory = useMemo(
    () => messages.filter((m) => m.role === "user").map((m) => String(m.content ?? "")),
    [messages],
  );
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

  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const keepListeningRef = useRef(false);
  const baseValueRef = useRef("");
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  function startRecording() {
    if (!SpeechRecognitionCtor || recognitionRef.current) return;

    baseValueRef.current = value;
    finalTranscriptRef.current = "";
    keepListeningRef.current = true;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += `${result[0].transcript} `;
        } else {
          interim += result[0].transcript;
        }
      }
      const base = baseValueRef.current;
      const separator = base && !base.endsWith(" ") ? " " : "";
      setValue(`${base}${separator}${finalTranscriptRef.current}${interim}`);
    };

    recognition.onerror = (event: any) => {
      // Only these two mean the user can't dictate at all — anything else
      // (e.g. transient "no-speech" or "network") is left to the onend
      // auto-restart below instead of killing the session.
      if (event.error === "not-allowed" || event.error === "audio-capture") {
        keepListeningRef.current = false;
      }
    };

    recognition.onend = () => {
      // continuous=true keeps the mic open across pauses in speech, but
      // some browsers still silently end the session on their own (long
      // silences, brief network hiccups) — restart transparently so the
      // user doesn't have to notice or re-click the mic mid-sentence.
      if (keepListeningRef.current) {
        recognition.start();
      } else {
        setRecording(false);
        recognitionRef.current = null;
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  function stopRecording() {
    keepListeningRef.current = false;
    recognitionRef.current?.stop();
  }

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
        // Assistant content is a TurnView React node (trace + reply); pass it
        // through untouched, and only markdown-render the plain-string case
        // (e.g. the "copy dashboard config" helper output).
        messageRender: (content: unknown) =>
          React.isValidElement(content)
            ? (content as React.ReactNode)
            : renderMarkdown(content),
      },
    }),
    [t],
  );

  async function handleSubmit(text: string) {
    if (!text.trim() || loading) return;
    stopRecording();
    historyIndexRef.current = null;

    const history: ChatTurn[] = [
      ...messages.map((m) => ({
        role: String(m.role),
        // Assistant bubbles hold a React node in `content`; their serializable
        // text lives in `text`. User bubbles hold a plain string.
        content:
          typeof m.content === "string" ? m.content : String(m.text ?? ""),
      })),
      { role: "user", content: text },
    ];

    const userKey = nextKey++;
    const turnKey = nextKey++;
    setMessages((prev) => [
      ...prev,
      { key: userKey, role: "user", content: text },
      {
        key: turnKey,
        role: "assistant",
        steps: [],
        text: "",
        content: <TurnView steps={[]} text="" loading />,
      },
    ]);
    setValue("");
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Merge a tool-step update into the in-flight assistant bubble and rebuild
    // its TurnView so the trace reflects it live.
    const applyStep = (step: ToolStep) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.key !== turnKey) return m;
          const prevSteps = m.steps ?? [];
          const steps = prevSteps.some((s) => s.id === step.id)
            ? prevSteps.map((s) => (s.id === step.id ? step : s))
            : [...prevSteps, step];
          return {
            ...m,
            steps,
            content: <TurnView steps={steps} text={m.text ?? ""} loading />,
          };
        }),
      );
    };

    const finish = (finalText: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.key === turnKey
            ? {
                ...m,
                text: finalText,
                content: (
                  <TurnView steps={m.steps ?? []} text={finalText} loading={false} />
                ),
              }
            : m,
        ),
      );
    };

    try {
      const content = await runChatTurn(
        history,
        dashboardTools,
        dashboardToolSpecs,
        controller.signal,
        applyStep,
      );
      finish(content);
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
      finish(wasCancelled ? message : `⚠️ ${message}`);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  // Only recalls history when the box is empty (or already mid-recall) —
  // otherwise ArrowUp/Down keep their normal job of moving the cursor
  // within whatever the user is typing.
  function handleSenderKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

    const navigating = historyIndexRef.current !== null;
    if (!navigating && value !== "") return;

    if (e.key === "ArrowUp") {
      if (userHistory.length === 0) return;
      const nextIndex = navigating ? Math.max(historyIndexRef.current! - 1, 0) : userHistory.length - 1;
      historyIndexRef.current = nextIndex;
      setValue(userHistory[nextIndex]);
      e.preventDefault();
    } else if (navigating) {
      const nextIndex = historyIndexRef.current! + 1;
      if (nextIndex >= userHistory.length) {
        historyIndexRef.current = null;
        setValue("");
      } else {
        historyIndexRef.current = nextIndex;
        setValue(userHistory[nextIndex]);
      }
      e.preventDefault();
    }
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
          onKeyDown={handleSenderKeyDown}
          loading={loading}
          placeholder="Type a message…"
          styles={SENDER_STYLES}
          allowSpeech={{
            recording,
            onRecordingChange: (next) => (next ? startRecording() : stopRecording()),
          }}
        />
      </div>
    </div>
  );
}
