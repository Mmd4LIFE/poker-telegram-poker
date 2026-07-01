"""Per-room websocket connection registry with per-viewer state rendering."""
from __future__ import annotations

import asyncio
import logging

from fastapi import WebSocket

logger = logging.getLogger("poker.ws")


class ConnectionHub:
    def __init__(self) -> None:
        # room_code -> set of (user_id, websocket)
        self._rooms: dict[str, set[tuple[int, WebSocket]]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, room_code: str, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._rooms.setdefault(room_code, set()).add((user_id, ws))

    async def disconnect(self, room_code: str, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._rooms.get(room_code)
            if conns:
                conns.discard((user_id, ws))
                if not conns:
                    self._rooms.pop(room_code, None)

    def viewers(self, room_code: str) -> set[int]:
        return {uid for uid, _ in self._rooms.get(room_code, set())}

    def has_viewers(self, room_code: str) -> bool:
        return bool(self._rooms.get(room_code))

    async def send_personalised(self, room_code: str, render) -> None:
        """render(user_id) -> dict payload sent to that user's sockets."""
        conns = list(self._rooms.get(room_code, set()))
        dead: list[tuple[int, WebSocket]] = []
        for user_id, ws in conns:
            try:
                await ws.send_json(render(user_id))
            except Exception:
                dead.append((user_id, ws))
        if dead:
            async with self._lock:
                c = self._rooms.get(room_code)
                if c:
                    for item in dead:
                        c.discard(item)

    async def broadcast(self, room_code: str, payload: dict) -> None:
        await self.send_personalised(room_code, lambda _uid: payload)


hub = ConnectionHub()
