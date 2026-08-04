"""Self-registration registry for LLMProviders contributed by other,
independently-installed extensions.

Any extension can call `register_provider` from its own backend entrypoint
to add itself under a name. This works reliably regardless of load order
between the two extensions: Superset eagerly imports every loaded
extension's backend entrypoint at startup (see
superset/initialization/__init__.py's init_extensions), which always
happens before this extension's own factory.get_provider() is ever called
from a request - so a registration call made at entrypoint-import time is
guaranteed to have already run.

factory.get_provider() picks whichever single provider is registered - no
configuration needed on the operator's side.
"""

from .base import LLMProvider

_registered_providers: dict[str, type[LLMProvider]] = {}


def register_provider(provider_id: str, provider_cls: type[LLMProvider]) -> None:
    _registered_providers[provider_id] = provider_cls


def get_registered_provider(provider_id: str) -> type[LLMProvider] | None:
    return _registered_providers.get(provider_id)


def list_registered_providers() -> list[str]:
    return list(_registered_providers)
