'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('game-container');

// --- Responsive canvas sizing ---
function resizeCanvas() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Music System (Web Audio API) ---
let audioCtx = null;
let musicPlaying = false;
let musicNodes = {};
const BPM = 95;
const BEAT = 60 / BPM;

// Must be called synchronously inside a user gesture (tap/click/key)
function startMusic() {
  if (musicPlaying) return;
  try {
    // Create AudioContext fresh inside user gesture (required by iOS Safari)
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Resume synchronously inside gesture
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Play a silent buffer to fully unlock iOS audio pipeline
    const silentBuf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const silentSrc = audioCtx.createBufferSource();
    silentSrc.buffer = silentBuf;
    silentSrc.connect(audioCtx.destination);
    silentSrc.start(0);

    // Start music synchronously - do NOT defer with .then()
    musicPlaying = true;
    const master = audioCtx.createGain();
    master.gain.setValueAtTime(0.6, audioCtx.currentTime);
    master.connect(audioCtx.destination);
    musicNodes.master = master;

    loopBeat(master);
    loopBass(master);
    loopMelody(master);
    loopHiHat(master);
  } catch (e) { /* audio not supported, game still works */ }
}

function stopMusic() {
  musicPlaying = false;
  if (musicNodes.master) {
    try {
      musicNodes.master.gain.setValueAtTime(musicNodes.master.gain.value, audioCtx.currentTime);
      musicNodes.master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    } catch (e) {}
  }
  clearTimeout(musicNodes.beatTimeout);
  clearTimeout(musicNodes.bassTimeout);
  clearTimeout(musicNodes.melodyTimeout);
  clearTimeout(musicNodes.hihatTimeout);
  musicNodes = {};
}

function playKick(dest, time) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.25);
  } catch (e) {}
}

function playSnare(dest, time) {
  try {
    const bufSize = audioCtx.sampleRate * 0.1;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.7, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 1500;
    noise.connect(filt);
    filt.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(time);
    noise.stop(time + 0.12);

    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);
    oscGain.gain.setValueAtTime(0.6, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.1);
  } catch (e) {}
}

function playHiHat(dest, time, open) {
  try {
    const dur = open ? 0.08 : 0.04;
    const bufSize = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(open ? 0.18 : 0.14, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 8000;
    filt.Q.value = 2;
    noise.connect(filt);
    filt.connect(gain);
    gain.connect(dest);
    noise.start(time);
    noise.stop(time + dur);
  } catch (e) {}
}

// Drum loop: classic boom-bap pattern
function loopBeat(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    playKick(dest, t);
    playSnare(dest, t + BEAT);
    playKick(dest, t + BEAT * 2);
    playKick(dest, t + BEAT * 2.5);
    playSnare(dest, t + BEAT * 3);
    playKick(dest, t + BEAT * 4);
    playSnare(dest, t + BEAT * 5);
    playKick(dest, t + BEAT * 6);
    playKick(dest, t + BEAT * 6.75);
    playSnare(dest, t + BEAT * 7);
  } catch (e) {}
  musicNodes.beatTimeout = setTimeout(() => loopBeat(dest), BEAT * 8 * 1000 - 100);
}

// Bass line
function loopBass(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    const notes = [82.41, 98, 82.41, 73.42, 82.41, 110, 98, 82.41];
    for (let i = 0; i < notes.length; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = notes[i];
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 200;
      filt.Q.value = 5;
      gain.gain.setValueAtTime(0.4, t + i * BEAT);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * BEAT + BEAT * 0.8);
      osc.connect(filt);
      filt.connect(gain);
      gain.connect(dest);
      osc.start(t + i * BEAT);
      osc.stop(t + i * BEAT + BEAT * 0.85);
    }
  } catch (e) {}
  musicNodes.bassTimeout = setTimeout(() => loopBass(dest), BEAT * 8 * 1000 - 100);
}

// Melody: dark minor key synth
function loopMelody(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    const melodyNotes = [329.63, 392, 440, 392, 329.63, 293.66, 329.63, 0];
    const durations =   [1,      0.5, 0.5, 1,   0.5,    0.5,    1.5,    1.5];
    let offset = 0;
    for (let i = 0; i < melodyNotes.length; i++) {
      if (melodyNotes[i] > 0) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = melodyNotes[i];
        const osc2 = audioCtx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.value = melodyNotes[i] * 1.003;
        const filt = audioCtx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 1200;
        gain.gain.setValueAtTime(0.001, t + offset * BEAT);
        gain.gain.linearRampToValueAtTime(0.1, t + offset * BEAT + 0.03);
        gain.gain.setValueAtTime(0.1, t + (offset + durations[i] * 0.7) * BEAT);
        gain.gain.linearRampToValueAtTime(0.001, t + (offset + durations[i]) * BEAT);
        osc.connect(filt);
        osc2.connect(filt);
        filt.connect(gain);
        gain.connect(dest);
        osc.start(t + offset * BEAT);
        osc.stop(t + (offset + durations[i]) * BEAT + 0.01);
        osc2.start(t + offset * BEAT);
        osc2.stop(t + (offset + durations[i]) * BEAT + 0.01);
      }
      offset += durations[i];
    }
  } catch (e) {}
  musicNodes.melodyTimeout = setTimeout(() => loopMelody(dest), BEAT * 8 * 1000 - 100);
}

// Hi-hat pattern
function loopHiHat(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    for (let i = 0; i < 16; i++) {
      const open = (i === 3 || i === 7 || i === 11 || i === 15);
      playHiHat(dest, t + i * BEAT * 0.5, open);
    }
  } catch (e) {}
  musicNodes.hihatTimeout = setTimeout(() => loopHiHat(dest), BEAT * 8 * 1000 - 100);
}

