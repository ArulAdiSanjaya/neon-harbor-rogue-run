// Keyboard and mouse state for the game.
//
// Keys are tracked by KeyboardEvent.code so WASD works on any layout.
// wasPressed() reports the edge — a key that went down since the last
// endFrame() — which is what menus, entering cars and pausing want,
// while held() serves movement. main.js reads the edges itself: E/F
// interact, P/Esc pause, M mute, T toggles the cab light, and C
// toggles the minimap zoom.
// The pointer is kept in canvas pixels; main.js turns it into a world
// position with the camera before the world reads it as the aim point.

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.pointer = { x: 0, y: 0, down: false };
    this.clicked = false;

    window.addEventListener('keydown', (event) => {
      if (!event.repeat) this.pressed.add(event.code);
      this.down.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => this.down.delete(event.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pointer.down = false;
    });

    const track = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.pointer.x = (event.clientX - rect.left) * scaleX;
      this.pointer.y = (event.clientY - rect.top) * scaleY;
    };
    canvas.addEventListener('pointermove', track);
    canvas.addEventListener('pointerdown', (event) => {
      track(event);
      this.pointer.down = true;
      this.clicked = true;
    });
    window.addEventListener('pointerup', () => { this.pointer.down = false; });
  }

  held(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  /** Edge for the cab light: T flips whether riders hail the car.
   * main.js reads it once a frame, so one press is one flip. */
  cabLightToggle() { return this.wasPressed('KeyT'); }

  /** Edge for the controls card: H opens and closes it. */
  helpToggle() { return this.wasPressed('KeyH'); }

  /** Movement axis from WASD and the arrow keys, not normalised. */
  axis() {
    let x = 0;
    let y = 0;
    if (this.held('KeyA') || this.held('ArrowLeft')) x -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) x += 1;
    if (this.held('KeyW') || this.held('ArrowUp')) y -= 1;
    if (this.held('KeyS') || this.held('ArrowDown')) y += 1;
    return { x, y };
  }

  /** Driving input: throttle -1..1, steer -1..1, handbrake flag. */
  drive() {
    const axis = this.axis();
    return {
      throttle: -axis.y,
      steer: axis.x,
      handbrake: this.held('Space'),
    };
  }

  endFrame() {
    this.pressed.clear();
    this.clicked = false;
  }
}
