#!/usr/bin/env python3
"""
Air Gesture // Native macOS Input Engine Daemon
WebSocket Server (ws://127.0.0.1:8765) bridging gestural events directly into
macOS WindowServer via Quartz / CoreGraphics.
Supports Mouse (L/R/M, Move, Drag, Scroll) and Full Keyboard (Keys, Hotkeys, Modifiers).
"""

import sys
import json
import asyncio
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
    CGPoint
)
import websockets

# macOS Virtual Key Codes Mapping
KEY_MAP = {
    # Letters (WASD & Navigation)
    "a": 0x00, "s": 0x01, "d": 0x02, "w": 0x0D,
    "q": 0x0C, "e": 0x0E, "r": 0x0F, "f": 0x03, "z": 0x06, "x": 0x07, "c": 0x08,
    # Navigation / Arrows
    "left": 0x7B, "right": 0x7C, "down": 0x7D, "up": 0x7E,
    # Action Keys
    "space": 0x31,
    "return": 0x24, "enter": 0x24,
    "escape": 0x35, "esc": 0x35,
    "tab": 0x30,
    "backspace": 0x33,
    "delete": 0x75,
    # Zoom / Scaling
    "plus": 0x18, "=": 0x18,
    "minus": 0x1B, "-": 0x1B,
    # Numbers
    "1": 0x12, "2": 0x13, "3": 0x14, "4": 0x15, "5": 0x17
}

MODIFIER_MAP = {
    "cmd": kCGEventFlagMaskCommand,
    "command": kCGEventFlagMaskCommand,
    "shift": kCGEventFlagMaskShift,
    "ctrl": kCGEventFlagMaskControl,
    "control": kCGEventFlagMaskControl,
    "alt": kCGEventFlagMaskAlternate,
    "option": kCGEventFlagMaskAlternate
}

def get_screen_bounds():
    main_display = CGMainDisplayID()
    bounds = CGDisplayBounds(main_display)
    return {
        "width": int(bounds.size.width),
        "height": int(bounds.size.height)
    }

class MacOSInputDispatcher:
    def __init__(self):
        self.bounds = get_screen_bounds()
        self.last_x = self.bounds["width"] / 2
        self.last_y = self.bounds["height"] / 2
        self.active_keys = set()
        print(f"[macOS Input Engine] Initialized for Display: {self.bounds['width']}x{self.bounds['height']}")

    # --- MOUSE METHODS ---
    def move(self, x, y):
        self.last_x = x
        self.last_y = y
        point = CGPoint(x=x, y=y)
        event = CGEventCreateMouseEvent(None, kCGEventMouseMoved, point, 0)
        if event:
            CGEventPost(kCGHIDEventTap, event)

    def mouse_down(self, x, y, button="left"):
        self.last_x = x
        self.last_y = y
        point = CGPoint(x=x, y=y)
        if button == "left":
            event_type = kCGEventLeftMouseDown
            btn_id = 0
        elif button == "right":
            event_type = kCGEventRightMouseDown
            btn_id = 1
        else: # middle
            event_type = kCGEventOtherMouseDown
            btn_id = 2

        event = CGEventCreateMouseEvent(None, event_type, point, btn_id)
        if event:
            CGEventPost(kCGHIDEventTap, event)

    def mouse_up(self, x, y, button="left"):
        self.last_x = x
        self.last_y = y
        point = CGPoint(x=x, y=y)
        if button == "left":
            event_type = kCGEventLeftMouseUp
            btn_id = 0
        elif button == "right":
            event_type = kCGEventRightMouseUp
            btn_id = 1
        else: # middle
            event_type = kCGEventOtherMouseUp
            btn_id = 2

        event = CGEventCreateMouseEvent(None, event_type, point, btn_id)
        if event:
            CGEventPost(kCGHIDEventTap, event)

    def drag(self, x, y, button="left"):
        self.last_x = x
        self.last_y = y
        point = CGPoint(x=x, y=y)
        event_type = kCGEventLeftMouseDragged if button == "left" else kCGEventOtherMouseDragged
        btn_id = 0 if button == "left" else 2
        event = CGEventCreateMouseEvent(None, event_type, point, btn_id)
        if event:
            CGEventPost(kCGHIDEventTap, event)

    def scroll(self, delta_y, delta_x=0):
        # Invert delta_y for natural scrolling
        event = CGEventCreateScrollWheelEvent(None, kCGScrollEventUnitPixel, 2, int(-delta_y), int(-delta_x))
        if event:
            CGEventPost(kCGHIDEventTap, event)

    def click(self, x, y, button="left"):
        self.mouse_down(x, y, button)
        self.mouse_up(x, y, button)

    # --- KEYBOARD METHODS ---
    def _resolve_keycode(self, key):
        if isinstance(key, int):
            return key
        return KEY_MAP.get(str(key).lower())

    def key_down(self, key):
        code = self._resolve_keycode(key)
        if code is not None and code not in self.active_keys:
            self.active_keys.add(code)
            event = CGEventCreateKeyboardEvent(None, code, True)
            if event:
                CGEventPost(kCGHIDEventTap, event)

    def key_up(self, key):
        code = self._resolve_keycode(key)
        if code is not None and code in self.active_keys:
            self.active_keys.remove(code)
            event = CGEventCreateKeyboardEvent(None, code, False)
            if event:
                CGEventPost(kCGHIDEventTap, event)

    def key_tap(self, key):
        code = self._resolve_keycode(key)
        if code is not None:
            e_down = CGEventCreateKeyboardEvent(None, code, True)
            e_up = CGEventCreateKeyboardEvent(None, code, False)
            if e_down and e_up:
                CGEventPost(kCGHIDEventTap, e_down)
                CGEventPost(kCGHIDEventTap, e_up)

    def hotkey(self, modifiers, key):
        code = self._resolve_keycode(key)
        if code is not None:
            flag_mask = 0
            for mod in modifiers:
                mod_lower = str(mod).lower()
                if mod_lower in MODIFIER_MAP:
                    flag_mask |= MODIFIER_MAP[mod_lower]

            e_down = CGEventCreateKeyboardEvent(None, code, True)
            e_up = CGEventCreateKeyboardEvent(None, code, False)
            if flag_mask:
                CGEventSetFlags(e_down, flag_mask)
                CGEventSetFlags(e_up, flag_mask)
            if e_down and e_up:
                CGEventPost(kCGHIDEventTap, e_down)
                CGEventPost(kCGHIDEventTap, e_up)

    def release_all_keys(self):
        for code in list(self.active_keys):
            event = CGEventCreateKeyboardEvent(None, code, False)
            if event:
                CGEventPost(kCGHIDEventTap, event)
        self.active_keys.clear()

