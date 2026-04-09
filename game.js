// Hood Runner - Mobile 2D Platformer
'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('gameWrapper');

// ─── Canvas sizing ────────────────────────────────────────────────────────────
function resize() {
  const rect = wrapper.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
resize();
window.addEventListener('resize', resize);

// ─── Game constants ───────────────────────────────────────────────────────────
const GRAVITY = 0.55;
const JUMP_FORCE = -13;
const DOUBLE_JUMP_FORCE = -11;
const GROUND_Y = () => canvas.height - 100;
const SPEED_BASE = 3.5;
const PLATFORM_COUNT = 4;

// ─── State ────────────────────────────────────────────────────────────────────
let state = 'menu'; // menu | playing | dead
let score = 0;
let chains = 0;
let lives = 3;
let best = parseInt(localStorage.getItem('hoodBest') || '0');
let level = 1;
let distance = 0;
let gameSpeed = SPEED_BASE;
let frameCount = 0;
let invincibleTimer = 0;
let levelBannerTimer = 0;

// ─── Input ────────────────────────────────────────────────────────────────────
const keys = { left: false, right: false, jump: false };
let jumpPressed = false;

// ─── Player ───────────────────────────────────────────────────────────────────
const player = {
  x: 80, y: 0, w: 40, h: 56,
  vx: 0, vy: 0,
  onGround: false, onPlatform: false,
  jumpsLeft: 2,
  facing: 1,
  animFrame: 0, animTimer: 0,
  dead: false,
};

// ─── World objects ────────────────────────────────────────────────────────────
let platforms = [];
let collectibles = [];
let cops = [];
let particles = [];
let bgBuildings = [];
let bgClouds = [];
let stars = [];

// ─── Colors / palette ─────────────────────────────────────────────────────────
const PAL = {
  sky1: '#0d0d1a',
  sky2: '#1a0a2e',
  ground: '#1a1a2e',
  groundTop: '#2d2d4a',
  street: '#141420',
  neon1: '#ff00ff',
  neon2: '#00ffff',
  gold: '#FFD700',
  cash: '#00cc44',
};

// ─── Init ─────────────────────────────────────────────────────────────────────
function initWorld() {
  score = 0; chains = 0; lives = 3; distance = 0;
  gameSpeed = SPEED_BASE; frameCount = 0;
  invincibleTimer = 0; level = 1; levelBannerTimer = 0;
  platforms = [];
  collectibles = [];
  cops = [];
  particles = [];
  bgBuildings = [];
  bgClouds = [];
  stars = [];

  player.x = 80; player.y = GROUND_Y() - player.h;
  player.vx = 0; player.vy = 0;
  player.onGround = true; player.onPlatform = false;
  player.jumpsLeft = 2; player.facing = 1;
  player.animFrame = 0; player.dead = false;

  // Generate background
  for (let i = 0; i < 12; i++) spawnBuilding(i * 100 + Math.random() * 60);
  for (let i = 0; i < 6; i++) spawnCloud(i * 180 + Math.random() * 80);
  for (let i = 0; i < 80; i++) stars.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.5,
    r: Math.random() * 1.5 + 0.3,
    twinkle: Math.random() * Math.PI * 2,
  });

  // Initial platforms
  spawnPlatform(300, GROUND_Y() - 120, 110);
  spawnPlatform(500, GROUND_Y() - 200, 90);
  spawnPlatform(700, GROUND_Y() - 140, 100);

  // Initial cops & collectibles
  spawnCop(600);
  spawnCop(900);
  spawnCollectible(320, GROUND_Y() - 150, 'cash');
  spawnCollectible(520, GROUND_Y() - 230, 'chain');
  spawnCollectible(180, GROUND_Y() - 40, 'cash');
}

