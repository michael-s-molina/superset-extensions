"""Selects which LLMProvider backs the chat extension.

`chat` has no built-in connection to any LLM vendor - it only defines the
LLMProvider protocol (base.py). An actual, connectable provider must come
from a separate installed extension that calls
`providers.registry.register_provider` from its own backend entrypoint (see
registry.py's own docstring for why this works regardless of which of the
two extensions loads first). That's what lets `chat` be reused as-is by
anyone - a provider talking to one vendor's public API, one talking to an
internal company gateway, or one for a completely different vendor are all
equally "just another extension" to chat, none privileged.
"""

from .base import LLMProvider
from .registry import get_registered_provider, list_registered_providers


def get_provider() -> LLMProvider:
    registered = list_registered_providers()

    if not registered:
        raise RuntimeError(
            "No LLM provider is installed. chat has no built-in connection "
            "to any LLM - install an extension that registers one via "
            "providers.registry.register_provider() from its own backend "
            "entrypoint."
        )

    if len(registered) > 1:
        raise RuntimeError(
            "Multiple LLM providers are registered by installed extensions "
            f"({', '.join(registered)}), and chat has no way to choose "
            "between them automatically. Uninstall all but one."
        )

    provider_cls = get_registered_provider(registered[0])
    assert provider_cls is not None  # just checked above
    return provider_cls()
