/**
 * Base Abstract OS Adapter
 * Interface for OS-level event receivers (macOS, Windows, Linux, Browser)
 */

export class OSAdapter {
  constructor(name = 'Generic OS') {
    this.name = name;
    this.isEnabled = false;
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }

  movePointer(x, y) {}
  pointerDown(x, y, button = 'left') {}
  pointerUp(x, y, button = 'left') {}
  click(x, y, button = 'left') {}
  drag(x, y) {}
  scroll(deltaX, deltaY) {}
  zoom(scaleDelta) {}
}
