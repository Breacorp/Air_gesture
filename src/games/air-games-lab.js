/**
 * AirGamesLab - Spatial Gaming Hub & Runtime Engine
 * 
 * Powered by AirGameAPI:
 * 1. 🏓 Air Pong: Dual Hand / Two-Player Spatial Tennis (Left Hand = Left Paddle, Right Hand = Right Paddle)
 * 2. 🍉 Air Fruit Ninja: Spatial Blade Slash with Parabolic Fruit Trajectories, Particle Splats, and Combos
 * 3. 🏀 Air Basketball: Kinetic Hand Throw with Physics Trajectory, Backboard Bounces, Swish Detection & Streaks
 */

import { AirGameAPI } from './air-game-api.js';
import { gameAudio } from './air-game-audio.js';

export class AirGamesLab {
  constructor(containerElement, airGameAPI) {
    this.container = containerElement;
    this.api = airGameAPI;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.className = 'air-games-canvas';
    this.container.appendChild(this.canvas);

    this.activeGame = 'pong'; // 'pong' | 'fruit_ninja' | 'basketball'
    this.isRunning = false;
    this.isPaused = false;

    // Dimensions
    this.width = 800;
    this.height = 500;
    this._resizeCanvas();

    // Hand Blade Trajectory visual trails for Fruit Ninja
    this.handTrails = {
      left: [],
      right: []
    };

    // Shared Particles system
    this.particles = [];

    // --- GAME 1: AIR PONG STATE ---
    this.pong = {
      ball: { x: 400, y: 250, vx: 5, vy: 3, radius: 10, speed: 6 },
      paddles: {
        left: { y: 250, height: 90, width: 14, vy: 0, score: 0 },
        right: { y: 250, height: 90, width: 14, vy: 0, score: 0 }
      },
      rallyStreak: 0,
      mode: 'pvp' // 'pvp' (dual hands) or 'ai' (left vs AI)
    };

    // --- GAME 2: AIR FRUIT NINJA STATE ---
    this.fruitNinja = {
      score: 0,
      combo: 0,
      lives: 3,
      gameOver: false,
      fruits: [], // [{ id, type, x, y, vx, vy, radius, color, emoji, sliced, halves: [] }]
      lastSpawnTime: 0,
      spawnIntervalMs: 1400
    };

    // --- GAME 3: AIR BASKETBALL STATE ---
    this.basketball = {
      score: 0,
      streak: 0,
      shotsTaken: 0,
      hoop: { x: 400, y: 140, width: 80, rimY: 140, backboardY: 100, backboardHeight: 80 },
      ball: {
        x: 400,
        y: 420,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 22,
        isHeld: false,
        heldByHand: null,
        inFlight: false,
        scoredInFlight: false
      }
    };

    this._setupAPIListeners();
    window.addEventListener('resize', () => this._resizeCanvas());
  }

