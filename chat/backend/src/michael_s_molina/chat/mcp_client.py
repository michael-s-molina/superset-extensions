"""Thin sync wrapper around the MCP Python SDK's streamable-http client,
connecting to Superset's own local MCP server (see `superset mcp run`).

Opens a fresh session per call rather than holding one open across a whole
chat turn — simpler to reason about across Flask's sync request handling,
at the cost of reconnecting for every tool call. Fine for this prototype's
request volume; worth pooling a session per turn if that ever matters.
"""

import asyncio
import os
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from .providers.base import ToolSpec

DEFAULT_MCP_URL = "http://127.0.0.1:5008/mcp"


def _extract_text(content: list[Any]) -> str:
    parts = [block.text for block in content if getattr(block, "text", None)]
    return "\n".join(parts) if parts else str(content)


async def _list_tools_async(url: str) -> list[ToolSpec]:
    async with streamablehttp_client(url) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            return [
                {
                    "name": t.name,
                    "description": t.description or "",
                    "input_schema": t.inputSchema,
                }
                for t in result.tools
            ]


async def _call_tool_async(url: str, name: str, arguments: dict[str, Any]) -> str:
    async with streamablehttp_client(url) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(name, arguments)
            text = _extract_text(result.content)
            if result.isError:
                raise RuntimeError(text)
            return text


class MCPClient:
    def __init__(self, url: str | None = None) -> None:
        self._url = url or os.environ.get("CHAT_MCP_URL", DEFAULT_MCP_URL)

    def list_tools(self) -> list[ToolSpec]:
        return asyncio.run(_list_tools_async(self._url))

    def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        return asyncio.run(_call_tool_async(self._url, name, arguments))