// --- Game state ---
const STATE = { START: 0, PLAYING: 1, DEAD: 2 };
let state = STATE.START;
let score = 0, cashCollected = 0, chainsCollected = 0, distance = 0;
let highScore = parseInt(localStorage.getItem('hoodRunnerHS') || '0');
let speed = 4, frameCount = 0, animFrame;
let particles = [], collectibles = [], obstacles = [], platforms = [], clouds = [];

// --- Player ---
const player = {
  x: 80, y: 0, w: 38, h: 56,
  vy: 0, vx: 0,
  grounded: false,
  jumpsLeft: 2,
  jumping: false,
  dead: false,
  invincible: 0,
  frame: 0, frameTimer: 0,
  color: '#1a1a2e',
  skinColor: '#8B5E3C',
  shirtColor: '#ff4444',
  pantsColor: '#1a1a2e',
  sneakerColor: '#fff',
  bling: 0,
  chainsWorn: 0,
};

const GRAVITY = 0.55;
const JUMP_FORCE = -13;
const GROUND_Y = () => canvas.height - 90;

// --- Input ---
let jumpPressed = false;
let jumpHeld = false;

function doJump() {
  if (state === STATE.START) { startGame(); return; }
  if (state === STATE.DEAD) return;
  if (player.jumpsLeft > 0) {
    player.vy = player.jumpsLeft === 2 ? JUMP_FORCE : JUMP_FORCE * 0.82;
    player.jumpsLeft--;
    player.grounded = false;
    spawnJumpParticles();
  }
}

document.addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.code === 'ArrowUp') && !jumpHeld) {
    jumpHeld = true;
    doJump();
  }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') jumpHeld = false;
});

canvas.addEventListener('touchstart', e => { e.preventDefault(); doJump(); }, { passive: false });
canvas.addEventListener('mousedown', e => { doJump(); });

document.getElementById('jump-btn').addEventListener('touchstart', e => {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('jump-btn').classList.add('pressed');
  doJump();
}, { passive: false });
document.getElementById('jump-btn').addEventListener('touchend', e => {
  e.preventDefault();
  document.getElementById('jump-btn').classList.remove('pressed');
}, { passive: false });

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);

// --- Screens ---
function showScreen(id) {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('game-over-screen').classList.add('hidden');
  if (id) document.getElementById(id).classList.remove('hidden');
}

// --- Game Init ---
function startGame() {
  state = STATE.PLAYING;
  showScreen(null);
  score = 0; cashCollected = 0; chainsCollected = 0; distance = 0;
  speed = 4; frameCount = 0;
  particles = []; collectibles = []; obstacles = []; clouds = [];
  player.x = 80;
  player.y = GROUND_Y() - player.h;
  player.vy = 0;
  player.grounded = false;
  player.jumpsLeft = 2;
  player.dead = false;
  player.invincible = 0;
  player.frame = 0;
  player.bling = 0;
  player.chainsWorn = 0;
  platforms = [];
  initClouds();
  spawnInitialPlatforms();
  updateScoreUI();
  startMusic();
  if (animFrame) cancelAnimationFrame(animFrame);
  gameLoop();
}

function initClouds() {
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * canvas.width,
      y: 30 + Math.random() * (canvas.height * 0.3),
      w: 60 + Math.random() * 80,
      h: 25 + Math.random() * 20,
      speed: 0.3 + Math.random() * 0.4,
      alpha: 0.2 + Math.random() * 0.25,
    });
  }
}

function spawnInitialPlatforms() {
  const gY = GROUND_Y();
  platforms.push({ x: 0, y: gY, w: canvas.width * 2, h: 90, type: 'ground' });
  for (let i = 0; i < 3; i++) {
    platforms.push({
      x: 300 + i * 220,
      y: gY - 120 - Math.random() * 80,
      w: 100 + Math.random() * 60,
      h: 18,
      type: 'platform',
    });
  }
}

// --- Spawning ---
let spawnTimer = 0, platformTimer = 0;

function spawnThings() {
  spawnTimer++;
  platformTimer++;

  const gY = GROUND_Y();
  const gap = Math.max(55, 90 - frameCount * 0.01);

  if (spawnTimer > gap) {
    spawnTimer = 0;
    const r = Math.random();
    if (r < 0.35) {
      spawnCash(canvas.width + 20, gY - 30 - Math.random() * 120);
    } else if (r < 0.55) {
      spawnChain(canvas.width + 20, gY - 40 - Math.random() * 100);
    } else if (r < 0.75) {
      spawnCop(canvas.width + 20);
    } else if (r < 0.82 && frameCount > 500) {
      // SWAT team - rare, appears after ~8 seconds
      spawnSwat(canvas.width + 20);
    } else if (r < 0.88 && frameCount > 400) {
      // Helicopter - rare aerial threat, appears after ~7 seconds
      spawnHelicopter(canvas.width + 20);
    } else if (r < 0.93 && frameCount > 600) {
      // K-9 unit - very rare, fast but short, appears after ~10 seconds
      spawnK9(canvas.width + 20);
    } else {
      // cash row
      for (let i = 0; i < 4; i++) spawnCash(canvas.width + 20 + i * 32, gY - 55);
    }
  }

  if (platformTimer > 180) {
    platformTimer = 0;
    if (Math.random() < 0.6) {
      platforms.push({
        x: canvas.width + 20,
        y: gY - 110 - Math.random() * 90,
        w: 90 + Math.random() * 70,
        h: 18,
        type: 'platform',
      });
    }
  }
}

function spawnCash(x, y) {
  collectibles.push({ type: 'cash', x, y, w: 22, h: 28, angle: 0, bob: Math.random() * Math.PI * 2 });
}

