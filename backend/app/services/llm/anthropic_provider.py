"""Anthropic (Claude) implementation of the `ChatProvider` interface.

Anthropic's Messages API does not have a native "JSON mode" toggle like
OpenAI, but it supports *assistant prefill*: any text supplied as the final
assistant message becomes the start of the model's response. Prefilling an
opening brace `{` forces the model to continue with a JSON object.
"""

from __future__ import annotations

import json
from typing import Any

from anthropic import AsyncAnthropic

from app.services.llm.base import ChatProvider


# Anthropic requires `max_tokens` on every request. 2048 is generous for the
# JSON classification payload we ask for (doc_type + a handful of entity
# arrays); raise this if a future use case needs longer completions.
_DEFAULT_MAX_TOKENS = 2048


class AnthropicChatProvider(ChatProvider):
    name = "anthropic"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        max_tokens: int = _DEFAULT_MAX_TOKENS,
    ) -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model
        self._max_tokens = max_tokens

    async def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.0,
    ) -> dict[str, Any]:
        # Reinforce the JSON-only contract in the system prompt and prefill
        # the assistant turn with `{` so the response is guaranteed to start
        # as a JSON object. We then re-prepend `{` before parsing.
        message = await self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            temperature=temperature,
            system=system_prompt + "\n\nRespond with a single JSON object only. No prose, no markdown.",
            messages=[
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": "{"},
            ],
        )

        body = "{" + "".join(
            block.text for block in message.content if getattr(block, "type", None) == "text"
        )
        return json.loads(body)
