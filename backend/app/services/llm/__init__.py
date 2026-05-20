"""LLM provider abstraction for chat/classification.

The embedding model is deliberately **not** part of this package: it is
locked at deploy time (see `app.services.embedding_service`) so every row in
the `documents` table shares the same vector space and dimension. Only the
chat/classification provider is swappable at runtime via the `LLM_PROVIDER`
environment variable.

Public surface:
    - `ChatProvider`    : abstract base every provider implements.
    - `get_chat_provider()`: cached factory that returns the configured provider.
"""

from app.services.llm.base import ChatProvider
from app.services.llm.factory import get_chat_provider

__all__ = ["ChatProvider", "get_chat_provider"]
