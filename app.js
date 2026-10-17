/* BEAST FOOTBALL — first playable prototype
   Mobile joystick, passing, shooting, skills and goals.
   This version is a 2D gameplay prototype, not the final 3D game.
*/

const pitch = document.querySelector(".pitch");
const player = document.getElementById("player");
const teammate = document.getElementById("teammate");
const opponent = document.getElementById("opponent");
const opponent2 = document.getElementById("opponent2");
const ball = document.getElementById("ball");

const stick = document.getElementById("stick");
const joystick = document.getElementById("joystick");

const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");
const btnC = document.getElementById("btnC");

const homeScore = document.getElementById("homeScore");
const awayScore = document.getElementById("awayScore");
const timerDisplay = document.getElementById("timer");
const message = document.getElementById("message");
const pauseBtn = document.getElementById("pauseBtn");

if (!pitch || !player || !ball || !joystick || !stick) {
  console.error("BEAST FOOTBALL: A required HTML element is missing.");
} else {
  startGame();
}

function startGame() {
  const state = {
    x: 35,
    y: 55,
    ballX: 40,
    ballY: 58,
    vx: 0,
    vy: 0,
    joystickX: 0,
    joystickY: 0,
    sprintUntil: 0,
    paused: false,
    finished: false,
    home: 0,
    away: 0,
    seconds: 180,
    lastTime: 0,
    lastTap: 0,
    messageUntil: 0
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function showMessage(text, duration = 1400) {
    if (!message) return;
    message.textContent = text;
    message.classList.add("show");
    state.messageUntil = performance.now() + duration;
  }

  function place(element, x, y) {
    if (!element) return;
    element.style.left = `${x}%`;
    element.style.top = `${y}%`;
  }

  function render() {
    place(player, state.x, state.y);
    place(ball, state.ballX, state.ballY);

    if (ball) ball.style.transform = "translate(-50%, -50%)";

    if (homeScore) homeScore.textContent = state.home;
    if (awayScore) awayScore.textContent = state.away;

    if (timerDisplay) {
      const mins = Math.floor(state.seconds / 60);
      const secs = Math.floor(state.seconds % 60);
      timerDisplay.textContent =
        `${mins}:${String(secs).padStart(2, "0")}`;
    }
  }

  function resetPositions() {
    state.x = 35;
    state.y = 55;
    state.ballX = 40;
    state.ballY = 58;
    state.vx = 0;
    state.vy = 0;
    place(teammate, 25, 30);
    place(opponent, 66, 35);
    place(opponent2, 72, 65);
    render();
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
  }

  function hasBall() {
    return distance(state.x, state.y, state.ballX, state.ballY) < 5.5;
  }

  function moveBallToward(tx, ty, speed = 40) {
    const dx = tx - state.ballX;
    const dy = ty - state.ballY;
    const length = Math.hypot(dx, dy) || 1;

    state.vx = (dx / length) * speed;
    state.vy = (dy / length) * speed;
  }

  function shoot() {
    if (state.paused || state.finished) return;

    if (!hasBall()) {
      showMessage("Move close to the ball first!");
      return;
    }

    // Goal is at the right-hand side in this prototype.
    const targetY = clamp(state.y, 35, 65);
    moveBallToward(98, targetY, 78);
    showMessage("SHOT! ⚽");
  }

  function pass() {
    if (state.paused || state.finished) return;

    if (!hasBall()) {
      showMessage("Get close to the ball to pass!");
      return;
    }

    // Short pass toward the teammate's general position.
    const targetX = clamp(state.x + 20, 5, 95);
    const targetY = clamp(state.y - 12, 5, 95);
    moveBallToward(targetX, targetY, 55);
    showMessage("PASS!");
  }

  function throughPass() {
    if (state.paused || state.finished) return;

    if (!hasBall()) {
      showMessage("Get close to the ball first!");
      return;
    }

    moveBallToward(96, clamp(state.y - 8, 8, 92), 68);
    showMessage("THROUGH BALL!");
  }

  function skillMove(dx, dy) {
    if (state.paused || state.finished) return;

    const length = Math.hypot(dx, dy) || 1;
    state.x = clamp(state.x + (dx / length) * 8, 3, 97);
    state.y = clamp(state.y + (dy / length) * 8, 5, 95);

    if (hasBall()) {
      state.ballX = clamp(state.x + 3, 2, 98);
      state.ballY = state.y;
    }

    showMessage("SKILL MOVE! ✨");
    render();
  }

  function resetAfterGoal() {
    state.vx = 0;
    state.vy = 0;
    state.x = 35;
    state.y = 55;
    state.ballX = 40;
    state.ballY = 58;
    render();
  }

  function update(dt) {
    if (state.paused || state.finished) return;

    const now = performance.now();
    const sprinting = now < state.sprintUntil;
    const speed = sprinting ? 38 : 23;

    state.x = clamp(
      state.x + state.joystickX * speed * dt,
      3, 97
    );
    state.y = clamp(
      state.y + state.joystickY * speed * dt,
      5, 95
    );

    // Keep the ball near the player while dribbling.
    if (hasBall() && Math.hypot(state.joystickX, state.joystickY) > 0.1) {
      state.ballX = clamp(state.x + 3, 2, 98);
      state.ballY = state.y + state.joystickY * 1.8;
      state.vx = 0;
      state.vy = 0;
    } else {
      state.ballX += state.vx * dt;
      state.ballY += state.vy * dt;

      state.vx *= Math.pow(0.10, dt);
      state.vy *= Math.pow(0.10, dt);

      state.ballY = clamp(state.ballY, 3, 97);
    }

    // Simple opponent movement toward the ball.
    [opponent, opponent2].forEach((enemy, index) => {
      if (!enemy) return;

      const ex = parseFloat(enemy.style.left) || (index ? 72 : 66);
      const ey = parseFloat(enemy.style.top) || (index ? 65 : 35);
      const dx = state.ballX - ex;
      const dy = state.ballY - ey;
      const len = Math.hypot(dx, dy) || 1;
      const enemySpeed = 5.5;

      place(
        enemy,
        clamp(ex + (dx / len) * enemySpeed * dt, 4, 96),
        clamp(ey + (dy / len) * enemySpeed * dt, 5, 95)
      );
    });

    // Right-side goal.
    if (state.ballX >= 96 && state.ballY >= 32 && state.ballY <= 68) {
      state.home++;
      showMessage("GOAL! BEAST SCORES! 🥅", 2000);
      resetAfterGoal();
    }

    // Left-side goal: opponent scores.
    if (state.ballX <= 4 && state.ballY >= 32 && state.ballY <= 68) {
      state.away++;
      showMessage("OPPONENT SCORES!", 2000);
      resetAfterGoal();
    }

    state.seconds -= dt;

    if (state.seconds <= 0) {
      state.seconds = 0;
      state.finished = true;
      showMessage(
        `FULL TIME! ${state.home} - ${state.away}`,
        100000
      );
      if (pauseBtn) pauseBtn.textContent = "Restart";
    }

    if (message && now > state.messageUntil && !state.finished) {
      message.classList.remove("show");
    }

    render();
  }

  function frame(time) {
    if (!state.lastTime) state.lastTime = time;
    const dt = Math.min((time - state.lastTime) / 1000, 0.05);
    state.lastTime = time;

    update(dt);
    requestAnimationFrame(frame);
  }

  // Joystick: supports touch and mouse.
  let joystickPointer = null;

  function moveJoystick(event) {
    if (joystickPointer !== event.pointerId) return;

    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.32;

    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const length = Math.hypot(dx, dy);

    if (length > maxRadius) {
      dx = (dx / length) * maxRadius;
      dy = (dy / length) * maxRadius;
    }

    state.joystickX = dx / maxRadius;
    state.joystickY = dy / maxRadius;

    stick.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  joystick.addEventListener("pointerdown", event => {
    event.preventDefault();
    joystickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    moveJoystick(event);
  });

  joystick.addEventListener("pointermove", moveJoystick);

  function releaseJoystick(event) {
    if (joystickPointer !== event.pointerId) return;

    joystickPointer = null;
    state.joystickX = 0;
    state.joystickY = 0;
    stick.style.transform = "translate(0, 0)";
  }

  joystick.addEventListener("pointerup", releaseJoystick);
  joystick.addEventListener("pointercancel", releaseJoystick);

  // A = shoot, B = pass, C = through pass.
  if (btnA) btnA.addEventListener("click", shoot);
  if (btnB) btnB.addEventListener("click", pass);
  if (btnC) btnC.addEventListener("click", throughPass);

  // Double-tap the pitch to sprint.
  pitch.addEventListener("pointerdown", event => {
    if (event.target.closest("button") ||
        event.target.closest("#joystick")) return;

    const now = performance.now();

    if (now - state.lastTap < 320) {
      state.sprintUntil = now + 1800;
      showMessage("SPRINT! ⚡");
    }

    state.lastTap = now;
  });

  // Swipe across the pitch for a skill move.
  let swipeStart = null;

  pitch.addEventListener("pointerdown", event => {
    if (event.target.closest("button") ||
        event.target.closest("#joystick")) return;

    swipeStart = {
      x: event.clientX,
      y: event.clientY
    };
  });

  pitch.addEventListener("pointerup", event => {
    if (!swipeStart) return;

    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;

    if (Math.hypot(dx, dy) > 55) {
      skillMove(dx, dy);
    }
  });

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (state.finished) {
        state.home = 0;
        state.away = 0;
        state.seconds = 180;
        state.finished = false;
        state.paused = false;
        pauseBtn.textContent = "Pause";
        resetPositions();
        showMessage("NEW MATCH!");
        return;
      }

      state.paused = !state.paused;
      pauseBtn.textContent = state.paused ? "Resume" : "Pause";
      showMessage(state.paused ? "MATCH PAUSED" : "MATCH RESUMED");
    });
  }

  resetPositions();
  render();
  showMessage("Use the joystick to move!");
  requestAnimationFrame(frame);
}
