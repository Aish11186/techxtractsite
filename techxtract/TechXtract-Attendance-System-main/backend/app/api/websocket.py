from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.app.services.attendance_service import notifier

router = APIRouter(prefix="/ws", tags=["Realtime WebSocket"])

@router.websocket("/events/{event_id}")
async def websocket_event_attendance(websocket: WebSocket, event_id: int):
    await websocket.accept()
    notifier.register(event_id, websocket)
    try:
        # Keep connection open and handle incoming ping/heartbeats
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        notifier.unregister(event_id, websocket)
    except Exception:
        notifier.unregister(event_id, websocket)