// ─── Spawn helpers ────────────────────────────────────────────────────────────
function spawnBuilding(x) {
  const h = 80 + Math.random() * 200;
  bgBuildings.push({
    x, y: canvas.height - 100 - h,
    w: 50 + Math.random() * 60, h,
    color: `hsl(${240 + Math.random() * 40},${20 + Math.random() * 20}%,${10 + Math.random() * 10}%)`,
    windows: Array.from({ length: Math.floor(h / 30) }, () =>
      Array.from({ length: 3 }, () => Math.random() > 0.4)),
    neon: Math.random() > 0.6 ? (Math.random() > 0.5 ? PAL.neon1 : PAL.neon2) : null,
  });
}

function spawnCloud(x) {
  bgClouds.push({
    x, y: 30 + Math.random() * 80,
    w: 80 + Math.random() * 60, speed: 0.3 + Math.random() * 0.4,
  });
}

function spawnPlatform(x, y, w) {
  platforms.push({ x, y, w, h: 16, scrolled: false });
}

function spawnCop(x) {
  const onGround = Math.random() > 0.3;
  const py = onGround ? GROUND_Y() - 52 : GROUND_Y() - 150 - Math.random() * 60;
  cops.push({
    x, y: py, w: 38, h: 52,
    speed: gameSpeed * 0.6 + Math.random() * 0.4,
    animFrame: 0, animTimer: 0,
    onGround,
    bobDir: 1, bob: 0,
  });
}

function spawnCollectible(x, y, type) {
  collectibles.push({ x, y, type, w: 26, h: 26, bob: Math.random() * Math.PI * 2, collected: false });
}

