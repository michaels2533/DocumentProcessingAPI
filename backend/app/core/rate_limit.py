"""Rate limiting configuration using SlowAPI.

A single shared `Limiter` instance is created here and imported by the
routers and the FastAPI app factory. Limits are keyed on the client's IP
address (via `get_remote_address`), so each IP gets its own bucket.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