  _resizeCanvas() {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width || 800;
    this.height = rect.height || 500;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  // --- API HOOKS & GESTURE DISPATCH ---

  _setupAPIListeners() {
    // 1. Hand Move: Control Pong Paddles & Basketball Aim
    this.api.on('hand.move', (e) => {
      if (!this.isRunning || this.isPaused) return;

      const normY = e.position.y; // [0..1]
      const screenY = normY * this.height;

      // Pong: Left Hand -> Left Paddle, Right Hand -> Right Paddle
      if (this.activeGame === 'pong') {
        const p = this.pong.paddles[e.hand];
        if (p) {
          const prevY = p.y;
          p.y = Math.max(p.height / 2, Math.min(this.height - p.height / 2, screenY));
          p.vy = p.y - prevY;
        }
      }

      // Record visual trail for Fruit Ninja
      const trail = this.handTrails[e.hand];
      trail.push({ x: e.position.x * this.width, y: screenY, time: performance.now() });
      if (trail.length > 14) trail.shift();

      // Basketball: If ball is held by this hand, move with hand
      if (this.activeGame === 'basketball' && this.basketball.ball.isHeld && this.basketball.ball.heldByHand === e.hand) {
        this.basketball.ball.x = e.position.x * this.width;
        this.basketball.ball.y = screenY;
        this.basketball.ball.vx = e.velocity.vx * this.width * 0.05;
        this.basketball.ball.vy = e.velocity.vy * this.height * 0.05;
      }
    });

    // 2. Hand Slash: Air Fruit Ninja Slicing
    this.api.on('hand.slash', (e) => {
      if (!this.isRunning || this.isPaused) return;
      if (this.activeGame === 'fruit_ninja' && !this.fruitNinja.gameOver) {
        this._handleFruitSlash(e);
      }
    });

    // 3. Hand Grab & Pinch: Basketball Pickup
    this.api.on('hand.pinch', (e) => {
      if (!this.isRunning || this.isPaused) return;
      if (this.activeGame === 'basketball' && !this.basketball.ball.inFlight) {
        const handX = e.position.x * this.width;
        const handY = e.position.y * this.height;
        const dist = Math.hypot(handX - this.basketball.ball.x, handY - this.basketball.ball.y);
        if (dist < 70) {
          this.basketball.ball.isHeld = true;
          this.basketball.ball.heldByHand = e.hand;
          gameAudio.playBounce(0.5);
        }
      }
    });

    // 4. Hand Release: Basketball Throw
    this.api.on('hand.release', (e) => {
      if (!this.isRunning || this.isPaused) return;
      if (this.activeGame === 'basketball' && this.basketball.ball.isHeld && this.basketball.ball.heldByHand === e.hand) {
        this._throwBasketball(e);
      }
    });
  }

  // --- GAME LIFECYCLE ---

  setActiveGame(gameName) {
    this.activeGame = gameName;
    this.resetCurrentGame();
  }

  start() {
    this.isRunning = true;
    this.isPaused = false;
    this.canvas.style.display = 'block';
    this._resizeCanvas();
    this._loop();
  }

  stop() {
    this.isRunning = false;
    this.canvas.style.display = 'none';
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  resetCurrentGame() {
    if (this.activeGame === 'pong') {
      this.pong.ball.x = this.width / 2;
      this.pong.ball.y = this.height / 2;
      this.pong.ball.speed = 6;
      this.pong.ball.vx = 5 * (Math.random() > 0.5 ? 1 : -1);
      this.pong.ball.vy = (Math.random() - 0.5) * 6;
      this.pong.rallyStreak = 0;
    } else if (this.activeGame === 'fruit_ninja') {
      this.fruitNinja.score = 0;
      this.fruitNinja.lives = 3;
      this.fruitNinja.combo = 0;
      this.fruitNinja.gameOver = false;
      this.fruitNinja.fruits = [];
    } else if (this.activeGame === 'basketball') {
      this.basketball.score = 0;
      this.basketball.streak = 0;
      this.basketball.shotsTaken = 0;
      this._resetBasketball();
    }
  }

  // --- MAIN RENDER LOOP ---

  _loop() {
    if (!this.isRunning) return;

    if (!this.isPaused) {
      const now = performance.now();
      this.ctx.clearRect(0, 0, this.width, this.height);

      if (this.activeGame === 'pong') {
        this._updateAndRenderPong();
      } else if (this.activeGame === 'fruit_ninja') {
        this._updateAndRenderFruitNinja(now);
      } else if (this.activeGame === 'basketball') {
        this._updateAndRenderBasketball();
      }

      this._renderParticles();
      this._renderHandTrails();
    }

    requestAnimationFrame(() => this._loop());
  }

  // ==========================================
  // GAME 1: AIR PONG
  // ==========================================

  _updateAndRenderPong() {
    const ball = this.pong.ball;
    const lp = this.pong.paddles.left;
    const rp = this.pong.paddles.right;

    // AI logic if single player
    if (this.api.world.hands.count < 2) {
      const targetY = ball.y;
      rp.y += (targetY - rp.y) * 0.08;
    }

    // Move ball
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Bounce top & bottom
    if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= this.height) {
      ball.vy = -ball.vy;
      gameAudio.playPaddleHit(220);
      this._spawnParticles(ball.x, ball.y, '#00f5d4', 6);
    }

    // Left Paddle Bounce
    const lPaddleX = 36;
    if (ball.x - ball.radius <= lPaddleX + lp.width && ball.x + ball.radius >= lPaddleX) {
      if (ball.y >= lp.y - lp.height / 2 && ball.y <= lp.y + lp.height / 2) {
        ball.x = lPaddleX + lp.width + ball.radius;
        // Transfer vertical paddle velocity spin
        ball.vy += lp.vy * 0.25;
        ball.speed = Math.min(14, ball.speed * 1.05);
        ball.vx = Math.abs(ball.speed);
        this.pong.rallyStreak++;
        gameAudio.playPaddleHit(520);
        this._spawnParticles(ball.x, ball.y, '#ff007f', 12);
      }
    }

    // Right Paddle Bounce
    const rPaddleX = this.width - 36 - rp.width;
    if (ball.x + ball.radius >= rPaddleX && ball.x - ball.radius <= rPaddleX + rp.width) {
      if (ball.y >= rp.y - rp.height / 2 && ball.y <= rp.y + rp.height / 2) {
        ball.x = rPaddleX - ball.radius;
        ball.vy += rp.vy * 0.25;
        ball.speed = Math.min(14, ball.speed * 1.05);
        ball.vx = -Math.abs(ball.speed);
        this.pong.rallyStreak++;
        gameAudio.playPaddleHit(580);
        this._spawnParticles(ball.x, ball.y, '#00f5d4', 12);
      }
    }

    // Score checks
    if (ball.x < 0) {
      rp.score++;
      gameAudio.playScore();
      this._resetPongBall(1);
    } else if (ball.x > this.width) {
      lp.score++;
      gameAudio.playScore();
      this._resetPongBall(-1);
    }

    // --- DRAW PONG ---
    // Retro grid background
    this.ctx.strokeStyle = 'rgba(0, 245, 212, 0.12)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([8, 8]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.width / 2, 0);
    this.ctx.lineTo(this.width / 2, this.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Scores
    this.ctx.font = 'bold 44px "Space Grotesk", sans-serif';
    this.ctx.fillStyle = 'rgba(255, 0, 127, 0.75)';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(lp.score, this.width / 2 - 40, 60);

    this.ctx.fillStyle = 'rgba(0, 245, 212, 0.75)';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(rp.score, this.width / 2 + 40, 60);

    // Rally Streak
    if (this.pong.rallyStreak > 2) {
      this.ctx.font = '14px "JetBrains Mono", monospace';
      this.ctx.fillStyle = '#ffd166';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`🔥 RALLY x${this.pong.rallyStreak}`, this.width / 2, 90);
    }

    // Left Paddle (Neon Magenta)
    this.ctx.fillStyle = '#ff007f';
    this.ctx.shadowColor = '#ff007f';
    this.ctx.shadowBlur = 16;
    this.ctx.fillRect(lPaddleX, lp.y - lp.height / 2, lp.width, lp.height);

    // Right Paddle (Cyber Cyan)
    this.ctx.fillStyle = '#00f5d4';
    this.ctx.shadowColor = '#00f5d4';
    this.ctx.fillRect(rPaddleX, rp.y - rp.height / 2, rp.width, rp.height);

    // Ball
    this.ctx.fillStyle = '#ffffff';
    this.ctx.shadowColor = '#00f5d4';
    this.ctx.shadowBlur = 18;
    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
  }

  _resetPongBall(direction) {
    this.pong.ball.x = this.width / 2;
    this.pong.ball.y = this.height / 2;
    this.pong.ball.speed = 6;
    this.pong.ball.vx = direction * 5;
    this.pong.ball.vy = (Math.random() - 0.5) * 6;
    this.pong.rallyStreak = 0;
  }

  // ==========================================
  // GAME 2: AIR FRUIT NINJA
  // ==========================================

  _updateAndRenderFruitNinja(now) {
    const fn = this.fruitNinja;

    // Spawn new fruits
    if (!fn.gameOver && now - fn.lastSpawnTime > fn.spawnIntervalMs) {
      fn.lastSpawnTime = now;
      this._spawnFruitWave();
    }

    // Update and draw fruits
    for (let i = fn.fruits.length - 1; i >= 0; i--) {
      const f = fn.fruits[i];
      f.x += f.vx;
      f.y += f.vy;
      f.vy += 0.28; // Gravity

      if (f.sliced) {
        // Draw split halves
        for (const h of f.halves) {
          h.x += h.vx;
          h.y += h.vy;
          h.vy += 0.35;
          h.rot += h.vrot;

          this.ctx.save();
          this.ctx.translate(h.x, h.y);
          this.ctx.rotate(h.rot);
          this.ctx.font = `${f.radius}px sans-serif`;
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(f.emoji, 0, 0);
          this.ctx.restore();
        }

        if (f.y > this.height + 100) {
          fn.fruits.splice(i, 1);
        }
      } else {
        // Draw whole fruit
        this.ctx.save();
        this.ctx.font = `${f.radius * 2}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowColor = f.color;
        this.ctx.shadowBlur = 14;
        this.ctx.fillText(f.emoji, f.x, f.y);
        this.ctx.restore();

        // Dropped fruit penalty
        if (f.y > this.height + 40) {
          if (f.type !== 'bomb') {
            fn.lives--;
            if (fn.lives <= 0) fn.gameOver = true;
          }
          fn.fruits.splice(i, 1);
        }
      }
    }

    // --- DRAW HUD ---
    this.ctx.font = 'bold 28px "Space Grotesk", sans-serif';
    this.ctx.fillStyle = '#00f5d4';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`SCORE: ${fn.score}`, 30, 48);

    // Lives
    this.ctx.font = '22px sans-serif';
    this.ctx.textAlign = 'right';
    let hearts = '';
    for (let l = 0; l < 3; l++) hearts += l < fn.lives ? '❤️ ' : '🖤 ';
    this.ctx.fillText(hearts, this.width - 30, 46);

    // Game Over Banner
    if (fn.gameOver) {
      this.ctx.fillStyle = 'rgba(10, 15, 29, 0.85)';
      this.ctx.fillRect(0, 0, this.width, this.height);

      this.ctx.font = 'bold 48px "Space Grotesk", sans-serif';
      this.ctx.fillStyle = '#ff007f';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);

      this.ctx.font = '20px "JetBrains Mono", monospace';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(`Puntuación Final: ${fn.score}`, this.width / 2, this.height / 2 + 25);
      this.ctx.fillText('Haz un Slash rápido para reiniciar', this.width / 2, this.height / 2 + 65);
    }
  }

  _spawnFruitWave() {
    const types = [
      { type: 'watermelon', emoji: '🍉', color: '#10b981', radius: 30 },
      { type: 'orange', emoji: '🍊', color: '#ff6b35', radius: 24 },
      { type: 'apple', emoji: '🍎', color: '#ef4444', radius: 24 },
      { type: 'banana', emoji: '🍌', color: '#facc15', radius: 22 },
      { type: 'bomb', emoji: '💣', color: '#64748b', radius: 26 }
    ];

    const count = 1 + Math.floor(Math.random() * 2);
    for (let c = 0; c < count; c++) {
      const choice = Math.random() < 0.22 ? types[4] : types[Math.floor(Math.random() * 4)];
      const startX = this.width * 0.2 + Math.random() * (this.width * 0.6);

      this.fruitNinja.fruits.push({
        id: Math.random().toString(),
        type: choice.type,
        emoji: choice.emoji,
        color: choice.color,
        radius: choice.radius,
        x: startX,
        y: this.height + 20,
        vx: (Math.random() - 0.5) * 4.5,
        vy: -(11 + Math.random() * 4),
        sliced: false,
        halves: []
      });
    }
  }

  _handleFruitSlash(slashEvent) {
    const fn = this.fruitNinja;
    if (fn.gameOver) {
      this.resetCurrentGame();
      return;
    }

    const line = {
      x1: slashEvent.line.x1 * this.width,
      y1: slashEvent.line.y1 * this.height,
      x2: slashEvent.line.x2 * this.width,
      y2: slashEvent.line.y2 * this.height
    };

    gameAudio.playSlash(slashEvent.speed);

    let hitCount = 0;
    for (const f of fn.fruits) {
      if (f.sliced) continue;

      const hit = AirGameAPI.checkLineCircleIntersection(line, { x: f.x, y: f.y, radius: f.radius });
      if (hit) {
        f.sliced = true;
        hitCount++;

        if (f.type === 'bomb') {
          gameAudio.playExplosion();
          this._spawnParticles(f.x, f.y, '#f97316', 30);
          fn.lives--;
          if (fn.lives <= 0) fn.gameOver = true;
        } else {
          gameAudio.playFruitSlice();
          this._spawnParticles(f.x, f.y, f.color, 22);

          // Create two halves flying apart
          f.halves = [
            { x: f.x - 8, y: f.y, vx: -3 + Math.random() * -2, vy: -3, rot: 0, vrot: -0.15 },
            { x: f.x + 8, y: f.y, vx: 3 + Math.random() * 2, vy: -3, rot: 0, vrot: 0.15 }
          ];

          fn.score += 10;
        }
      }
    }

    // Combo bonus
    if (hitCount >= 2) {
      fn.score += hitCount * 15;
      fn.combo++;
      this._spawnComboText(line.x2, line.y2, `COMBO x${hitCount}!`);
    }
  }

  // ==========================================
  // GAME 3: AIR BASKETBALL
  // ==========================================

  _updateAndRenderBasketball() {
    const bb = this.basketball;
    const b = bb.ball;
    const hoop = bb.hoop;

    // In flight physics
    if (b.inFlight) {
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.42; // Gravity

      // Floor bounce
      if (b.y + b.radius >= this.height - 20) {
        b.y = this.height - 20 - b.radius;
        b.vy = -b.vy * 0.65;
        b.vx *= 0.85;
        gameAudio.playBounce(Math.abs(b.vy) / 6);
        this._spawnParticles(b.x, b.y + b.radius, '#ff6b35', 6);

        if (Math.abs(b.vy) < 0.8) {
          b.inFlight = false;
          setTimeout(() => this._resetBasketball(), 800);
        }
      }

      // Backboard bounce
      const bbX = hoop.x + hoop.width / 2 + 10;
      if (b.x + b.radius >= bbX && b.x - b.radius <= bbX + 12) {
        if (b.y >= hoop.backboardY && b.y <= hoop.backboardY + hoop.backboardHeight) {
          b.vx = -b.vx * 0.7;
          gameAudio.playBounce(1.2);
          this._spawnParticles(b.x, b.y, '#ffffff', 8);
        }
      }

      // Goal detection: passes downward through rim
      const rimLeft = hoop.x - hoop.width / 2;
      const rimRight = hoop.x + hoop.width / 2;
      if (!b.scoredInFlight && b.vy > 0 && b.y >= hoop.rimY && b.y - b.vy <= hoop.rimY + 15) {
        if (b.x >= rimLeft + 5 && b.x <= rimRight - 5) {
          b.scoredInFlight = true;
          bb.score++;
          bb.streak++;
          gameAudio.playSwish();
          gameAudio.playScore();
          this._spawnParticles(hoop.x, hoop.rimY + 20, '#00f5d4', 28);
          this._spawnComboText(hoop.x, hoop.rimY - 30, bb.streak > 1 ? `🔥 SWISH x${bb.streak}!` : 'BASKET!');
        }
      }

      // Out of bounds reset
      if (b.x < -40 || b.x > this.width + 40) {
        this._resetBasketball();
      }
    }

    // --- DRAW BASKETBALL SCENE ---
    // Court Floor
    this.ctx.fillStyle = '#0a101f';
    this.ctx.fillRect(0, this.height - 20, this.width, 20);
    this.ctx.strokeStyle = '#00f5d4';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.height - 20);
    this.ctx.lineTo(this.width, this.height - 20);
    this.ctx.stroke();

    // Backboard
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 3;
    const bbX = hoop.x + hoop.width / 2 + 10;
    this.ctx.fillRect(bbX, hoop.backboardY, 12, hoop.backboardHeight);
    this.ctx.strokeRect(bbX, hoop.backboardY, 12, hoop.backboardHeight);

    // Rim & Net
    this.ctx.strokeStyle = '#ff6b35';
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.ellipse(hoop.x, hoop.rimY, hoop.width / 2, 10, 0, 0, Math.PI * 2);
    this.ctx.stroke();

    // Net mesh
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(hoop.x - hoop.width / 2, hoop.rimY);
    this.ctx.lineTo(hoop.x - 15, hoop.rimY + 35);
    this.ctx.lineTo(hoop.x + 15, hoop.rimY + 35);
    this.ctx.lineTo(hoop.x + hoop.width / 2, hoop.rimY);
    this.ctx.stroke();

    // Basketball
    this.ctx.fillStyle = '#ff6b35';
    this.ctx.shadowColor = '#ff6b35';
    this.ctx.shadowBlur = b.isHeld ? 20 : 10;
    this.ctx.beginPath();
    this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    // Ball stripes
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI);
    this.ctx.stroke();

    // Score HUD
    this.ctx.font = 'bold 28px "Space Grotesk", sans-serif';
    this.ctx.fillStyle = '#ff6b35';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`GOALS: ${bb.score}`, 30, 48);

    if (bb.streak > 1) {
      this.ctx.font = 'bold 20px "JetBrains Mono", monospace';
      this.ctx.fillStyle = '#ffd166';
      this.ctx.fillText(`🔥 RACHA: ${bb.streak}`, 30, 80);
    }

    // Hint text
    if (!b.isHeld && !b.inFlight) {
      this.ctx.font = '16px "JetBrains Mono", monospace';
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Acerca la mano a la pelota y pellizca (🤏) para agarrar y lanzar', this.width / 2, this.height - 45);
    }
  }

  _throwBasketball(releaseEvent) {
    const b = this.basketball.ball;
    b.isHeld = false;
    b.heldByHand = null;
    b.inFlight = true;
    b.scoredInFlight = false;
    this.basketball.shotsTaken++;

    // Calculate throw impulse from hand release velocity
    const vx = (releaseEvent.velocity?.vx || 0) * this.width * 0.08;
    const vy = (releaseEvent.velocity?.vy || -0.5) * this.height * 0.08;

    b.vx = Math.max(-16, Math.min(16, vx));
    b.vy = Math.min(-6, Math.max(-20, vy)); // Force upward launch
  }

  _resetBasketball() {
    this.basketball.ball.x = this.width / 2;
    this.basketball.ball.y = this.height - 70;
    this.basketball.ball.vx = 0;
    this.basketball.ball.vy = 0;
    this.basketball.ball.isHeld = false;
    this.basketball.ball.heldByHand = null;
    this.basketball.ball.inFlight = false;
    this.basketball.ball.scoredInFlight = false;
  }

  // --- VISUAL FX: PARTICLES & TRAILS ---

  _spawnParticles(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        color,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.03
      });
    }
  }

  _spawnComboText(x, y, text) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -1.2,
      text,
      isText: true,
      alpha: 1.0,
      decay: 0.02
    });
  }

  _renderParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      if (p.isText) {
        this.ctx.font = 'bold 22px "Space Grotesk", sans-serif';
        this.ctx.fillStyle = '#ffd166';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(p.text, p.x, p.y);
      } else {
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }
  }

  _renderHandTrails() {
    const now = performance.now();
    for (const [side, trail] of Object.entries(this.handTrails)) {
      if (trail.length < 2) continue;

      const color = side === 'left' ? '#ff007f' : '#00f5d4';
      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      for (let i = 1; i < trail.length; i++) {
        const p1 = trail[i - 1];
        const p2 = trail[i];
        const age = now - p2.time;
        if (age > 200) continue;

        const progress = 1 - age / 200;
        this.ctx.lineWidth = Math.max(2, progress * 8);
        this.ctx.globalAlpha = progress * 0.8;

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
  }
}