function spawnParticle(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * (2 + Math.random() * 3),
      vy: Math.sin(angle) * (2 + Math.random() * 3) - 2,
      life: 1, decay: 0.04 + Math.random() * 0.03,
      r: 4 + Math.random() * 4, color,
    });
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update() {
  if (state !== 'playing') return;
  frameCount++;
  distance += gameSpeed;

  // Speed ramp & level
  gameSpeed = SPEED_BASE + distance / 4000;
  const newLevel = Math.floor(distance / 2000) + 1;
  if (newLevel > level) {
    level = newLevel;
    showLevelBanner(`LEVEL ${level}`);
  }

  // Invincibility
  if (invincibleTimer > 0) invincibleTimer--;

  // ── Player input ──
  let moving = false;
  if (keys.left) { player.vx = -gameSpeed * 0.75; player.facing = -1; moving = true; }
  else if (keys.right) { player.vx = gameSpeed * 1.1; player.facing = 1; moving = true; }
  else { player.vx *= 0.8; }

  // Clamp player left
  if (player.x < 20) { player.x = 20; player.vx = 0; }
  // Allow running to mid-screen, then scroll
  const scrollThreshold = canvas.width * 0.45;
  let scroll = 0;
  if (player.x > scrollThreshold) {
    scroll = player.x - scrollThreshold;
    player.x = scrollThreshold;
  }

  // ── Gravity ──
  player.vy += GRAVITY;
  player.y += player.vy;
  player.x += player.vx;

  // ── Ground collision ──
  const gy = GROUND_Y();
  player.onGround = false;
  player.onPlatform = false;
  if (player.y + player.h >= gy) {
    player.y = gy - player.h;
    player.vy = 0;
    player.onGround = true;
    player.jumpsLeft = 2;
  }

  // ── Platform collision ──
  for (const p of platforms) {
    if (
      player.vy >= 0 &&
      player.x + player.w > p.x &&
      player.x < p.x + p.w &&
      player.y + player.h > p.y &&
      player.y + player.h < p.y + p.h + 12
    ) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onPlatform = true;
      player.onGround = true;
      player.jumpsLeft = 2;
    }
  }

  // Don't fall off screen top
  if (player.y < 0) { player.y = 0; player.vy = 0; }

  // ── Animation ──
  player.animTimer++;
  if (player.animTimer > (moving ? 6 : 10)) {
    player.animFrame = (player.animFrame + 1) % 4;
    player.animTimer = 0;
  }

  // ── Scroll world ──
  for (const p of platforms) { p.x -= scroll + gameSpeed * 0.8; }
  for (const c of collectibles) { c.x -= scroll + gameSpeed * 0.8; c.bob += 0.06; }
  for (const cop of cops) {
    cop.x -= scroll + cop.speed;
    cop.animTimer++;
    if (cop.animTimer > 8) { cop.animFrame = (cop.animFrame + 1) % 4; cop.animTimer = 0; }
    cop.bob += 0.1 * cop.bobDir;
    if (Math.abs(cop.bob) > 4) cop.bobDir *= -1;
  }
  for (const b of bgBuildings) { b.x -= scroll * 0.4 + gameSpeed * 0.15; }
  for (const c of bgClouds) { c.x -= c.speed + scroll * 0.1; }
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.15;
    p.life -= p.decay;
  }

  // ── Collectible collection ──
  for (const c of collectibles) {
    if (c.collected) continue;
    if (rectsOverlap(player, c)) {
      c.collected = true;
      if (c.type === 'cash') {
        score += 10 * level;
        spawnParticle(c.x + 13, c.y + 13, PAL.cash, 10);
      } else {
        chains++;
        score += 25 * level;
        spawnParticle(c.x + 13, c.y + 13, PAL.gold, 12);
      }
      updateUI();
    }
  }

  // ── Cop collision ──
  for (const cop of cops) {
    if (invincibleTimer > 0) break;
    if (rectsOverlap(player, cop, -8)) {
      hitByСop();
      break;
    }
  }

  // ── Cleanup off-screen ──
  platforms = platforms.filter(p => p.x + p.w > -50);
  collectibles = collectibles.filter(c => c.x + c.w > -80 && !c.collected);
  cops = cops.filter(c => c.x + c.w > -80);
  particles = particles.filter(p => p.life > 0);
  bgBuildings = bgBuildings.filter(b => b.x + b.w > -100);
  bgClouds = bgClouds.filter(c => c.x + c.w > -100);

  // ── Spawn new things ──
  const rightEdge = canvas.width + 100;
  if (frameCount % 90 === 0) {
    const chance = Math.random();
    if (chance < 0.6) {
      const py = GROUND_Y() - 100 - Math.random() * 100;
      const pw = 70 + Math.random() * 60;
      spawnPlatform(rightEdge, py, pw);
      if (Math.random() > 0.4) {
        spawnCollectible(rightEdge + pw / 2 - 13, py - 36, Math.random() > 0.4 ? 'cash' : 'chain');
      }
    }
  }
  if (frameCount % 120 === 0) {
    spawnCop(rightEdge + Math.random() * 60);
  }
  if (frameCount % 60 === 0 && Math.random() > 0.5) {
    spawnCollectible(rightEdge + Math.random() * 40, GROUND_Y() - 40, 'cash');
  }
  if (bgBuildings.length < 10) spawnBuilding(rightEdge + Math.random() * 40);
  if (bgClouds.length < 5) spawnCloud(rightEdge);

  // Best score
  if (score > best) { best = score; localStorage.setItem('hoodBest', best); }
}

// ─── Hit by cop ───────────────────────────────────────────────────────────────
function hitByСop() {
  lives--;
  invincibleTimer = 120;
  spawnParticle(player.x + player.w / 2, player.y + player.h / 2, '#ff4444', 16);
  updateUI();
  if (lives <= 0) {
    state = 'dead';
    showGameOver();
  }
}

