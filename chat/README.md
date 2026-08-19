# Chat

A chat panel extension for Superset. It runs a tool-calling loop against
Superset's own MCP server tools and against client-side tools contributed
by other extensions (e.g. editing the Dashboard v2 prototype canvas), so an
agent can inspect and act on what's currently in Superset, not just answer
questions in isolation.

## Requirements: bring your own LLM provider

**`chat` has no built-in connection to any LLM vendor.** It only implements
the chat UI, the send/resume request loop, and the `LLMProvider` protocol -
an actual connection to a model must come from a **separate,
separately-installed extension**. This is what lets `chat` be reused
as-is by anyone, regardless of which LLM they use or how they authenticate
to it.

If no provider extension is installed, every chat request fails with:

```
No LLM provider is installed. chat has no built-in connection to any LLM -
install an extension that registers one via
providers.registry.register_provider() from its own backend entrypoint.
```

## Installation

1. Bundle the extension:

   ```bash
   cd chat
   superset-extensions bundle
   ```

2. Copy the generated `.supx` file to your Superset extensions directory
   (configured via `EXTENSIONS_PATH` in `superset_config.py`), or point
   `LOCAL_EXTENSIONS` at this directory for local development. See the
   [deployment documentation](https://superset.apache.org/developer_portal/extensions/deployment)
   for details.

3. Install (or write) at least one provider extension - see below. Without
   one, the extension loads but every chat request fails with the error
   above.

## Writing a provider extension

A provider extension needs two things: a class, and a registration call.

**1. Implement the `LLMProvider` protocol** (`chat.providers.base`) - two
methods, `start()` for a fresh turn and `resume()` for continuing one that
paused on a client-side tool call:

```python
from michael_s_molina.chat.providers.base import (
    ClientActionRequired, FinalAnswer, LLMProvider, Message, ServerToolCaller,
    ToolSpec, Turn,
)

class MyProvider:  # implements LLMProvider structurally - no base class required
    def start(
        self,
        history: list[Message],
        tools: list[ToolSpec],
        server_tool_names: set[str],
        call_server_tool: ServerToolCaller,
    ) -> Turn:
        # call your model, execute any server tool via call_server_tool(),
        # and return FinalAnswer(...) or ClientActionRequired(...)
        ...

    def resume(self, state, resolved_results, client_results, tools,
               server_tool_names, call_server_tool) -> Turn:
        ...
```

Both `FinalAnswer` and `ClientActionRequired` accept an optional
`server_calls` list - a **display-only** trace of the server (MCP) tools your
loop ran during that leg, so the chat UI can show them (tagged as server-origin)
alongside the client tools the browser dispatched. Populate it if you want that
visibility; each entry is
`{"id", "name", "arguments", "result", "is_error"}`. It defaults to empty, so a
provider that ignores it still works - it just won't surface backend tool calls
in the trace. This is distinct from `ClientActionRequired.resolved_results`,
which carries the raw tool-result blocks needed to stitch the conversation back
together and is **not** for display.

**2. Register it from your own extension's backend entrypoint** - this
runs automatically when Superset starts, before `chat` ever looks up a
provider:

```python
# backend/src/<publisher>/<name>/entrypoint.py
from michael_s_molina.chat.providers.registry import register_provider
from .provider import MyProvider

register_provider("my-provider", MyProvider)
```

That's it - `chat` never imports your extension directly; it just picks up
whatever registered itself. `chat` doesn't ship a base class for any
specific vendor's wire format - your provider's `_loop`-equivalent, request
shape, and auth are entirely your own to implement, against whatever SDK
or HTTP client your vendor needs.

For a complete, real example of a provider extension (talking to Claude
through an internal company gateway, authenticating via a cached token
instead of a bare API key), see the `devaigateway-provider` extension in
this repo - note that it's a private example specific to that deployment,
not something this repo depends on or ships by default.

## Configuration

- `CHAT_MCP_URL` - URL of Superset's own local MCP server (default
  `http://127.0.0.1:5008/mcp`). Only needed if it's not running on the
  default port.

Any provider-specific configuration (API keys, base URLs, auth) belongs to
that provider extension, not to `chat` - see the provider's own README.

## Usage

Open the chat panel (floating or docked, toggle via the panel header) and
ask it to inspect or build on the current dashboard. The "Build default
dashboard" button in the panel header populates a sample executive-report
layout for exercising the canvas without going through the model.