dispatcher = MacOSInputDispatcher()

async def handler(websocket):
    print(f"[macOS Input Engine] Client connected: {websocket.remote_address}")
    
    # Send display resolution upon handshake
    await websocket.send(json.dumps({
        "type": "handshake_ok",
        "screen": dispatcher.bounds,
        "platform": "darwin",
        "capabilities": ["mouse", "keyboard", "scroll", "hotkeys"]
    }))

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")

                # Pointer & Semantic OS Input Events
                if msg_type in ("move", "pointer_move"):
                    dispatcher.move(data["x"], data["y"])
                elif msg_type in ("mouse_down", "pointer_down"):
                    dispatcher.mouse_down(data["x"], data["y"], data.get("button", "left"))
                elif msg_type in ("mouse_up", "pointer_up"):
                    dispatcher.mouse_up(data["x"], data["y"], data.get("button", "left"))
                elif msg_type == "drag_start":
                    dispatcher.mouse_down(data["x"], data["y"], data.get("button", "left"))
                elif msg_type in ("drag", "drag_move"):
                    dispatcher.drag(data["x"], data["y"], data.get("button", "left"))
                elif msg_type == "drag_end":
                    dispatcher.mouse_up(data["x"], data["y"], data.get("button", "left"))
                elif msg_type == "scroll":
                    dispatcher.scroll(data.get("deltaY", 0), data.get("deltaX", 0))
                elif msg_type == "click":
                    dispatcher.click(data["x"], data["y"], data.get("button", "left"))

                # Keyboard Events
                elif msg_type == "key_down":
                    dispatcher.key_down(data.get("key"))
                elif msg_type == "key_up":
                    dispatcher.key_up(data.get("key"))
                elif msg_type == "key_tap":
                    dispatcher.key_tap(data.get("key"))
                elif msg_type == "hotkey":
                    dispatcher.hotkey(data.get("modifiers", []), data.get("key"))
            except Exception as e:
                print(f"[macOS Input Engine] Error handling command: {e}")
    except websockets.exceptions.ConnectionClosed:
        print("[macOS Input Engine] Client disconnected, releasing held keys.")
        dispatcher.release_all_keys()

async def main():
    port = 8765
    print(f"[macOS Input Engine] Listening on ws://127.0.0.1:{port} ...")
    async with websockets.serve(handler, "127.0.0.1", port):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        dispatcher.release_all_keys()
        print("\n[macOS Input Engine] Clean shutdown.")