// ─── AABB helper ─────────────────────────────────────────────────────────────
function rectsOverlap(a, b, shrink = 0) {
  return (
    a.x + shrink < b.x + b.w - shrink &&
    a.x + a.w - shrink > b.x + shrink &&
    a.y + shrink < b.y + b.h - shrink &&
    a.y + a.h - shrink > b.y + shrink
  );
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function draw() {
  const W = canvas.width, H = canvas.height;
  const gy = GROUND_Y();

  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#050510');
  grad.addColorStop(0.6, '#0d0d2b');
  grad.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars
  for (const s of stars) {
    s.twinkle += 0.03;
    const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle));
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clouds (neon purple haze)
  for (const c of bgClouds) {
    ctx.fillStyle = 'rgba(120,0,160,0.08)';
    drawCloud(c.x, c.y, c.w, 30);
  }

  // Background buildings
  for (const b of bgBuildings) {
    drawBuilding(b);
  }

  // Ground
  ctx.fillStyle = '#111122';
  ctx.fillRect(0, gy, W, H - gy);
  // Ground top line
  const gGrad = ctx.createLinearGradient(0, gy, 0, gy + 8);
  gGrad.addColorStop(0, '#4a3f8f');
  gGrad.addColorStop(1, '#2a1f5f');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, gy, W, 8);

  // Street dashes
  ctx.strokeStyle = 'rgba(255,215,0,0.15)';
  ctx.lineWidth = 3;
  ctx.setLineDash([30, 20]);
  ctx.beginPath();
  ctx.moveTo(0, gy + 30);
  ctx.lineTo(W, gy + 30);
  ctx.stroke();
  ctx.setLineDash([]);

  // Platforms
  for (const p of platforms) {
    drawPlatform(p);
  }

  // Collectibles
  for (const c of collectibles) {
    if (!c.collected) drawCollectible(c);
  }

  // Cops
  for (const cop of cops) {
    drawCop(cop);
  }

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Player
  drawPlayer();

  // Vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// ─── Drawing sub-functions ────────────────────────────────────────────────────
function drawBuilding(b) {
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y, b.w, b.h);

  // Windows
  const ww = 10, wh = 10, wgx = 14, wgy = 20;
  const cols = Math.floor((b.w - 10) / wgx);
  for (let row = 0; row < b.windows.length; row++) {
    for (let col = 0; col < Math.min(cols, 3); col++) {
      const lit = b.windows[row] && b.windows[row][col];
      const wx = b.x + 8 + col * wgx;
      const wy = b.y + 10 + row * wgy;
      ctx.fillStyle = lit ? `rgba(255,240,150,0.7)` : 'rgba(20,20,40,0.8)';
      ctx.fillRect(wx, wy, ww, wh);
    }
  }

  // Neon sign
  if (b.neon) {
    ctx.fillStyle = b.neon;
    ctx.shadowColor = b.neon;
    ctx.shadowBlur = 8;
    ctx.fillRect(b.x + b.w * 0.1, b.y + 10, b.w * 0.8, 5);
    ctx.shadowBlur = 0;
  }
}

