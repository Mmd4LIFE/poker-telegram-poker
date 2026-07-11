"""WebSocket endpoint for the live poker table."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import AuthError, decode_access_token
from app.database import SessionLocal
from app.game.connection import hub
from app.game.manager import manager
from app.models import User
from app.services.rooms import get_room_by_code

router = APIRouter()
logger = logging.getLogger("poker.ws")

# Emotes players can send at the table (validated server-side).
ALLOWED_EMOTES = {
    "😀", "😎", "😂", "😍", "🤔", "😱", "😭", "😡", "🤡", "🥶",
    "👍", "👎", "🔥", "🎉", "🤝", "🍀", "💪", "🙏", "🤯", "🤑",
}


@router.websocket("/ws/room/{code}")
async def room_ws(websocket: WebSocket, code: str, token: str = Query(...)):
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (AuthError, KeyError, ValueError):
        await websocket.close(code=4401)
        return

    async with SessionLocal() as session:
        room = await get_room_by_code(session, code)
        if room is None:
            await websocket.close(code=4404)
            return
        user = await session.get(User, user_id)
        if user is None:
            await websocket.close(code=4401)
            return
        rt = await manager.get_runtime(session, room)
        room_id = room.id
        room_code = room.code

    rt.start()
    await hub.connect(room_code, user_id, websocket)
    try:
        await websocket.send_json(rt._render(user_id))
        while True:
            data = await websocket.receive_json()
            mtype = data.get("type")
            if mtype == "action":
                manager.handle_action(
                    room_id, user_id, data.get("action", "fold"),
                    int(data.get("amount", 0)),
                )
            elif mtype == "ping":
                await websocket.send_json({"type": "pong"})
            elif mtype == "sync":
                await websocket.send_json(rt._render(user_id))
            elif mtype == "emote":
                emote = str(data.get("emote", ""))
                if emote in ALLOWED_EMOTES:
                    await hub.broadcast(
                        room_code,
                        {"type": "emote", "user_id": user_id, "emote": emote},
                    )
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws error in room %s", room_code)
    finally:
        await hub.disconnect(room_code, user_id, websocket)
