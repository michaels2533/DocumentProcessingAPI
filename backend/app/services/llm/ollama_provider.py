"""Ollama (local) implementation of the `ChatProvider` interface.

Talks to a local Ollama server over HTTP (default: http://localhost:11434).
Selected when the operator wants full data privacy: no document text leaves
the host running Ollama. The Ollama chat API supports `format=json`, which
constrains the model to emit a valid JSON object.

Reference: https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.services.llm.base import ChatProvider


# Local models are slower than hosted APIs; allow a generous default ceiling.
_DEFAULT_TIMEOUT_SECONDS = 120.0


class OllamaChatProvider(ChatProvider):
    name = "ollama"

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout: float = _DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
        )
        self._model = model

    async def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.0,
    ) -> dict[str, Any]:
        resp = await self._client.post(
            "/api/chat",
            json={
                "model": self._model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "options": {"temperature": temperature},
                "format": "json",
                "stream": False,
            },
        )
        resp.raise_for_status()
        body = resp.json()
        # `/api/chat` returns `{"message": {"role": "assistant", "content": "..."}, ...}`
        # where `content` is the JSON string we asked for.
        return json.loads(body["message"]["content"])
