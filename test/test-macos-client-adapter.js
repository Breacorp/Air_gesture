import assert from 'node:assert/strict';
import { MacOSClientAdapter } from '../src/adapters/macos/macos-client-adapter.js';

const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
const sockets = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    sockets.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }
}

Object.defineProperty(globalThis, 'WebSocket', {
  configurable: true,
  value: MockWebSocket
});

try {
  const adapter = new MacOSClientAdapter();
  const statuses = [];
  adapter.onStatusChange = (status) => statuses.push(status);

  assert.equal(sockets.length, 0, 'Adapter construction does not connect to the optional daemon');

  adapter.connect();
  assert.equal(sockets.length, 1, 'Connection begins only when explicitly requested');
  assert.deepEqual(statuses.at(-1), { connected: false, connecting: true });

  const socket = sockets[0];
  socket.readyState = MockWebSocket.OPEN;
  socket.onopen();
  assert.equal(adapter.isConnected, true);
  assert.deepEqual(statuses.at(-1), { connected: true, connecting: false });

  socket.onerror(new Event('error'));
  assert.equal(adapter.isConnected, false);
  assert.equal(adapter.isEnabled, false);
  assert.equal(statuses.at(-1).error.type, 'error');

  socket.readyState = MockWebSocket.CLOSED;
  socket.onclose();
  assert.deepEqual(statuses.at(-1), {
    connected: false,
    connecting: false,
    error: statuses.at(-2).error
  });

  console.log('✅ macOS bridge remains optional until requested and reports connection failures');
} finally {
  if (originalWebSocket) {
    Object.defineProperty(globalThis, 'WebSocket', originalWebSocket);
  } else {
    delete globalThis.WebSocket;
  }
}
