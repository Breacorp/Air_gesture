#!/usr/bin/env python3
"""
Air Gesture // Native macOS Input Engine Daemon (HARDENED)

WebSocket server on loopback only (ws://127.0.0.1:8765). Hardened per T01:

  * binds only to 127.0.0.1
  * validates the browser Origin against an allowlist
  * requires a per-session auth token before any input command
  * dispatches only allowlisted command types
  * validates and bounds every parameter
  * releases held keys/buttons on disconnect or 'stop'
  * never executes shell commands
"""

import asyncio
import json
import os
import secrets
import sys
from dataclasses import dataclass, field

import Quartz
from Quartz.CoreGraphics import (
    CGDisplayBounds,
    CGMainDisplayID,
    CGEventCreateMouseEvent,
    CGEventCreateScrollWheelEvent,
    CGEventCreateKeyboardEvent,
    CGEventSetFlags,
    CGEventPost,
    kCGHIDEventTap,
    kCGEventMouseMoved,
    kCGEventLeftMouseDown,
    kCGEventLeftMouseUp,
    kCGEventLeftMouseDragged,
    kCGEventRightMouseDown,
    kCGEventRightMouseUp,
    kCGEventOtherMouseDown,
    kCGEventOtherMouseUp,
    kCGEventOtherMouseDragged,
    kCGScrollEventUnitPixel,
    kCGEventFlagMaskCommand,
    kCGEventFlagMaskShift,
    kCGEventFlagMaskControl,
    kCGEventFlagMaskAlternate,
    CGPoint,
)
import websockets

KEY_MAP = {
    "a": 0x00, "s": 0x01, "d": 0x02, "w": 0x0D,
    "q": 0x0C, "e": 0x0E, "r": 0x0F, "f": 0x03, "z": 0x06, "x": 0x07, "c": 0x08,
    "left": 0x7B, "right": 0x7C, "down": 0x7D, "up": 0x7E,
    "space": 0x31, "return": 0x24, "enter": 0x24, "escape": 0x35, "esc": 0x35,
    "tab": 0x30, "backspace": 0x33, "delete": 0x75,
    "plus": 0x18, "=": 0x18, "minus": 0x1B, "-": 0x1B,
    "1": 0x12, "2": 0x13, "3": 0x14, "4": 0x15, "5": 0x17,
}

MODIFIER_MAP = {
    "cmd": kCGEventFlagMaskCommand, "command": kCGEventFlagMaskCommand,
    "shift": kCGEventFlagMaskShift,
    "ctrl": kCGEventFlagMaskControl, "control": kCGEventFlagMaskControl,
    "alt": kCGEventFlagMaskAlternate, "option": kCGEventFlagMaskAlternate,
}

# Security policy
ALLOWED_ORIGINS = {
    None,  # local non-browser clients (e.g. debugging); still require token
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://air-gesture-pi.vercel.app",
}
ALLOWED_COMMANDS = {
    "move", "pointer_move", "mouse_down", "pointer_down", "mouse_up", "pointer_up",
    "drag_start", "drag", "drag_move", "drag_end", "scroll", "click", "stop",
    "key_down", "key_up", "key_tap", "hotkey", "auth",
}
BUTTONS = {"left", "right", "middle"}
MAX_COORD = 100000  # generous; clamped to display
MAX_SCROLL = 10000


def get_screen_bounds():
    main_display = CGMainDisplayID()
    bounds = CGDisplayBounds(main_display)
    return {"width": int(bounds.size.width), "height": int(bounds.size.height)}


@dataclass
class Session:
    websocket: object
    authenticated: bool = False
    held_keys: set = field(default_factory=set)
    held_buttons: set = field(default_factory=set)