function drawCloud(x, y, w, h) {
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w * 0.3, y + h * 0.6, w * 0.35, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w * 0.7, y + h * 0.6, w * 0.32, h * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlatform(p) {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(p.x + 4, p.y + 6, p.w, p.h);

  // Platform body
  const pg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
  pg.addColorStop(0, '#5a3fa0');
  pg.addColorStop(1, '#2d1f60');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, p.w, p.h, 6);
  ctx.fill();

  // Top glow
  ctx.fillStyle = 'rgba(150,100,255,0.5)';
  ctx.fillRect(p.x + 4, p.y, p.w - 8, 3);

  // Neon edge
  ctx.strokeStyle = 'rgba(180,120,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#aa66ff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, p.w, p.h, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawCollectible(c) {
  const bobY = Math.sin(c.bob) * 5;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2 + bobY;

  if (c.type === 'cash') {
    // Dollar bill glow
    ctx.shadowColor = '#00ff44';
    ctx.shadowBlur = 12;
    // Bill background
    ctx.fillStyle = '#006622';
    ctx.beginPath();
    ctx.roundRect(c.x, c.y + bobY, c.w, c.h, 4);
    ctx.fill();
    // Bill detail
    ctx.fillStyle = '#00cc44';
    ctx.font = `bold ${c.w * 0.7}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', cx, cy);
    ctx.shadowBlur = 0;
  } else {
    // Gold chain link
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, c.w * 0.42, c.h * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, c.w * 0.28, c.h * 0.42, Math.PI / 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${c.w * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⛓', cx, cy);
    ctx.shadowBlur = 0;
  }
}

function drawCop(cop) {
  const x = cop.x;
  const y = cop.y + cop.bob * 0.3;
  const frame = cop.animFrame;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + cop.w / 2, cop.y + cop.h + 4, cop.w * 0.4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body (police blue)
  ctx.fillStyle = '#1a3a6e';
  roundedRect(ctx, x + 8, y + 20, cop.w - 16, cop.h - 30, 6);
  ctx.fill();

  // Badge (gold star)
  ctx.fillStyle = '#FFD700';
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 4;
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('★', x + cop.w / 2, y + 34);
  ctx.shadowBlur = 0;

  // Head
  ctx.fillStyle = '#d4956a';
  ctx.beginPath();
  ctx.ellipse(x + cop.w / 2, y + 14, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Police hat
  ctx.fillStyle = '#0d2244';
  ctx.fillRect(x + 5, y + 3, cop.w - 10, 8);
  ctx.fillRect(x + 3, y + 8, cop.w - 6, 4);
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(x + cop.w / 2 - 4, y + 5, 8, 3);

  // Eyes (angry)
  ctx.fillStyle = '#ff2200';
  ctx.fillRect(x + 9, y + 12, 5, 4);
  ctx.fillRect(x + cop.w - 14, y + 12, 5, 4);

  // Walk animation legs
  const legSwing = Math.sin(frame * 1.6) * 8;
  ctx.strokeStyle = '#0d2244';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  // Left leg
  ctx.beginPath();
  ctx.moveTo(x + 14, y + cop.h - 14);
  ctx.lineTo(x + 14 - legSwing, y + cop.h);
  ctx.stroke();
  // Right leg
  ctx.beginPath();
  ctx.moveTo(x + cop.w - 14, y + cop.h - 14);
  ctx.lineTo(x + cop.w - 14 + legSwing, y + cop.h);
  ctx.stroke();

  // Arms
  const armSwing = Math.sin(frame * 1.6) * 10;
  ctx.strokeStyle = '#1a3a6e';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 25);
  ctx.lineTo(x + 2, y + 35 + armSwing * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + cop.w - 8, y + 25);
  ctx.lineTo(x + cop.w - 2, y + 35 - armSwing * 0.5);
  ctx.stroke();

  // Alert symbol above
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4444';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 8;
  ctx.fillText('!', x + cop.w / 2, y - 6);
  ctx.shadowBlur = 0;
}

function drawPlayer() {
  const p = player;
  const x = p.x;
  const y = p.y;
  const frame = p.animFrame;
  const dir = p.facing; // 1 = right, -1 = left

  // Invincibility flash
  if (invincibleTimer > 0 && Math.floor(invincibleTimer / 6) % 2 === 0) return;

  ctx.save();
  if (dir === -1) {
    ctx.translate(x + p.w, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + p.w / 2, y + p.h + 3, p.w * 0.38, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sneakers
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(x + 4, y + p.h - 10, 14, 10, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + p.w - 18, y + p.h - 10, 14, 10, 3);
  ctx.fill();
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4, y + p.h - 10, 14, 10);
  ctx.strokeRect(x + p.w - 18, y + p.h - 10, 14, 10);

  // Walk animation legs
  const legSwing = p.onGround ? Math.sin(frame * 1.6) * 7 : 0;
  // Pants (baggy jeans)
  ctx.fillStyle = '#1a1a4e';
  ctx.fillRect(x + 5, y + p.h - 26, 13, 18);
  ctx.fillRect(x + p.w - 18, y + p.h - 26, 13, 18);

  // Body (hoodie)
  ctx.fillStyle = '#8B0000'; // red hoodie
  roundedRect(ctx, x + 5, y + p.h - 44, p.w - 10, 22, 5);
  ctx.fill();

  // Gold chain
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.arc(x + p.w / 2, y + p.h - 36, 8, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + p.w / 2, y + p.h - 28, 5, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Head
  ctx.fillStyle = '#c07840';
  ctx.beginPath();
  ctx.ellipse(x + p.w / 2, y + p.h - 53, 13, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Face
  // Eyes
  ctx.fillStyle = '#111';
  ctx.fillRect(x + 13, y + p.h - 58, 4, 4);
  ctx.fillRect(x + 22, y + p.h - 58, 4, 4);
  // Mouth (grill smile)
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 7px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('◡', x + p.w / 2, y + p.h - 49);

  // Snapback cap
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(x + p.w / 2, y + p.h - 64, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 5, y + p.h - 70, p.w - 10, 10);
  // Cap brim
  ctx.fillStyle = '#111';
  ctx.fillRect(x + p.w - 6, y + p.h - 67, 12, 5);
  // Cap logo
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 8px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('G', x + p.w / 2 - 1, y + p.h - 62);

  // Arms with walk swing
  const armSwing = p.onGround ? Math.sin(frame * 1.6) * 8 : 5;
  ctx.strokeStyle = '#8B0000';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 7, y + p.h - 40);
  ctx.lineTo(x - 4, y + p.h - 28 + armSwing * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + p.w - 7, y + p.h - 40);
  ctx.lineTo(x + p.w + 4, y + p.h - 28 - armSwing * 0.6);
  ctx.stroke();

  // Cash fan in hand when collecting
  if (score > 0 && frameCount % 60 < 10) {
    ctx.fillStyle = '#00cc44';
    ctx.font = '12px Arial';
    ctx.fillText('$', x - 8, y + p.h - 22);
  }

  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── UI updates ───────────────────────────────────────────────────────────────
function updateUI() {
  document.getElementById('cashScore').textContent = score;
  document.getElementById('chainScore').textContent = chains;
  document.getElementById('livesDisplay').textContent = '❤️'.repeat(lives);
}

function showGameOver() {
  document.getElementById('finalScore').textContent = score;
  document.getElementById('finalBest').textContent = best;
  document.getElementById('gameOver').style.display = 'flex';
}

function showLevelBanner(text) {
  const el = document.getElementById('levelBanner');
  el.textContent = text;
  el.style.opacity = '1';
  levelBannerTimer = 120;
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function loop() {
  update();
  draw();

  if (levelBannerTimer > 0) {
    levelBannerTimer--;
    if (levelBannerTimer === 0) {
      document.getElementById('levelBanner').style.opacity = '0';
    }
  }

  requestAnimationFrame(loop);
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function doJump() {
  if (state !== 'playing') return;
  if (player.jumpsLeft > 0) {
    player.vy = player.jumpsLeft === 2 ? JUMP_FORCE : DOUBLE_JUMP_FORCE;
    player.jumpsLeft--;
    spawnParticle(player.x + player.w / 2, player.y + player.h, '#aa88ff', 5);
  }
}

// Keyboard
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && !jumpPressed) {
    jumpPressed = true;
    doJump();
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') jumpPressed = false;
});

// Touch buttons
function addTouchBtn(id, onDown, onUp) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', e => { e.preventDefault(); onDown(); }, { passive: false });
  el.addEventListener('touchend', e => { e.preventDefault(); onUp(); }, { passive: false });
  el.addEventListener('touchcancel', e => { e.preventDefault(); onUp(); }, { passive: false });
  el.addEventListener('mousedown', e => { e.preventDefault(); onDown(); });
  el.addEventListener('mouseup', e => { e.preventDefault(); onUp(); });
}

addTouchBtn('btnLeft',
  () => { keys.left = true; },
  () => { keys.left = false; }
);
addTouchBtn('btnRight',
  () => { keys.right = true; },
  () => { keys.right = false; }
);
addTouchBtn('btnJump',
  () => { jumpPressed = false; doJump(); },
  () => { jumpPressed = false; }
);

// Swipe to jump
let touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener('touchend', e => {
  const dy = touchStartY - e.changedTouches[0].clientY;
  if (dy > 30) doJump(); // swipe up = jump
}, { passive: true });

// ─── Menu buttons ─────────────────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('startBtn').addEventListener('touchend', e => { e.preventDefault(); startGame(); });
document.getElementById('retryBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('touchend', e => { e.preventDefault(); startGame(); });

function startGame() {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('bestDisplay').textContent = best;
  state = 'playing';
  initWorld();
  updateUI();
}

// ─── Start loop ───────────────────────────────────────────────────────────────
document.getElementById('bestDisplay').textContent = best;
loop();
