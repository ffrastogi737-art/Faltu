"""Fan-out of job updates from the worker thread to WebSocket clients."""
import asyncio
from typing import Optional

from fastapi.encoders import jsonable_encoder

loop: Optional[asyncio.AbstractEventLoop] = None
subscribers: set[asyncio.Queue] = set()


def publish(message: dict) -> None:
    if loop is None or loop.is_closed():
        return
    message = jsonable_encoder(message)  # datetimes -> strings
    for q in list(subscribers):
        loop.call_soon_threadsafe(q.put_nowait, message)
