"""Ties the local Superset MCP server (server tools) to the configured LLM
provider (the "brain") for one chat turn, pausing via a `ClientActionRequired`
turn when the model requests a tool only the browser can execute (e.g.
`dashboard.*`) and resuming once the frontend supplies that tool's result."""

from typing import Any

from .mcp_client import MCPClient
from .providers.base import Message, ToolSpec, Turn
from .providers.factory import get_provider


def start_turn(history: list[Message], client_tools: list[ToolSpec]) -> Turn:
    mcp = MCPClient()
    server_tools = mcp.list_tools()
    server_tool_names = {t["name"] for t in server_tools}
    provider = get_provider()
    return provider.start(
        history, [*server_tools, *client_tools], server_tool_names, mcp.call_tool
    )


def resume_turn(
    state: list[dict[str, Any]],
    resolved_results: list[dict[str, Any]],
    client_results: list[dict[str, Any]],
    client_tools: list[ToolSpec],
) -> Turn:
    mcp = MCPClient()
    server_tools = mcp.list_tools()
    server_tool_names = {t["name"] for t in server_tools}
    provider = get_provider()
    return provider.resume(
        state,
        resolved_results,
        client_results,
        [*server_tools, *client_tools],
        server_tool_names,
        mcp.call_tool,
    )