function spawnChain(x, y) {
  collectibles.push({ type: 'chain', x, y, w: 28, h: 28, angle: 0, bob: Math.random() * Math.PI * 2 });
}

function spawnCop(x) {
  const gY = GROUND_Y();
  const h = 58, w = 36;
  obstacles.push({
    type: 'cop',
    x, y: gY - h, w, h,
    speed: 0.5 + Math.random() * 0.4,
    frame: 0, frameTimer: 0,
  });
}

function spawnSwat(x) {
  const gY = GROUND_Y();
  // SWAT team: 3 officers side by side = wider obstacle, taller
  const h = 62, w = 90;
  obstacles.push({
    type: 'swat',
    x, y: gY - h, w, h,
    speed: 0.3 + Math.random() * 0.3,
    frame: 0, frameTimer: 0,
    officerCount: 3,
  });
}

function spawnK9(x) {
  const gY = GROUND_Y();
  const h = 28, w = 44;
  // Play both barks as early warning BEFORE the dog appears
  playBark();
  setTimeout(() => { try { playBark(); } catch (e) {} }, 350);
  // Delay the actual spawn so barks come first
  setTimeout(() => {
    if (state !== STATE.PLAYING) return;
    obstacles.push({
      type: 'k9',
      x: x + 80, y: gY - h, w, h,
      speed: 1.2 + Math.random() * 0.6,
      frame: 0, frameTimer: 0,
    });
  }, 700);
}

function playBark() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const dur = 0.18;

    // Generate bark as a shaped noise buffer (sounds most like a real dog)
    const sampleRate = audioCtx.sampleRate;
    const bufLen = Math.floor(sampleRate * dur);
    const buf = audioCtx.createBuffer(1, bufLen, sampleRate);
    const data = buf.getChannelData(0);

    // Build the bark waveform sample by sample
    for (let i = 0; i < bufLen; i++) {
      const time = i / sampleRate;
      const env = time < 0.01 ? time / 0.01                // sharp attack
                : time < 0.06 ? 1.0                         // sustain
                : Math.exp(-(time - 0.06) * 12);            // fast decay

      // Fundamental growl (drops pitch like a real bark)
      const freq = 420 - time * 1200;
      const fundamental = Math.sin(2 * Math.PI * freq * time) * 0.5;

      // Second harmonic for roughness
      const harmonic = Math.sin(2 * Math.PI * freq * 1.8 * time) * 0.25;

      // Noise for breathy texture
      const noise = (Math.random() * 2 - 1) * 0.35;

      // Combine
      data[i] = (fundamental + harmonic + noise) * env;
    }

    const src = audioCtx.createBufferSource();
    src.buffer = buf;

    // Formant filter to shape it like a dog's mouth
    const formant1 = audioCtx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.frequency.value = 600;
    formant1.Q.value = 2;

    const formant2 = audioCtx.createBiquadFilter();
    formant2.type = 'peaking';
    formant2.frequency.value = 1200;
    formant2.gain.value = 6;
    formant2.Q.value = 1;

    const gain = audioCtx.createGain();
    gain.gain.value = 0.7;

    src.connect(formant1);
    formant1.connect(formant2);
    formant2.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(t);
    src.stop(t + dur);
  } catch (e) {}
}

function playHeliWarning() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    // Rotor chop sound - rapid pulsing low tone
    for (let i = 0; i < 8; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 80;
      gain.gain.setValueAtTime(0.3, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.07 + 0.04);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.05);
    }
    // Rising siren wail
    const siren = audioCtx.createOscillator();
    const sirenGain = audioCtx.createGain();
    siren.type = 'sine';
    siren.frequency.setValueAtTime(400, t + 0.1);
    siren.frequency.linearRampToValueAtTime(800, t + 0.5);
    siren.frequency.linearRampToValueAtTime(400, t + 0.8);
    sirenGain.gain.setValueAtTime(0.15, t + 0.1);
    sirenGain.gain.setValueAtTime(0.15, t + 0.6);
    sirenGain.gain.exponentialRampToValueAtTime(0.01, t + 0.85);
    siren.connect(sirenGain);
    sirenGain.connect(audioCtx.destination);
    siren.start(t + 0.1);
    siren.stop(t + 0.85);
  } catch (e) {}
}

function spawnHelicopter(x) {
  const gY = GROUND_Y();
  const h = 30, w = 70;
  // Play warning sound before helicopter appears
  playHeliWarning();
  // Delay spawn so player hears it coming
  setTimeout(() => {
    if (state !== STATE.PLAYING) return;
    obstacles.push({
      type: 'helicopter',
      x, y: gY - 140 - Math.random() * 40, w, h,
      speed: 1.5 + Math.random() * 0.8,
      frame: 0, frameTimer: 0,
      bladeAngle: 0,
    });
  }, 800);
}

// --- Particles ---
function spawnCollectParticles(x, y, type) {
  const color = type === 'cash' ? '#00e676' : '#ffd700';
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 5,
      vy: -2 - Math.random() * 4,
      alpha: 1, size: 4 + Math.random() * 5,
      color, life: 40,
    });
  }
}

function spawnJumpParticles() {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: player.x + player.w / 2 + (Math.random() - 0.5) * 20,
      y: player.y + player.h,
      vx: (Math.random() - 0.5) * 3,
      vy: 1 + Math.random() * 2,
      alpha: 0.8, size: 5 + Math.random() * 4,
      color: '#fff', life: 20,
    });
  }
}

function spawnHitParticles(x, y) {
  for (let i = 0; i < 16; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 7,
      vy: -3 - Math.random() * 5,
      alpha: 1, size: 5 + Math.random() * 7,
      color: Math.random() < 0.5 ? '#ff4444' : '#ff8c00',
      life: 50,
    });
  }
}