class MacOSInputDispatcher:
    def __init__(self):
        self.bounds = get_screen_bounds()
        self.last_x = self.bounds["width"] / 2
        self.last_y = self.bounds["height"] / 2
        self.active_keys = set()
        print(f"[macOS Input Engine] Initialized for Display: {self.bounds['width']}x{self.bounds['height']}")

    def _clamp(self, x, y):
        x = max(0, min(self.bounds["width"], float(x)))
        y = max(0, min(self.bounds["height"], float(y)))
        return x, y

    def move(self, x, y):
        x, y = self._clamp(x, y)
        self.last_x, self.last_y = x, y
        event = CGEventCreateMouseEvent(None, kCGEventMouseMoved, CGPoint(x=x, y=y), 0)
        if event:
            CGEventPost(kCGHIDEventTap, event)

    def mouse_down(self, x, y, button="left", held=None):
        x, y = self._clamp(x, y)
        self.last_x, self.last_y = x, y
        if button == "left":
            et, bid = kCGEventLeftMouseDown, 0
        elif button == "right":
            et, bid = kCGEventRightMouseDown, 1
        else:
            et, bid = kCGEventOtherMouseDown, 2
        event = CGEventCreateMouseEvent(None, et, CGPoint(x=x, y=y), bid)
        if event:
            CGEventPost(kCGHIDEventTap, event)
        if held is not None:
            held.add(button)

    def mouse_up(self, x, y, button="left", held=None):
        x, y = self._clamp(x, y)
        self.last_x, self.last_y = x, y
        if button == "left":
            et, bid = kCGEventLeftMouseUp, 0
        elif button == "right":
            et, bid = kCGEventRightMouseUp, 1
        else:
            et, bid = kCGEventOtherMouseUp, 2
        event = CGEventCreateMouseEvent(None, et, CGPoint(x=x, y=y), bid)
        if event:
            CGEventPost(kCGHIDEventTap, event)
        if held is not None:
            held.discard(button)

    def drag(self, x, y, button="left"):
        x, y = self._clamp(x, y)
        self.last_x, self.last_y = x, y
        et = kCGEventLeftMouseDragged if button == "left" else kCGEventOtherMouseDragged
        bid = 0 if button == "left" else 2
        event = CGEventCreateMouseEvent(None, et, CGPoint(x=x, y=y), bid)
        if event:
            CGEventPost(kCGHIDEventTap, event)

    def scroll(self, delta_y, delta_x=0):
        dy = max(-MAX_SCROLL, min(MAX_SCROLL, int(delta_y)))
        dx = max(-MAX_SCROLL, min(MAX_SCROLL, int(delta_x)))
        event = CGEventCreateScrollWheelEvent(None, kCGScrollEventUnitPixel, 2, int(-dy), int(-dx))
        if event:
            CGEventPost(kCGHIDEventTap, event)

    def click(self, x, y, button="left"):
        self.mouse_down(x, y, button)
        self.mouse_up(x, y, button)

    def _resolve_keycode(self, key):
        if isinstance(key, int) and 0 <= key <= 0xFF:
            return key
        if isinstance(key, str):
            return KEY_MAP.get(key.lower())
        return None

    def key_down(self, key, active):
        code = self._resolve_keycode(key)
        if code is None or code in self.active_keys:
            return
        self.active_keys.add(code)
        event = CGEventCreateKeyboardEvent(None, code, True)
        if event:
            CGEventPost(kCGHIDEventTap, event)
        active.add(code)

    def key_up(self, key, active):
        code = self._resolve_keycode(key)
        if code is None or code not in self.active_keys:
            return
        self.active_keys.discard(code)
        event = CGEventCreateKeyboardEvent(None, code, False)
        if event:
            CGEventPost(kCGHIDEventTap, event)
        active.discard(code)

    def key_tap(self, key):
        code = self._resolve_keycode(key)
        if code is None:
            return False
        e_down = CGEventCreateKeyboardEvent(None, code, True)
        e_up = CGEventCreateKeyboardEvent(None, code, False)
        if e_down and e_up:
            CGEventPost(kCGHIDEventTap, e_down)
            CGEventPost(kCGHIDEventTap, e_up)
            return True
        return False

    def hotkey(self, modifiers, key):
        code = self._resolve_keycode(key)
        if code is None:
            return False
        flag_mask = 0
        for mod in modifiers or []:
            m = MODIFIER_MAP.get(str(mod).lower())
            if m is not None:
                flag_mask |= m
        e_down = CGEventCreateKeyboardEvent(None, code, True)
        e_up = CGEventCreateKeyboardEvent(None, code, False)
        if flag_mask:
            CGEventSetFlags(e_down, flag_mask)
            CGEventSetFlags(e_up, flag_mask)
        if e_down and e_up:
            CGEventPost(kCGHIDEventTap, e_down)
            CGEventPost(kCGHIDEventTap, e_up)
            return True
        return False

    def release_session(self, session):
        # release keys held by this session that are still active
        for code in list(session.held_keys):
            event = CGEventCreateKeyboardEvent(None, code, False)
            if event:
                CGEventPost(kCGHIDEventTap, event)
            self.active_keys.discard(code)
        session.held_keys.clear()
        # release held mouse buttons at last known position
        for btn in list(session.held_buttons):
            self.mouse_up(self.last_x, self.last_y, btn)
        session.held_buttons.clear()

    def release_all(self):
        for code in list(self.active_keys):
            event = CGEventCreateKeyboardEvent(None, code, False)
            if event:
                CGEventPost(kCGHIDEventTap, event)
        self.active_keys.clear()


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_coords(data):
    x = data.get("x", 0)
    y = data.get("y", 0)
    if not (_is_number(x) and _is_number(y)):
        return None
    if abs(x) > MAX_COORD or abs(y) > MAX_COORD:
        return None
    return float(x), float(y)


