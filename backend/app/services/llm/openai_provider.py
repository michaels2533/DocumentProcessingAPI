"""OpenAI implementation of the `ChatProvider` interface."""

from __future__ import annotations

import json
from typing import Any

from openai import AsyncOpenAI

from app.services.llm.base import ChatProvider


class OpenAIChatProvider(ChatProvider):
    name = "openai"

    def __init__(self, *, api_key: str, model: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.0,
    ) -> dict[str, Any]:
        # `response_format={"type": "json_object"}` guarantees the model
        # returns a syntactically valid JSON object (schema is still our
        # responsibility, enforced downstream by Pydantic).
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or "{}"
        return json.loads(content)