// --- Collision ---
function rectOverlap(a, b, shrink = 0) {
  return a.x + shrink < b.x + b.w - shrink &&
         a.x + a.w - shrink > b.x + shrink &&
         a.y + shrink < b.y + b.h - shrink &&
         a.y + a.h - shrink > b.y + shrink;
}

// --- Update ---
function update() {
  if (state !== STATE.PLAYING) return;
  frameCount++;
  distance = Math.floor(frameCount / 10);

  // speed ramp
  speed = 4 + frameCount * 0.003;
  if (speed > 11) speed = 11;

  // player physics
  player.vy += GRAVITY;
  player.y += player.vy;
  if (player.invincible > 0) player.invincible--;

  // platform collision
  player.grounded = false;
  for (const p of platforms) {
    if (
      player.x + player.w - 4 > p.x &&
      player.x + 4 < p.x + p.w &&
      player.vy >= 0 &&
      player.y + player.h <= p.y + 10 &&
      player.y + player.h + player.vy >= p.y
    ) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.grounded = true;
      player.jumpsLeft = 2;
    }
  }

  // clamp to ground
  const gY = GROUND_Y();
  if (player.y + player.h > gY) {
    player.y = gY - player.h;
    player.vy = 0;
    player.grounded = true;
    player.jumpsLeft = 2;
  }

  // player animation
  if (player.grounded) {
    player.frameTimer++;
    if (player.frameTimer > 6) { player.frame = (player.frame + 1) % 4; player.frameTimer = 0; }
  }

  // scroll world
  for (const p of platforms) p.x -= speed;
  for (const c of collectibles) c.x -= speed;
  for (const o of obstacles) o.x -= speed;
  for (const cl of clouds) cl.x -= cl.speed;

  // cloud wrap
  for (const cl of clouds) {
    if (cl.x + cl.w < 0) cl.x = canvas.width + 20;
  }

  // remove offscreen
  platforms = platforms.filter(p => p.x + p.w > -10 || p.type === 'ground');
  for (const p of platforms) {
    if (p.type === 'ground') { p.x = 0; p.w = canvas.width + 10; }
  }
  collectibles = collectibles.filter(c => c.x + c.w > -20);
  obstacles = obstacles.filter(o => o.x + o.w > -20);

  // collectible bob
  for (const c of collectibles) {
    c.bob += 0.07;
    c.angle += 0.04;
  }

  // obstacle animations
  for (const o of obstacles) {
    o.frameTimer++;
    const animSpeed = o.type === 'k9' ? 4 : 8;
    if (o.frameTimer > animSpeed) { o.frame = (o.frame + 1) % 4; o.frameTimer = 0; }
    if (o.type === 'helicopter') {
      o.bladeAngle = (o.bladeAngle || 0) + 0.5;
      o.x -= o.speed;
    }
    if (o.type === 'k9') {
      o.x -= o.speed; // K-9 runs extra fast
    }
  }

  // collect items
  for (let i = collectibles.length - 1; i >= 0; i--) {
    const c = collectibles[i];
    const hitbox = { x: c.x + 4, y: c.y + 4, w: c.w - 8, h: c.h - 8 };
    const pb = { x: player.x + 4, y: player.y + 4, w: player.w - 8, h: player.h - 8 };
    if (rectOverlap(hitbox, pb)) {
      spawnCollectParticles(c.x + c.w / 2, c.y + c.h / 2, c.type);
      if (c.type === 'cash') { cashCollected += 100; score += 100; player.bling = Math.min(player.bling + 1, 5); }
      else { chainsCollected++; score += 500; player.bling = Math.min(player.bling + 2, 5); player.chainsWorn = Math.min(player.chainsWorn + 1, 5); }
      collectibles.splice(i, 1);
      updateScoreUI();
    }
  }

  // obstacle collision (cops + swat + helicopter)
  if (player.invincible === 0) {
    for (const o of obstacles) {
      const pb = { x: player.x + 8, y: player.y + 8, w: player.w - 16, h: player.h - 12 };
      let ob;
      if (o.type === 'helicopter') {
        ob = { x: o.x + 8, y: o.y + 6, w: o.w - 16, h: o.h - 8 };
      } else if (o.type === 'k9') {
        ob = { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 6 };
      } else {
        const shrinkX = o.type === 'swat' ? 4 : 6;
        ob = { x: o.x + shrinkX, y: o.y + 4, w: o.w - shrinkX * 2, h: o.h - 4 };
      }
      if (rectOverlap(pb, ob)) {
        killPlayer();
        return;
      }
    }
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.15;
    p.alpha -= 1 / p.life;
    if (p.alpha <= 0) particles.splice(i, 1);
  }

  // score distance points
  if (frameCount % 60 === 0) { score += 10; updateScoreUI(); }

  spawnThings();
}

function killPlayer() {
  spawnHitParticles(player.x + player.w / 2, player.y + player.h / 2);
  state = STATE.DEAD;
  stopMusic();
  const isNewHigh = score > highScore;
  if (isNewHigh) { highScore = score; localStorage.setItem('hoodRunnerHS', highScore); }
  setTimeout(() => showGameOver(isNewHigh), 600);
}

function showGameOver(newHigh) {
  document.getElementById('final-cash').textContent = '$' + cashCollected;
  document.getElementById('final-chains').textContent = chainsCollected;
  document.getElementById('final-distance').textContent = distance + 'm';
  document.getElementById('final-score').textContent = score;
  document.getElementById('high-score-msg').textContent = newHigh ? '🏆 NEW HIGH SCORE!' : 'Best: ' + highScore + ' pts';
  document.getElementById('high-score-display').textContent = 'Best: $' + highScore;
  showScreen('game-over-screen');
}

