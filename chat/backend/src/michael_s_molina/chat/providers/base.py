"""Provider-agnostic types for the chat extension's LLM backend.

The tool-calling loop mechanics are intentionally NOT modeled here —
different vendors' tool-call/tool-result message shapes differ enough that
normalizing the intermediate steps would be premature abstraction. Each
provider owns its entire loop and works with whatever message shape it
wants internally (carried opaquely in `state`); only the *outcome* of a
turn is shared here.

Two kinds of tools can be offered to the model in the same call: server
tools (executed here, via Superset's MCP server) and client tools (only the
browser can execute them, e.g. `dashboard.*`). A provider doesn't know which
category a tool name belongs to beyond checking it against
`server_tool_names` — anything else is assumed to require the client.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Protocol, TypedDict, Union


class Message(TypedDict):
    role: str  # "user" | "assistant"
    content: str


class ToolSpec(TypedDict):
    name: str
    description: str
    input_schema: dict[str, Any]


# Executes a server tool by name with the given arguments and returns a
# JSON-able result (or raises — the loop surfaces the error back to the
# model as a failed tool call rather than aborting the whole turn).
ServerToolCaller = Callable[[str, dict[str, Any]], Any]


@dataclass
class FinalAnswer:
    content: str
    type: Literal["final"] = "final"


@dataclass
class ClientActionRequired:
    """The model asked for at least one tool this backend doesn't own.

    `state` and `resolved_results` are opaque to the caller (the frontend
    just relays them back via `resume()` once it has executed `calls`
    itself) — they exist because a single model turn can mix server and
    client tool calls, and some vendors require every tool call in a turn to
    get a matching result before the conversation can continue.
    `resolved_results` holds whatever server tools in that same turn were
    already executed, so `resume()` can merge them with the client's results
    into one complete turn instead of losing that work.
    """

    state: list[dict[str, Any]]
    resolved_results: list[dict[str, Any]] = field(default_factory=list)
    calls: list[dict[str, Any]] = field(default_factory=list)
    type: Literal["client_action"] = "client_action"


Turn = Union[FinalAnswer, ClientActionRequired]


class LLMProvider(Protocol):
    def start(
        self,
        history: list[Message],
        tools: list[ToolSpec],
        server_tool_names: set[str],
        call_server_tool: ServerToolCaller,
    ) -> Turn:
        """Starts a new turn from plain conversation history."""
        ...

    def resume(
        self,
        state: list[dict[str, Any]],
        resolved_results: list[dict[str, Any]],
        client_results: list[dict[str, Any]],
        tools: list[ToolSpec],
        server_tool_names: set[str],
        call_server_tool: ServerToolCaller,
    ) -> Turn:
        """Continues a turn paused by a previous `ClientActionRequired`."""
        ...