def normalize_origin(origin):
    if origin is None:
        return None
    origin = origin.strip()
    # drop path/query
    if "://" in origin:
        # keep scheme://host[:port]
        parts = origin.split("/", 3)
        origin = "/".join(parts[:3])
    return origin


dispatcher = MacOSInputDispatcher()
AUTH_TOKEN = os.environ.get("AIR_GESTURE_TOKEN") or secrets.token_urlsafe(24)


def origin_allowed(origin):
    norm = normalize_origin(origin)
    if norm in ALLOWED_ORIGINS:
        return True
    # allow any localhost port
    if norm and (norm.startswith("http://localhost:") or norm.startswith("http://127.0.0.1:")):
        return True
    return False


async def handler(websocket):
    origin = None
    try:
        origin = websocket.request_headers.get("Origin")
    except Exception:
        try:
            origin = websocket.headers.get("Origin")
        except Exception:
            origin = None

    print(f"[macOS Input Engine] Client connecting from {websocket.remote_address} origin={origin}")
    if not origin_allowed(origin):
        print("[macOS Input Engine] Rejected: origin not allowed")
        await websocket.close(code=4403, reason="origin not allowed")
        return

    session = Session(websocket=websocket)
    # hello (no handshake_ok until auth)
    await websocket.send(json.dumps({"type": "hello", "requiresAuth": True}))

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except Exception:
                await websocket.send(json.dumps({"type": "error", "error": "invalid json"}))
                continue

            if not isinstance(data, dict):
                await websocket.send(json.dumps({"type": "error", "error": "invalid payload"}))
                continue

            msg_type = data.get("type")
            if msg_type not in ALLOWED_COMMANDS:
                await websocket.send(json.dumps({"type": "error", "error": "command not allowed"}))
                continue

            # Auth gate
            if msg_type == "auth":
                tok = data.get("token")
                if tok and secrets.compare_digest(str(tok), AUTH_TOKEN):
                    session.authenticated = True
                    await websocket.send(json.dumps({
                        "type": "handshake_ok",
                        "screen": dispatcher.bounds,
                        "platform": "darwin",
                        "capabilities": ["mouse", "keyboard", "scroll", "hotkeys"],
                    }))
                    print("[macOS Input Engine] Session authenticated")
                else:
                    await websocket.send(json.dumps({"type": "error", "error": "auth failed"}))
                continue

            if not session.authenticated:
                await websocket.send(json.dumps({"type": "error", "error": "not authenticated"}))
                continue

            # stop releases everything
            if msg_type == "stop":
                dispatcher.release_session(session)
                await websocket.send(json.dumps({"type": "ok"}))
                continue

            # ---- Mouse commands ----
            if msg_type in ("move", "pointer_move"):
                coords = validate_coords(data)
                if coords is None:
                    await websocket.send(json.dumps({"type": "error", "error": "bad coords"}))
                    continue
                dispatcher.move(*coords)

            elif msg_type in ("mouse_down", "pointer_down"):
                coords = validate_coords(data)
                if coords is None:
                    await websocket.send(json.dumps({"type": "error", "error": "bad coords"}))
                    continue
                button = data.get("button", "left")
                if button not in BUTTONS:
                    await websocket.send(json.dumps({"type": "error", "error": "bad button"}))
                    continue
                dispatcher.mouse_down(*coords, button=button, held=session.held_buttons)

            elif msg_type in ("mouse_up", "pointer_up"):
                coords = validate_coords(data)
                if coords is None:
                    await websocket.send(json.dumps({"type": "error", "error": "bad coords"}))
                    continue
                button = data.get("button", "left")
                if button not in BUTTONS:
                    await websocket.send(json.dumps({"type": "error", "error": "bad button"}))
                    continue
                dispatcher.mouse_up(*coords, button=button, held=session.held_buttons)

            elif msg_type == "drag_start":
                coords = validate_coords(data)
                if coords is None:
                    await websocket.send(json.dumps({"type": "error", "error": "bad coords"}))
                    continue
                dispatcher.mouse_down(*coords, button="left", held=session.held_buttons)

            elif msg_type in ("drag", "drag_move"):
                coords = validate_coords(data)
                if coords is None:
                    await websocket.send(json.dumps({"type": "error", "error": "bad coords"}))
                    continue
                button = data.get("button", "left")
                if button not in BUTTONS:
                    await websocket.send(json.dumps({"type": "error", "error": "bad button"}))
                    continue
                dispatcher.drag(*coords, button=button)

            elif msg_type == "drag_end":
                coords = validate_coords(data)
                if coords is None:
                    await websocket.send(json.dumps({"type": "error", "error": "bad coords"}))
                    continue
                dispatcher.mouse_up(*coords, button="left", held=session.held_buttons)

            elif msg_type == "scroll":
                dx = data.get("deltaX", data.get("delta_x", 0))
                dy = data.get("deltaY", data.get("delta_y", 0))
                if not (_is_number(dx) and _is_number(dy)):
                    await websocket.send(json.dumps({"type": "error", "error": "bad scroll"}))
                    continue
                dispatcher.scroll(dy, dx)

            elif msg_type == "click":
                coords = validate_coords(data)
                if coords is None:
                    await websocket.send(json.dumps({"type": "error", "error": "bad coords"}))
                    continue
                button = data.get("button", "left")
                if button not in BUTTONS:
                    await websocket.send(json.dumps({"type": "error", "error": "bad button"}))
                    continue
                dispatcher.click(*coords, button=button)

            # ---- Keyboard commands ----
            elif msg_type == "key_down":
                key = data.get("key")
                code = dispatcher._resolve_keycode(key)
                if code is None:
                    await websocket.send(json.dumps({"type": "error", "error": "unknown key"}))
                    continue
                dispatcher.key_down(key, session.held_keys)

            elif msg_type == "key_up":
                key = data.get("key")
                code = dispatcher._resolve_keycode(key)
                if code is None:
                    await websocket.send(json.dumps({"type": "error", "error": "unknown key"}))
                    continue
                dispatcher.key_up(key, session.held_keys)

            elif msg_type == "key_tap":
                key = data.get("key")
                if not dispatcher.key_tap(key):
                    await websocket.send(json.dumps({"type": "error", "error": "unknown key"}))
                    continue

            elif msg_type == "hotkey":
                modifiers = data.get("modifiers", [])
                key = data.get("key")
                if not isinstance(modifiers, list):
                    await websocket.send(json.dumps({"type": "error", "error": "bad modifiers"}))
                    continue
                if not all(str(m).lower() in MODIFIER_MAP for m in modifiers):
                    await websocket.send(json.dumps({"type": "error", "error": "unknown modifier"}))
                    continue
                if not dispatcher.hotkey(modifiers, key):
                    await websocket.send(json.dumps({"type": "error", "error": "unknown key"}))
                    continue

    except websockets.exceptions.ConnectionClosed:
        print("[macOS Input Engine] Client disconnected; releasing held inputs.")
    finally:
        dispatcher.release_session(session)

async def main():
    port = 8765
    token_hint = AUTH_TOKEN
    print(f"[macOS Input Engine] Listening on ws://127.0.0.1:{port} ...")
    print(f"[macOS Input Engine] Session token: {token_hint}")
    print("Set AIR_GESTURE_TOKEN env to use a fixed token.")
    async with websockets.serve(handler, "127.0.0.1", port):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        dispatcher.release_all()
        print("\n[macOS Input Engine] Clean shutdown.")