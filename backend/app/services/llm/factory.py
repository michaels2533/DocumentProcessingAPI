"""Factory that resolves the configured `ChatProvider` from settings.

The result is memoised so SDK clients (and their underlying HTTP connection
pools) are constructed once per process. Mutating `LLM_PROVIDER` at runtime
has no effect; restart the process to pick up changes.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.services.llm.anthropic_provider import AnthropicChatProvider
from app.services.llm.base import ChatProvider
from app.services.llm.ollama_provider import OllamaChatProvider
from app.services.llm.openai_provider import OpenAIChatProvider


_SUPPORTED = ("openai", "anthropic", "ollama")


@lru_cache
def get_chat_provider() -> ChatProvider:
    settings = get_settings()
    provider = settings.llm_provider.strip().lower()

    if provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError(
                "LLM_PROVIDER=openai but OPENAI_API_KEY is not set."
            )
        return OpenAIChatProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_chat_model,
        )

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set."
            )
        return AnthropicChatProvider(
            api_key=settings.anthropic_api_key,
            model=settings.anthropic_chat_model,
        )

    if provider == "ollama":
        return OllamaChatProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_chat_model,
        )

    raise ValueError(
        f"Unsupported LLM_PROVIDER={settings.llm_provider!r}. "
        f"Must be one of: {', '.join(_SUPPORTED)}."
    )
