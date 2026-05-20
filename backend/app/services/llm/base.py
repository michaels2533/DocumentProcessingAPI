"""Abstract base class for swappable chat/classification providers.

Each concrete provider (OpenAI, Anthropic, Ollama, ...) must implement
`complete_json`, which is the only call site the rest of the app uses for
structured extraction. Keeping the surface small makes adding new providers
cheap: implement one method and register it in `factory.get_chat_provider`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ChatProvider(ABC):
    """Provider-agnostic chat/classification interface.

    Implementations are expected to be cheap to construct and safe to use as
    long-lived singletons (the underlying SDK clients pool connections).
    """

    # Short identifier, e.g. "openai", "anthropic", "ollama". Useful for
    # logging and for tests that need to assert which provider was selected.
    name: str

    @abstractmethod
    async def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.0,
    ) -> dict[str, Any]:
        """Return a parsed JSON object produced by the model.

        The implementation is responsible for instructing the model to emit
        valid JSON (e.g. OpenAI's `response_format`, Ollama's `format=json`,
        or Anthropic's assistant prefill technique) and for parsing the
        response into a Python dict. Callers should treat the result as
        untrusted and validate it via Pydantic before persisting.
        """
        raise NotImplementedError