function updateScoreUI() {
  document.getElementById('cash-score').textContent = '💵 $' + cashCollected;
  document.getElementById('chain-score').textContent = '⛓️ x' + chainsCollected;
  document.getElementById('distance-score').textContent = '🏃 ' + distance + 'm';
  document.getElementById('high-score-display').textContent = 'Best: $' + highScore;
}

// --- Drawing ---

function drawBackground() {
  const h = canvas.height;
  const w = canvas.width;

  // night sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#0a0015');
  sky.addColorStop(0.5, '#0d0d2b');
  sky.addColorStop(1, '#1a1a0a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.72);

  // moon
  ctx.save();
  ctx.fillStyle = '#fffde7';
  ctx.shadowColor = '#fffde7';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(w * 0.82, h * 0.1, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0d0d2b';
  ctx.beginPath();
  ctx.arc(w * 0.82 + 8, h * 0.1 - 4, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // stars
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const starSeed = [0.12,0.25,0.38,0.5,0.63,0.75,0.88,0.18,0.44,0.68,0.9,0.07,0.33,0.55,0.77];
  const starY    = [0.04,0.08,0.03,0.12,0.06,0.09,0.05,0.15,0.07,0.11,0.04,0.13,0.09,0.06,0.14];
  for (let i = 0; i < starSeed.length; i++) {
    const blink = Math.sin(frameCount * 0.04 + i) * 0.4 + 0.6;
    ctx.globalAlpha = blink;
    ctx.fillRect(starSeed[i] * w, starY[i] * h, 2, 2);
  }
  ctx.globalAlpha = 1;

  // clouds
  for (const cl of clouds) {
    ctx.save();
    ctx.globalAlpha = cl.alpha;
    ctx.fillStyle = '#334';
    ctx.beginPath();
    ctx.ellipse(cl.x + cl.w / 2, cl.y, cl.w / 2, cl.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCityscape();

  // ground
  const gY = GROUND_Y();
  const grd = ctx.createLinearGradient(0, gY, 0, h);
  grd.addColorStop(0, '#2a2a2a');
  grd.addColorStop(0.1, '#1a1a1a');
  grd.addColorStop(1, '#0d0d0d');
  ctx.fillStyle = grd;
  ctx.fillRect(0, gY, w, h - gY);

  // sidewalk line
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.setLineDash([30, 15]);
  ctx.lineDashOffset = -(frameCount * speed * 0.5) % 45;
  ctx.beginPath();
  ctx.moveTo(0, gY + 30);
  ctx.lineTo(w, gY + 30);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCityscape() {
  const w = canvas.width, h = canvas.height;
  const gY = GROUND_Y();
  const buildingData = [
    { rx: 0.02, rw: 0.12, rh: 0.35, color: '#0d1117' },
    { rx: 0.13, rw: 0.08, rh: 0.45, color: '#111827' },
    { rx: 0.20, rw: 0.10, rh: 0.30, color: '#0d1117' },
    { rx: 0.30, rw: 0.09, rh: 0.50, color: '#0a0f1a' },
    { rx: 0.38, rw: 0.07, rh: 0.38, color: '#111827' },
    { rx: 0.45, rw: 0.11, rh: 0.55, color: '#0d1117' },
    { rx: 0.55, rw: 0.08, rh: 0.42, color: '#0a0f1a' },
    { rx: 0.63, rw: 0.10, rh: 0.35, color: '#111827' },
    { rx: 0.73, rw: 0.09, rh: 0.48, color: '#0d1117' },
    { rx: 0.82, rw: 0.12, rh: 0.40, color: '#0a0f1a' },
    { rx: 0.93, rw: 0.08, rh: 0.52, color: '#111827' },
  ];

  for (const b of buildingData) {
    const bx = b.rx * w;
    const bw = b.rw * w;
    const bh = b.rh * h;
    const by = gY - bh;
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, by, bw, bh);
    // windows
    const cols = Math.floor(bw / 18);
    const rows = Math.floor(bh / 22);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.sin(b.rx * 100 + r * 7 + c * 13) > 0.1) {
          const wx = bx + 5 + c * 18;
          const wy = by + 8 + r * 22;
          const lit = Math.sin(b.rx * 50 + r * 3 + c * 5 + frameCount * 0.005) > 0.3;
          ctx.fillStyle = lit ? 'rgba(255,220,100,0.6)' : 'rgba(30,40,60,0.8)';
          ctx.fillRect(wx, wy, 10, 12);
        }
      }
    }
  }
}

function drawPlatforms() {
  for (const p of platforms) {
    if (p.type === 'ground') continue;
    ctx.save();
    ctx.fillStyle = '#3a3a3a';
    ctx.shadowColor = '#666';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 4);
    ctx.fill();
    ctx.fillStyle = '#555';
    ctx.fillRect(p.x + 4, p.y + 2, p.w - 8, 3);
    ctx.restore();
  }
}

function drawCollectibles() {
  for (const c of collectibles) {
    const bobY = Math.sin(c.bob) * 5;
    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + bobY);

    if (c.type === 'cash') {
      ctx.rotate(Math.sin(c.angle) * 0.15);
      // bill
      ctx.shadowColor = '#00e676';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#1b5e20';
      ctx.beginPath();
      ctx.roundRect(-11, -7, 22, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.roundRect(-9, -5, 18, 10, 1);
      ctx.fill();
      ctx.fillStyle = '#a5d6a7';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 3);
    } else {
      // chain / gold chain
      ctx.rotate(c.angle * 0.3);
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 15;
      const grad = ctx.createRadialGradient(-4, -4, 1, 0, 0, 14);
      grad.addColorStop(0, '#fff176');
      grad.addColorStop(0.4, '#ffd700');
      grad.addColorStop(1, '#b8860b');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#fff176';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-4, -4, 11, 0, Math.PI * 2);
      ctx.stroke();
      // pendant
      ctx.fillStyle = '#ffd700';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4, 2);
      ctx.lineTo(0, 0);
      ctx.lineTo(-4, 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawCop(cop) {
  const x = cop.x, y = cop.y, w = cop.w, h = cop.h;
  const walkOffset = [0, -3, 0, 3][cop.frame];
  ctx.save();
  ctx.translate(x + w / 2, y + h + walkOffset);

  // shoes
  ctx.fillStyle = '#111';
  ctx.fillRect(-14, -6, 12, 7);
  ctx.fillRect(2, -6, 12, 7);

  // legs (dark blue pants)
  const legSwing = Math.sin(cop.frame * Math.PI / 2) * 4;
  ctx.fillStyle = '#1a237e';
  ctx.fillRect(-12, -28 + legSwing, 10, 22);
  ctx.fillRect(2, -28 - legSwing, 10, 22);

  // belt
  ctx.fillStyle = '#111';
  ctx.fillRect(-13, -30, 26, 4);

  // body (blue uniform)
  ctx.fillStyle = '#1565c0';
  ctx.beginPath();
  ctx.roundRect(-13, -54, 26, 26, 3);
  ctx.fill();

  // badge
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.moveTo(-4, -46);
  ctx.lineTo(0, -50);
  ctx.lineTo(4, -46);
  ctx.lineTo(3, -42);
  ctx.lineTo(-3, -42);
  ctx.closePath();
  ctx.fill();

  // arms
  const armSwing = Math.sin(cop.frame * Math.PI / 2) * 5;
  ctx.fillStyle = '#1565c0';
  ctx.fillRect(-20, -52 + armSwing, 8, 18);
  ctx.fillRect(12, -52 - armSwing, 8, 18);

  // hands
  ctx.fillStyle = '#f5cba7';
  ctx.beginPath(); ctx.arc(-16, -34 + armSwing, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(16, -34 - armSwing, 5, 0, Math.PI * 2); ctx.fill();

  // neck + head
  ctx.fillStyle = '#f5cba7';
  ctx.fillRect(-5, -60, 10, 8);
  ctx.beginPath();
  ctx.arc(0, -68, 14, 0, Math.PI * 2);
  ctx.fill();

  // hat (police cap)
  ctx.fillStyle = '#0d47a1';
  ctx.fillRect(-14, -80, 28, 10);
  ctx.fillRect(-16, -72, 32, 4);
  ctx.fillStyle = '#0a3880';
  ctx.fillRect(-11, -90, 22, 12);

  // hat badge
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(-3, -86, 6, 6);

  // eyes
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(-5, -70, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -70, 2.5, 0, Math.PI * 2); ctx.fill();

  // mustache
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(-4, -63, 4, 0, Math.PI);
  ctx.arc(4, -63, 4, 0, Math.PI);
  ctx.fill();

  ctx.restore();
}

function drawPlayer() {
  const p = player;
  // flash on invincibility
  if (p.invincible > 0 && Math.floor(p.invincible / 4) % 2 === 0) return;

  const walkOffset = p.grounded ? [0, -2, 0, 2][p.frame] : 0;
  const cx = p.x + p.w / 2;
  const by = p.y + p.h + walkOffset;

  ctx.save();
  ctx.translate(cx, by);

  // sneakers
  const legSwing = p.grounded ? Math.sin(p.frame * Math.PI / 2) * 5 : 0;
  ctx.fillStyle = p.sneakerColor;
  ctx.fillRect(-14, -8 + legSwing, 13, 8);
  ctx.fillRect(2, -8 - legSwing, 13, 8);
  ctx.fillStyle = '#e53935';
  ctx.fillRect(-14, -10 + legSwing, 13, 3);
  ctx.fillRect(2, -10 - legSwing, 13, 3);

  // pants (baggy)
  ctx.fillStyle = '#1a237e';
  ctx.fillRect(-13, -30 + legSwing, 11, 22);
  ctx.fillRect(2, -30 - legSwing, 11, 22);

  // waistband
  ctx.fillStyle = '#111';
  ctx.fillRect(-14, -33, 28, 4);

  // shirt (red)
  ctx.fillStyle = p.shirtColor;
  ctx.beginPath();
  ctx.roundRect(-13, -56, 26, 24, 3);
  ctx.fill();

  // hoodie detail
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(-13, -56, 26, 4);

  // chains on neck (only shown when collected - up to 5)
  if (p.chainsWorn > 0) {
    const chainColors = ['#ffd700', '#ffec80', '#daa520', '#fff176', '#e6be00'];
    for (let i = p.chainsWorn - 1; i >= 0; i--) {
      const radius = 6 + i * 2;
      const cy = -52 + i * 1;
      // Gold glow
      ctx.save();
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 4 + p.chainsWorn;
      // Thick chain line
      ctx.strokeStyle = chainColors[i];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, cy, radius, 0.15, Math.PI - 0.15);
      ctx.stroke();
      // Highlight shimmer
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, cy, radius - 0.5, 0.4, Math.PI - 0.7);
      ctx.stroke();
      ctx.restore();
    }
    // Pendant on longest chain (last collected = outermost)
    const lastIdx = p.chainsWorn - 1;
    const pendantR = 6 + lastIdx * 2;
    const pendantCy = -52 + lastIdx * 1;
    const px = 0;
    const py = pendantCy + pendantR;
    ctx.save();
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffd700';
    // Diamond shape pendant
    ctx.beginPath();
    ctx.moveTo(px, py - 2);
    ctx.lineTo(px + 4, py + 3);
    ctx.lineTo(px, py + 7);
    ctx.lineTo(px - 4, py + 3);
    ctx.closePath();
    ctx.fill();
    // Sparkle dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px - 1, py + 1, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // arms
  const armSwing = p.grounded ? Math.sin(p.frame * Math.PI / 2) * 6 : 0;
  ctx.fillStyle = p.shirtColor;
  ctx.fillRect(-20, -54 + armSwing, 8, 18);
  ctx.fillRect(12, -54 - armSwing, 8, 18);

  // hands
  ctx.fillStyle = p.skinColor;
  ctx.beginPath(); ctx.arc(-16, -36 + armSwing, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(16, -36 - armSwing, 5, 0, Math.PI * 2); ctx.fill();

  // neck
  ctx.fillStyle = p.skinColor;
  ctx.fillRect(-5, -62, 10, 8);

  // head
  ctx.beginPath();
  ctx.arc(0, -70, 14, 0, Math.PI * 2);
  ctx.fill();

  // fitted cap (backwards)
  ctx.fillStyle = '#b71c1c';
  ctx.beginPath();
  ctx.arc(0, -76, 15, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#8B0000';
  ctx.fillRect(-15, -78, 30, 5);
  ctx.fillStyle = '#b71c1c';
  ctx.fillRect(10, -76, 18, 4); // brim back

  // eyes
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(-5, -72, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -72, 2.5, 0, Math.PI * 2); ctx.fill();

  // smile
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -66, 5, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSwat(swat) {
  const x = swat.x, y = swat.y, w = swat.w, h = swat.h;
  const walkOffset = [0, -2, 0, 2][swat.frame];
  const count = swat.officerCount || 3;
  const spacing = w / count;

  for (let i = 0; i < count; i++) {
    const ox = x + i * spacing + spacing / 2;
    const oy = y + h + walkOffset;
    ctx.save();
    ctx.translate(ox, oy);

    // boots (black tactical)
    ctx.fillStyle = '#111';
    ctx.fillRect(-12, -8, 11, 9);
    ctx.fillRect(1, -8, 11, 9);

    // legs (black tactical pants)
    const legSwing = Math.sin((swat.frame + i) * Math.PI / 2) * 3;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-11, -28 + legSwing, 10, 20);
    ctx.fillRect(1, -28 - legSwing, 10, 20);

    // belt with gear
    ctx.fillStyle = '#222';
    ctx.fillRect(-12, -30, 24, 4);
    ctx.fillStyle = '#555';
    ctx.fillRect(-8, -31, 4, 4);
    ctx.fillRect(4, -31, 4, 4);

    // body (dark navy/black tactical vest)
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.roundRect(-12, -54, 24, 26, 3);
    ctx.fill();
    // Vest overlay
    ctx.fillStyle = '#252540';
    ctx.fillRect(-10, -52, 20, 10);

    // SWAT text on chest
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 6px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SWAT', 0, -39);

    // arms
    const armSwing = Math.sin((swat.frame + i) * Math.PI / 2) * 4;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-18, -52 + armSwing, 7, 16);
    ctx.fillRect(11, -52 - armSwing, 7, 16);

    // gloved hands
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-14, -36 + armSwing, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -36 - armSwing, 4, 0, Math.PI * 2); ctx.fill();

    // neck
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(-4, -58, 8, 6);

    // head
    ctx.beginPath();
    ctx.arc(0, -65, 12, 0, Math.PI * 2);
    ctx.fill();

    // helmet (dark tactical)
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(0, -68, 14, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-14, -70, 28, 6);
    // Visor
    ctx.fillStyle = 'rgba(100,150,255,0.35)';
    ctx.fillRect(-10, -66, 20, 5);

    // eyes behind visor
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-4, -65, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -65, 1.5, 0, Math.PI * 2); ctx.fill();

    // stern mouth
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, -59);
    ctx.lineTo(3, -59);
    ctx.stroke();

    ctx.restore();
  }

  // Red/blue flash on top (police light effect)
  ctx.save();
  const flash = Math.sin(frameCount * 0.3) > 0;
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = flash ? '#ff0000' : '#0044ff';
  ctx.beginPath();
  ctx.arc(x + w / 2, y - 5, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHelicopter(heli) {
  const x = heli.x, y = heli.y, w = heli.w, h = heli.h;
  const cx = x + w / 2, cy = y + h / 2;
  const bob = Math.sin(frameCount * 0.15) * 2;
  const flash = Math.sin(frameCount * 0.4) > 0;

  ctx.save();
  ctx.translate(cx, cy + bob);

  // Warning glow around helicopter so it's visible
  ctx.save();
  ctx.shadowColor = flash ? '#ff0000' : '#0066ff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.beginPath();
  ctx.ellipse(5, 0, 26, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Searchlight beam (brighter, drawn behind)
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#ffffaa';
  ctx.beginPath();
  ctx.moveTo(10, 10);
  ctx.lineTo(-15, 100);
  ctx.lineTo(35, 100);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Tail boom
  ctx.fillStyle = '#3a3a5a';
  ctx.fillRect(-35, -3, 25, 6);
  // Tail rotor
  ctx.fillStyle = '#888';
  const tailSpin = Math.sin(heli.bladeAngle * 2) * 8;
  ctx.fillRect(-36, -3 + tailSpin - 4, 3, 8);
  // Tail fin
  ctx.fillStyle = '#4a4a6a';
  ctx.beginPath();
  ctx.moveTo(-35, -6);
  ctx.lineTo(-38, -14);
  ctx.lineTo(-32, -6);
  ctx.closePath();
  ctx.fill();

  // Main body (lighter so it's visible)
  ctx.fillStyle = '#3a3a5a';
  ctx.beginPath();
  ctx.ellipse(5, 0, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body outline
  ctx.strokeStyle = '#6a6a8a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(5, 0, 22, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  // POLICE text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 6px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('POLICE', 2, 3);

  // Cockpit window (brighter)
  ctx.fillStyle = 'rgba(120,200,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(14, -2, 10, 8, 0.15, -0.8, 0.8);
  ctx.fill();
  ctx.strokeStyle = '#8ab8d0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(14, -2, 10, 8, 0.15, -0.8, 0.8);
  ctx.stroke();

  // Skids
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 12);
  ctx.lineTo(20, 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(-2, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(15, 12);
  ctx.lineTo(12, 8);
  ctx.stroke();

  // Rotor mast
  ctx.fillStyle = '#666';
  ctx.fillRect(2, -14, 4, 4);

  // Main rotor blades (spinning, brighter)
  ctx.save();
  ctx.translate(4, -14);
  ctx.rotate(heli.bladeAngle);
  ctx.fillStyle = 'rgba(200,200,200,0.8)';
  ctx.fillRect(-32, -2, 64, 4);
  ctx.restore();
  ctx.save();
  ctx.translate(4, -14);
  ctx.rotate(heli.bladeAngle + Math.PI / 2);
  ctx.fillStyle = 'rgba(200,200,200,0.6)';
  ctx.fillRect(-32, -2, 64, 4);
  ctx.restore();

  // Red/blue police lights (bigger, brighter)
  ctx.save();
  ctx.shadowColor = flash ? '#ff0000' : '#0066ff';
  ctx.shadowBlur = 15;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = flash ? '#ff3333' : '#3388ff';
  ctx.beginPath();
  ctx.arc(5, -12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawK9(k9) {
  const x = k9.x, y = k9.y, w = k9.w, h = k9.h;
  const runOffset = Math.sin(k9.frame * Math.PI / 2) * 3;

  ctx.save();
  ctx.translate(x + w / 2, y + h);

  // Legs (running fast)
  const legF = Math.sin(k9.frame * Math.PI / 2);
  const frontLeg = legF * 6;
  const backLeg = -legF * 6;
  ctx.fillStyle = '#4a3728';
  // back legs
  ctx.fillRect(-16, -6 + backLeg, 5, 10);
  ctx.fillRect(-10, -6 - backLeg, 5, 10);
  // front legs
  ctx.fillRect(8, -6 + frontLeg, 5, 10);
  ctx.fillRect(14, -6 - frontLeg, 5, 10);

  // Body
  ctx.fillStyle = '#5c3d2e';
  ctx.beginPath();
  ctx.ellipse(0, -12, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Dark saddle marking
  ctx.fillStyle = '#3a2518';
  ctx.beginPath();
  ctx.ellipse(-2, -14, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail (wagging)
  const tailWag = Math.sin(frameCount * 0.4) * 15;
  ctx.save();
  ctx.translate(-18, -16);
  ctx.rotate((-30 + tailWag) * Math.PI / 180);
  ctx.fillStyle = '#5c3d2e';
  ctx.fillRect(-2, -10, 4, 10);
  ctx.restore();

  // Head
  ctx.fillStyle = '#6b4430';
  ctx.beginPath();
  ctx.ellipse(18, -16, 8, 7, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Snout
  ctx.fillStyle = '#7a5240';
  ctx.beginPath();
  ctx.ellipse(25, -14, 6, 4, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(30, -14, 2, 0, Math.PI * 2);
  ctx.fill();
  // Eye
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(20, -18, 2, 0, Math.PI * 2);
  ctx.fill();
  // Eye shine
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(20.5, -18.5, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = '#3a2518';
  ctx.beginPath();
  ctx.ellipse(14, -22, 4, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (open when barking - every other frame)
  if (k9.frame % 2 === 0) {
    ctx.fillStyle = '#c44';
    ctx.beginPath();
    ctx.ellipse(27, -12, 4, 2, 0, 0, Math.PI);
    ctx.fill();
  }

  // K-9 vest
  ctx.fillStyle = '#1565c0';
  ctx.fillRect(-8, -18, 16, 8);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 5px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('K-9', 0, -12);

  // Leash line (trailing behind)
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(-18, -12);
  ctx.lineTo(-35, -8);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

function drawObstacles() {
  for (const o of obstacles) {
    if (o.type === 'swat') drawSwat(o);
    else if (o.type === 'helicopter') drawHelicopter(o);
    else if (o.type === 'k9') drawK9(o);
    else drawCop(o);
  }
}

function drawDeathScreen() {
  if (state !== STATE.DEAD) return;
  ctx.save();
  ctx.fillStyle = 'rgba(200,0,0,0.15)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawSpeedLines() {
  if (speed < 7) return;
  const alpha = (speed - 7) / 4 * 0.12;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const y = 50 + i * (canvas.height / 9);
    const len = 20 + Math.random() * 40;
    ctx.beginPath();
    ctx.moveTo(Math.random() * canvas.width, y);
    ctx.lineTo(Math.random() * canvas.width - len, y);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Main loop ---
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  update();
  drawBackground();
  drawPlatforms();
  drawCollectibles();
  drawObstacles();
  drawPlayer();
  drawParticles();
  drawSpeedLines();
  drawDeathScreen();
  animFrame = requestAnimationFrame(gameLoop);
}

// --- Start screen render loop ---
function titleLoop() {
  if (state !== STATE.START) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  animFrame = requestAnimationFrame(titleLoop);
}

// Init high score display and title loop
document.getElementById('high-score-display').textContent = 'Best: $' + highScore;
initClouds();
spawnInitialPlatforms();
titleLoop();
