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
let musicPhase = 0; // evolves as distance increases
let musicLoopCount = 0; // counts 8-beat loops for variation
let inCarMusic = false; // true when car shield music is active
let engineNode = null; // engine sound oscillator/gain

const BPM = 95;
const BEAT = 60 / BPM;

// Multiple bass patterns that rotate
const bassPatterns = [
  [82.41, 98, 82.41, 73.42, 82.41, 110, 98, 82.41],       // original E minor
  [82.41, 82.41, 110, 98, 73.42, 82.41, 98, 73.42],        // darker variation
  [110, 98, 82.41, 110, 73.42, 98, 82.41, 73.42],          // ascending energy
  [65.41, 73.42, 82.41, 98, 110, 98, 82.41, 65.41],        // deep rumble climb
  [82.41, 0, 98, 82.41, 0, 73.42, 110, 98],                // syncopated gaps
];

// Multiple melody patterns
const melodyPatterns = [
  { notes: [329.63, 392, 440, 392, 329.63, 293.66, 329.63, 0], durs: [1, 0.5, 0.5, 1, 0.5, 0.5, 1.5, 1.5] },
  { notes: [440, 392, 329.63, 349.23, 392, 440, 493.88, 0], durs: [0.5, 0.5, 1, 1, 0.5, 0.5, 1.5, 1.5] },
  { notes: [293.66, 329.63, 392, 0, 440, 392, 349.23, 329.63], durs: [1, 0.5, 1, 0.5, 1, 0.5, 1, 1.5] },
  { notes: [493.88, 440, 392, 440, 493.88, 523.25, 440, 0], durs: [0.5, 0.5, 1, 1, 0.5, 0.5, 2, 1.5] },
  { notes: [0, 329.63, 392, 440, 0, 493.88, 440, 329.63], durs: [1, 0.5, 0.5, 1, 1, 0.5, 1, 1.5] },
];

// Different drum patterns
const drumPatterns = [
  // classic boom-bap
  function(dest, t) {
    playKick(dest, t); playSnare(dest, t + BEAT); playKick(dest, t + BEAT * 2);
    playKick(dest, t + BEAT * 2.5); playSnare(dest, t + BEAT * 3);
    playKick(dest, t + BEAT * 4); playSnare(dest, t + BEAT * 5);
    playKick(dest, t + BEAT * 6); playKick(dest, t + BEAT * 6.75); playSnare(dest, t + BEAT * 7);
  },
  // double-time energy
  function(dest, t) {
    playKick(dest, t); playKick(dest, t + BEAT * 0.5); playSnare(dest, t + BEAT);
    playKick(dest, t + BEAT * 2); playSnare(dest, t + BEAT * 3);
    playKick(dest, t + BEAT * 3.5); playKick(dest, t + BEAT * 4);
    playSnare(dest, t + BEAT * 5); playKick(dest, t + BEAT * 6);
    playSnare(dest, t + BEAT * 6.5); playKick(dest, t + BEAT * 7); playSnare(dest, t + BEAT * 7.5);
  },
  // half-time heavy
  function(dest, t) {
    playKick(dest, t); playSnare(dest, t + BEAT * 2);
    playKick(dest, t + BEAT * 4); playKick(dest, t + BEAT * 5);
    playSnare(dest, t + BEAT * 6); playKick(dest, t + BEAT * 7.5);
  },
  // trap-style kicks
  function(dest, t) {
    playKick(dest, t); playKick(dest, t + BEAT * 0.25);
    playSnare(dest, t + BEAT); playKick(dest, t + BEAT * 2);
    playKick(dest, t + BEAT * 2.75); playSnare(dest, t + BEAT * 3);
    playKick(dest, t + BEAT * 4); playKick(dest, t + BEAT * 4.25); playKick(dest, t + BEAT * 4.5);
    playSnare(dest, t + BEAT * 5); playKick(dest, t + BEAT * 6);
    playSnare(dest, t + BEAT * 7);
  },
];

// Hi-hat patterns
const hihatPatterns = [
  // standard 8ths with open on offbeats
  function(dest, t) {
    for (let i = 0; i < 16; i++) playHiHat(dest, t + i * BEAT * 0.5, i % 4 === 3);
  },
  // trap triplet rolls
  function(dest, t) {
    for (let i = 0; i < 8; i++) {
      playHiHat(dest, t + i * BEAT, false);
      if (i % 2 === 1) { // triplet roll on offbeats
        playHiHat(dest, t + i * BEAT + BEAT * 0.33, false);
        playHiHat(dest, t + i * BEAT + BEAT * 0.66, true);
      }
    }
  },
  // sparse groove
  function(dest, t) {
    playHiHat(dest, t, false); playHiHat(dest, t + BEAT * 1.5, true);
    playHiHat(dest, t + BEAT * 2, false); playHiHat(dest, t + BEAT * 3, false);
    playHiHat(dest, t + BEAT * 4, false); playHiHat(dest, t + BEAT * 5.5, true);
    playHiHat(dest, t + BEAT * 6, false); playHiHat(dest, t + BEAT * 7, false);
  },
  // rapid 16ths
  function(dest, t) {
    for (let i = 0; i < 32; i++) playHiHat(dest, t + i * BEAT * 0.25, i % 8 === 7);
  },
];

// Car music: heavier bass and different patterns
const carBassPattern = [55, 55, 73.42, 65.41, 55, 82.41, 73.42, 55]; // deep sub bass
const carMelody = { notes: [220, 261.63, 293.66, 0, 220, 246.94, 220, 0], durs: [1, 0.5, 0.5, 1, 1, 0.5, 1, 1.5] };

function getMusicPhase() {
  // Phase changes every ~100m for variety
  return Math.floor(distance / 100);
}

// Must be called synchronously inside a user gesture (tap/click/key)
function startMusic() {
  if (musicPlaying) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const silentBuf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const silentSrc = audioCtx.createBufferSource();
    silentSrc.buffer = silentBuf;
    silentSrc.connect(audioCtx.destination);
    silentSrc.start(0);

    musicPlaying = true;
    musicLoopCount = 0;
    musicPhase = 0;
    inCarMusic = false;
    const master = audioCtx.createGain();
    master.gain.setValueAtTime(0.6, audioCtx.currentTime);
    master.connect(audioCtx.destination);
    musicNodes.master = master;

    loopBeat(master);
    loopBass(master);
    loopMelody(master);
    loopHiHat(master);
  } catch (e) {}
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
  stopEngineSound();
}

// --- Engine sound for car ---
function startEngineSound() {
  if (engineNode || !audioCtx) return;
  try {
    // Low rumble oscillator
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 75;
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 37.5;
    // Noise for engine texture
    const bufSize = audioCtx.sampleRate * 2;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    // Filter for rumble
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 3;
    // Gain with LFO for engine pulsing
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.3);
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 6; // engine pulse rate
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc1.connect(lp);
    osc2.connect(lp);
    noiseSrc.connect(lp);
    lp.connect(gain);
    gain.connect(audioCtx.destination);
    osc1.start(); osc2.start(); noiseSrc.start(); lfo.start();
    engineNode = { osc1, osc2, noiseSrc, gain, lfo, lfoGain };
  } catch (e) {}
}

function stopEngineSound() {
  if (!engineNode) return;
  try {
    engineNode.gain.gain.setValueAtTime(engineNode.gain.gain.value, audioCtx.currentTime);
    engineNode.gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    setTimeout(() => {
      try {
        engineNode.osc1.stop(); engineNode.osc2.stop();
        engineNode.noiseSrc.stop(); engineNode.lfo.stop();
      } catch (e) {}
      engineNode = null;
    }, 400);
  } catch (e) { engineNode = null; }
}

// Rev engine pitch with speed
function updateEngineSound() {
  if (!engineNode || !audioCtx) return;
  try {
    const spd = Math.min(speed, 11);
    const freq = 60 + spd * 8; // 60-148 Hz
    engineNode.osc1.frequency.setValueAtTime(freq, audioCtx.currentTime);
    engineNode.osc2.frequency.setValueAtTime(freq * 0.5, audioCtx.currentTime);
    engineNode.lfo.frequency.setValueAtTime(4 + spd * 0.8, audioCtx.currentTime);
  } catch (e) {}
}

function playKick(dest, time) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    const inCar = player.hasShield;
    osc.frequency.setValueAtTime(inCar ? 180 : 150, time);
    osc.frequency.exponentialRampToValueAtTime(inCar ? 25 : 30, time + 0.12);
    gain.gain.setValueAtTime(inCar ? 1.2 : 1, time);
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
    filt.frequency.value = player.hasShield ? 2000 : 1500;
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

// Drum loop: picks pattern based on phase/car
function loopBeat(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    const phase = getMusicPhase();
    if (player.hasShield) {
      // Car mode: trap-style kicks always
      drumPatterns[3](dest, t);
    } else {
      const patIdx = (phase + musicLoopCount) % drumPatterns.length;
      drumPatterns[patIdx](dest, t);
    }
  } catch (e) {}
  musicNodes.beatTimeout = setTimeout(() => loopBeat(dest), BEAT * 8 * 1000 - 100);
}

// Bass line: evolves with distance, different in car
function loopBass(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    const phase = getMusicPhase();
    const notes = player.hasShield ? carBassPattern
      : bassPatterns[(phase + musicLoopCount) % bassPatterns.length];
    for (let i = 0; i < notes.length; i++) {
      if (notes[i] === 0) continue; // rest
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = player.hasShield ? 'sine' : 'sawtooth'; // deeper sub in car
      osc.frequency.value = notes[i];
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = player.hasShield ? 140 : 200;
      filt.Q.value = player.hasShield ? 8 : 5;
      gain.gain.setValueAtTime(player.hasShield ? 0.55 : 0.4, t + i * BEAT);
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

// Melody: evolves with phases, changes in car
function loopMelody(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    const phase = getMusicPhase();
    const mel = player.hasShield ? carMelody
      : melodyPatterns[(phase + musicLoopCount) % melodyPatterns.length];
    let offset = 0;
    for (let i = 0; i < mel.notes.length; i++) {
      if (mel.notes[i] > 0) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = player.hasShield ? 'sine' : 'square';
        osc.frequency.value = mel.notes[i];
        const osc2 = audioCtx.createOscillator();
        osc2.type = player.hasShield ? 'triangle' : 'sawtooth';
        osc2.frequency.value = mel.notes[i] * 1.003;
        const filt = audioCtx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = player.hasShield ? 800 : 1200;
        gain.gain.setValueAtTime(0.001, t + offset * BEAT);
        gain.gain.linearRampToValueAtTime(player.hasShield ? 0.07 : 0.1, t + offset * BEAT + 0.03);
        gain.gain.setValueAtTime(player.hasShield ? 0.07 : 0.1, t + (offset + mel.durs[i] * 0.7) * BEAT);
        gain.gain.linearRampToValueAtTime(0.001, t + (offset + mel.durs[i]) * BEAT);
        osc.connect(filt);
        osc2.connect(filt);
        filt.connect(gain);
        gain.connect(dest);
        osc.start(t + offset * BEAT);
        osc.stop(t + (offset + mel.durs[i]) * BEAT + 0.01);
        osc2.start(t + offset * BEAT);
        osc2.stop(t + (offset + mel.durs[i]) * BEAT + 0.01);
      }
      offset += mel.durs[i];
    }
  } catch (e) {}
  musicLoopCount++;
  musicNodes.melodyTimeout = setTimeout(() => loopMelody(dest), BEAT * 8 * 1000 - 100);
}

// Hi-hat: evolves and changes in car
function loopHiHat(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    const phase = getMusicPhase();
    if (player.hasShield) {
      // Car: rapid trap hi-hats
      hihatPatterns[3](dest, t);
    } else {
      const patIdx = (phase + musicLoopCount) % hihatPatterns.length;
      hihatPatterns[patIdx](dest, t);
    }
  } catch (e) {}
  musicNodes.hihatTimeout = setTimeout(() => loopHiHat(dest), BEAT * 8 * 1000 - 100);
}

// --- Game state ---
const STATE = { START: 0, PLAYING: 1, DEAD: 2, SHOP: 3 };
let state = STATE.START;
let score = 0, cashCollected = 0, chainsCollected = 0, distance = 0;
let highScore = parseInt(localStorage.getItem('hoodRunnerHS') || '0');
let speed = 4, frameCount = 0, animFrame;
let particles = [], collectibles = [], obstacles = [], platforms = [], clouds = [];

// --- Shop system ---
const SHOP_INTERVAL = 200; // meters between shop checkpoints
let nextShopDistance = SHOP_INTERVAL;
let chainsBought = 0;
let shopSelection = -1; // currently highlighted item
let bullets = []; // projectiles from guns

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
  weaponTier: 0, // 0=none, 1=bat, 2=pistol, 3=pistol+, 4=uzi
  batCooldown: 0, // frames until bat can hit again
  gunTimer: 0, // frames until next shot
  hasShield: false, // car shield (one hit protection)
  batSwing: 0, // frames of bat swing animation
  muzzleFlash: 0, // frames of muzzle flash
  carCrash: 0, // frames of car crash animation
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
  if (state === STATE.SHOP) return; // handled by shop click
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

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state === STATE.SHOP) { handleShopClick(e.touches[0].clientX, e.touches[0].clientY); return; }
  doJump();
}, { passive: false });
canvas.addEventListener('mousedown', e => {
  if (state === STATE.SHOP) { handleShopClick(e.clientX, e.clientY); return; }
  doJump();
});

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
  player.weaponTier = 0;
  player.batCooldown = 0;
  player.gunTimer = 0;
  player.hasShield = false;
  stopEngineSound();
  player.batSwing = 0;
  player.muzzleFlash = 0;
  player.carCrash = 0;
  nextShopDistance = SHOP_INTERVAL;
  chainsBought = 0;
  shopSelection = -1;
  bullets = [];
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
  if (state === STATE.SHOP) return; // freeze game during shop
  if (state !== STATE.PLAYING) return;
  frameCount++;
  distance = Math.floor(frameCount / 10);

  // Check for shop checkpoint
  if (distance >= nextShopDistance) {
    nextShopDistance += SHOP_INTERVAL;
    state = STATE.SHOP;
    shopSelection = -1;
    playShopSound();
    return;
  }

  // speed ramp
  speed = 4 + frameCount * 0.003;
  if (speed > 11) speed = 11;

  // Update engine sound pitch with speed
  if (player.hasShield) updateEngineSound();

  // player physics
  player.vy += GRAVITY;
  player.y += player.vy;
  if (player.invincible > 0) player.invincible--;
  if (player.batCooldown > 0) player.batCooldown--;
  if (player.batSwing > 0) player.batSwing--;
  if (player.muzzleFlash > 0) player.muzzleFlash--;
  if (player.carCrash > 0) player.carCrash--;

  // Gun auto-fire: shoots at first visible enemy when cooldown is up
  if (player.weaponTier >= 2) {
    player.gunTimer--;
    if (player.gunTimer <= 0) {
      // Find first enemy on screen ahead of player
      let target = null;
      for (const o of obstacles) {
        if (o.x > player.x && o.x < canvas.width + 10) {
          if (!target || o.x < target.x) target = o;
        }
      }
      if (target) {
        const fireRate = player.weaponTier === 2 ? 900 : player.weaponTier === 3 ? 600 : 300; // 15s, 10s, 5s
        player.gunTimer = fireRate;
        spawnBulletAt(target);
      }
    }
  }

  // Move bullets (tracers only - hits are instant now)
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += (bullets[i].vx || 12);
    bullets[i].y += (bullets[i].vy || 0);
    if (bullets[i].x > canvas.width + 20 || bullets[i].y < -20 || bullets[i].y > canvas.height + 20) {
      bullets.splice(i, 1);
    }
  }

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
      else { chainsCollected++; score += 500; player.bling = Math.min(player.bling + 2, 5); player.chainsWorn++; }
      collectibles.splice(i, 1);
      updateScoreUI();
    }
  }

  // obstacle collision (cops + swat + helicopter + k9)
  if (player.invincible === 0) {
    for (let oi = obstacles.length - 1; oi >= 0; oi--) {
      const o = obstacles[oi];
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
        // Bat hits cops and K-9 on contact FIRST (20s cooldown)
        if (player.weaponTier >= 1 && player.batCooldown <= 0 && (o.type === 'cop' || o.type === 'k9')) {
          player.batCooldown = 1200; // 20 seconds at 60fps
          player.batSwing = 15; // swing animation
          spawnHitParticles(o.x + o.w / 2, o.y + o.h / 2);
          obstacles.splice(oi, 1);
          score += 200;
          playBatCrack();
          updateScoreUI();
          continue;
        }
        // Car shield absorbs one hit then breaks
        if (player.hasShield) {
          player.hasShield = false;
          stopEngineSound();
          player.carCrash = 25; // crash animation
          spawnHitParticles(o.x + o.w / 2, o.y + o.h / 2);
          // Big car-breaking particle explosion
          for (let pi = 0; pi < 20; pi++) {
            const colors = ['#ff2222', '#cc0000', '#ff6600', '#ffaa00', '#880000', '#444'];
            particles.push({ x: player.x + player.w / 2 + (Math.random() - 0.5) * 30, y: player.y + player.h / 2,
              vx: (Math.random() - 0.5) * 12, vy: -3 - Math.random() * 7,
              alpha: 1, size: 4 + Math.random() * 8, color: colors[Math.floor(Math.random() * colors.length)], life: 50 });
          }
          // Glass shards
          for (let pi = 0; pi < 8; pi++) {
            particles.push({ x: player.x + player.w / 2, y: player.y + player.h * 0.3,
              vx: (Math.random() - 0.5) * 10, vy: -2 - Math.random() * 4,
              alpha: 0.8, size: 2 + Math.random() * 3, color: '#aaddff', life: 35 });
          }
          obstacles.splice(oi, 1);
          player.invincible = 30;
          playCarCrash();
          continue;
        }
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

// --- Shop sound ---
function playShopSound() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    // Cash register cha-ching
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < notes.length; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      gain.gain.setValueAtTime(0.2, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.08 + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.2);
    }
  } catch (e) {}
}

function playBatCrack() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    // Sharp crack (wood hitting)
    const crackLen = Math.floor(audioCtx.sampleRate * 0.08);
    const crackBuf = audioCtx.createBuffer(1, crackLen, audioCtx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      const env = i < crackLen * 0.02 ? 1 : Math.exp(-(i / crackLen) * 12);
      crackData[i] = (Math.random() * 2 - 1) * env;
    }
    const crackSrc = audioCtx.createBufferSource();
    crackSrc.buffer = crackBuf;
    const crackFilt = audioCtx.createBiquadFilter();
    crackFilt.type = 'bandpass';
    crackFilt.frequency.value = 3000;
    crackFilt.Q.value = 1.5;
    const crackGain = audioCtx.createGain();
    crackGain.gain.value = 0.5;
    crackSrc.connect(crackFilt);
    crackFilt.connect(crackGain);
    crackGain.connect(audioCtx.destination);
    crackSrc.start(t);
    crackSrc.stop(t + 0.08);

    // Low wood thump
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(250, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    // Body impact (dull thud)
    const thump = audioCtx.createOscillator();
    const thumpGain = audioCtx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(100, t + 0.02);
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    thumpGain.gain.setValueAtTime(0.3, t + 0.02);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    thump.connect(thumpGain);
    thumpGain.connect(audioCtx.destination);
    thump.start(t + 0.02);
    thump.stop(t + 0.15);
  } catch (e) {}
}

function playCarCrash() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    // Metal crunch - long noise burst shaped like a crash
    const crashLen = Math.floor(audioCtx.sampleRate * 0.5);
    const crashBuf = audioCtx.createBuffer(1, crashLen, audioCtx.sampleRate);
    const crashData = crashBuf.getChannelData(0);
    for (let i = 0; i < crashLen; i++) {
      const time = i / audioCtx.sampleRate;
      const env = time < 0.02 ? time / 0.02 : Math.exp(-(time - 0.02) * 5);
      // Mix of noise with metallic resonance
      const noise = (Math.random() * 2 - 1);
      const metal = Math.sin(2 * Math.PI * 180 * time) * 0.3 + Math.sin(2 * Math.PI * 420 * time) * 0.15;
      crashData[i] = (noise * 0.7 + metal) * env;
    }
    const crashSrc = audioCtx.createBufferSource();
    crashSrc.buffer = crashBuf;
    const crashFilt = audioCtx.createBiquadFilter();
    crashFilt.type = 'lowpass';
    crashFilt.frequency.value = 2500;
    const crashGain = audioCtx.createGain();
    crashGain.gain.value = 0.45;
    crashSrc.connect(crashFilt);
    crashFilt.connect(crashGain);
    crashGain.connect(audioCtx.destination);
    crashSrc.start(t);
    crashSrc.stop(t + 0.5);

    // Heavy impact thud
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.3);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.35);

    // Glass breaking
    const glassLen = Math.floor(audioCtx.sampleRate * 0.2);
    const glassBuf = audioCtx.createBuffer(1, glassLen, audioCtx.sampleRate);
    const glassData = glassBuf.getChannelData(0);
    for (let i = 0; i < glassLen; i++) {
      const time = i / audioCtx.sampleRate;
      const env = time < 0.01 ? 1 : Math.exp(-time * 15);
      glassData[i] = (Math.random() * 2 - 1) * env;
    }
    const glassSrc = audioCtx.createBufferSource();
    glassSrc.buffer = glassBuf;
    const glassFilt = audioCtx.createBiquadFilter();
    glassFilt.type = 'highpass';
    glassFilt.frequency.value = 5000;
    const glassGain = audioCtx.createGain();
    glassGain.gain.value = 0.25;
    glassSrc.connect(glassFilt);
    glassFilt.connect(glassGain);
    glassGain.connect(audioCtx.destination);
    glassSrc.start(t + 0.05);
    glassSrc.stop(t + 0.25);
  } catch (e) {}
}

function playHitSound() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  } catch (e) {}
}

function playBuySound() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(800, t + 0.1);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch (e) {}
}

function playDenySound() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.setValueAtTime(100, t + 0.1);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  } catch (e) {}
}

function spawnBulletAt(target) {
  const bx = player.x + player.w + 5;
  const by = player.y + player.h / 2;
  const isUzi = player.weaponTier === 4;
  const targetCx = target.x + target.w / 2;
  const targetCy = target.y + target.h / 2;
  const dx = targetCx - bx;
  const dy = targetCy - by;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const bulletSpeed = 12;
  const bvx = (dx / dist) * bulletSpeed;
  const bvy = (dy / dist) * bulletSpeed;

  // Guaranteed hit: damage the target immediately, bullet is just a visual tracer
  function hitTarget(tgt) {
    const oi = obstacles.indexOf(tgt);
    if (oi === -1) return; // already dead
    spawnHitParticles(tgt.x + tgt.w / 2, tgt.y + tgt.h / 2);
    if (tgt.type === 'swat') {
      tgt.officerCount--;
      const perOfficer = 30;
      tgt.w = tgt.officerCount * perOfficer;
      tgt.x += perOfficer;
      if (tgt.officerCount <= 0) obstacles.splice(oi, 1);
    } else {
      obstacles.splice(oi, 1);
    }
    score += 200;
    playHitSound();
    updateScoreUI();
  }

  // First shot: instant hit + visual tracer
  hitTarget(target);
  bullets.push({ x: bx, y: by, vx: bvx, vy: bvy, w: isUzi ? 10 : 6, h: isUzi ? 3 : 2, tracer: true });
  player.muzzleFlash = 8;
  playGunshot();

  // Uzi fires 3 total shots (burst) - each hits instantly
  if (isUzi) {
    setTimeout(() => {
      if (state !== STATE.PLAYING) return;
      const sx = player.x + player.w + 5, sy = player.y + player.h / 2;
      hitTarget(target);
      const tdx = targetCx - sx, tdy = targetCy - sy;
      const td = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      bullets.push({ x: sx, y: sy, vx: (tdx / td) * bulletSpeed, vy: (tdy / td) * bulletSpeed + (Math.random() - 0.5) * 1.5, w: 10, h: 3, tracer: true });
      player.muzzleFlash = 6;
      playGunshot();
    }, 80);
    setTimeout(() => {
      if (state !== STATE.PLAYING) return;
      const sx = player.x + player.w + 5, sy = player.y + player.h / 2;
      hitTarget(target);
      const tdx = targetCx - sx, tdy = targetCy - sy;
      const td = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      bullets.push({ x: sx, y: sy, vx: (tdx / td) * bulletSpeed, vy: (tdy / td) * bulletSpeed + (Math.random() - 0.5) * 1.5, w: 10, h: 3, tracer: true });
      player.muzzleFlash = 6;
      playGunshot();
    }, 160);
  }
}

function playGunshot() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const isUzi = player.weaponTier === 4;
    // Sharp crack
    const bufSize = Math.floor(audioCtx.sampleRate * (isUzi ? 0.06 : 0.1));
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const env = i < bufSize * 0.05 ? 1 : Math.exp(-(i / bufSize) * 8);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = isUzi ? 2000 : 1000;
    const gain = audioCtx.createGain();
    gain.gain.value = isUzi ? 0.2 : 0.35;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(t);
    src.stop(t + (isUzi ? 0.06 : 0.1));
    // Low thump
    const osc = audioCtx.createOscillator();
    const oGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isUzi ? 300 : 200, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    oGain.gain.setValueAtTime(isUzi ? 0.2 : 0.3, t);
    oGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    osc.connect(oGain);
    oGain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  } catch (e) {}
}

// --- Shop UI ---
// Weapon tiers: 0=none, 1=bat, 2=pistol, 3=pistol+, 4=uzi
const WEAPON_TIERS = [
  null,
  { name: 'BAT', desc: 'Hits cops & K-9s', price: 500 },
  { name: 'PISTOL', desc: 'Shoots every 15s', price: 1200 },
  { name: 'PISTOL+', desc: 'Shoots every 10s', price: 2500 },
  { name: 'UZI', desc: '3-round burst / 5s', price: 5000 },
];

function getShopLayout() {
  const w = canvas.width, h = canvas.height;
  const cardW = Math.min(120, w * 0.28);
  const cardH = cardW * 1.4;
  const gap = Math.min(16, w * 0.03);
  const totalW = cardW * 3 + gap * 2;
  const startX = (w - totalW) / 2;
  const startY = h * 0.28;
  const btnW = Math.min(220, w * 0.55);
  const btnH = 44;
  const btnX = (w - btnW) / 2;
  const btnY = startY + cardH + 50;

  const cards = [];
  for (let i = 0; i < 3; i++) {
    cards.push({
      x: startX + i * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
    });
  }
  return { cards, btn: { x: btnX, y: btnY, w: btnW, h: btnH } };
}

function getShopCardData() {
  // Card 0: Next weapon upgrade
  const nextTier = player.weaponTier + 1;
  const maxedWeapon = nextTier > 4;
  const wData = maxedWeapon ? null : WEAPON_TIERS[nextTier];
  // Card 1: Car shield
  // Card 2: Chain
  return [
    { name: maxedWeapon ? 'MAXED' : wData.name, desc: maxedWeapon ? 'All upgrades!' : wData.desc,
      price: maxedWeapon ? 0 : wData.price, owned: maxedWeapon, type: 'weapon', tier: nextTier },
    { name: 'CAR', desc: 'One-hit shield', price: 1000, owned: player.hasShield, type: 'car' },
    { name: 'CHAIN', desc: 'Gold Chain', price: 300, owned: false, type: 'chain' },
  ];
}

function drawShop() {
  if (state !== STATE.SHOP) return;
  const w = canvas.width, h = canvas.height;
  const layout = getShopLayout();
  const shopCards = getShopCardData();

  // Dark overlay
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.min(36, w * 0.08) + 'px Arial Black, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 15;
  ctx.fillText('SHOP', w / 2, h * 0.12);
  ctx.shadowBlur = 0;

  // Checkpoint + current weapon indicator
  ctx.fillStyle = '#aaa';
  ctx.font = Math.min(14, w * 0.035) + 'px Arial';
  const weaponNames = ['None', 'Bat', 'Pistol', 'Pistol+', 'Uzi'];
  ctx.fillText('Checkpoint: ' + distance + 'm  |  Weapon: ' + weaponNames[player.weaponTier], w / 2, h * 0.17);

  // Cash balance
  ctx.fillStyle = '#00e676';
  ctx.font = 'bold ' + Math.min(20, w * 0.05) + 'px Arial';
  ctx.fillText('💵 $' + cashCollected, w / 2, h * 0.23);

  // Draw item cards
  for (let i = 0; i < 3; i++) {
    const item = shopCards[i];
    const card = layout.cards[i];
    const canAfford = cashCollected >= item.price && !item.owned;

    // Card background
    ctx.fillStyle = item.owned ? 'rgba(0,200,100,0.2)' : canAfford ? 'rgba(255,215,0,0.12)' : 'rgba(100,100,100,0.12)';
    ctx.strokeStyle = item.owned ? '#00e676' : canAfford ? 'rgba(255,215,0,0.6)' : 'rgba(100,100,100,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(card.x, card.y, card.w, card.h, 12);
    ctx.fill();
    ctx.stroke();

    // Icon
    const iconCx = card.x + card.w / 2;
    const iconCy = card.y + card.h * 0.32;
    const iconSize = card.w * 0.3;
    ctx.save();
    if (i === 0) drawWeaponIcon(iconCx, iconCy, iconSize, canAfford || item.owned, item.tier);
    else if (i === 1) drawCarIcon(iconCx, iconCy, iconSize, canAfford || item.owned);
    else drawChainIcon(iconCx, iconCy, iconSize, canAfford);
    ctx.restore();

    // Name
    ctx.fillStyle = (canAfford || item.owned) ? '#fff' : '#666';
    ctx.font = 'bold ' + Math.min(13, card.w * 0.11) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, iconCx, card.y + card.h * 0.6);

    // Description
    ctx.fillStyle = (canAfford || item.owned) ? '#aaa' : '#555';
    ctx.font = Math.min(10, card.w * 0.085) + 'px Arial';
    ctx.fillText(item.desc, iconCx, card.y + card.h * 0.72);

    // Price / status
    if (item.owned) {
      ctx.fillStyle = '#00e676';
      ctx.font = 'bold ' + Math.min(14, card.w * 0.12) + 'px Arial';
      ctx.fillText(item.type === 'weapon' ? 'MAX' : 'OWNED', iconCx, card.y + card.h * 0.88);
    } else {
      ctx.fillStyle = canAfford ? '#ffd700' : '#666';
      ctx.font = 'bold ' + Math.min(14, card.w * 0.12) + 'px Arial';
      ctx.fillText('$' + item.price, iconCx, card.y + card.h * 0.88);
    }
  }

  // Continue button
  const btn = layout.btn;
  const btnGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x + btn.w, btn.y);
  btnGrad.addColorStop(0, '#ffd700');
  btnGrad.addColorStop(1, '#ff8c00');
  ctx.fillStyle = btnGrad;
  ctx.beginPath();
  ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 22);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = 'bold ' + Math.min(18, w * 0.045) + 'px Arial Black, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KEEP RUNNING', btn.x + btn.w / 2, btn.y + btn.h / 2 + 6);

  ctx.restore();
}

function drawWeaponIcon(cx, cy, size, active, tier) {
  ctx.save();
  ctx.translate(cx, cy);
  if (tier <= 1) {
    // Bat
    ctx.rotate(-0.5);
    ctx.fillStyle = active ? '#8B4513' : '#444';
    ctx.beginPath();
    ctx.roundRect(-size * 0.15, -size * 1.2, size * 0.3, size * 2.2, 3);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillRect(-size * 0.18, size * 0.5, size * 0.36, size * 0.5);
    ctx.fillStyle = active ? '#A0522D' : '#555';
    ctx.beginPath();
    ctx.roundRect(-size * 0.25, -size * 1.3, size * 0.5, size * 0.6, 5);
    ctx.fill();
  } else if (tier <= 3) {
    // Pistol
    const c1 = active ? '#555' : '#333';
    const c2 = active ? '#888' : '#555';
    // Barrel
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.roundRect(-size * 0.8, -size * 0.15, size * 1.4, size * 0.3, 2);
    ctx.fill();
    // Body
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.roundRect(-size * 0.3, -size * 0.25, size * 0.8, size * 0.5, 3);
    ctx.fill();
    // Grip
    ctx.fillStyle = active ? '#3a2518' : '#333';
    ctx.beginPath();
    ctx.roundRect(-size * 0.1, size * 0.2, size * 0.4, size * 0.7, 2);
    ctx.fill();
    // Trigger guard
    ctx.strokeStyle = c1;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(size * 0.1, size * 0.3, size * 0.15, 0, Math.PI);
    ctx.stroke();
    if (tier === 3) {
      // + upgrade indicator
      ctx.fillStyle = active ? '#ffd700' : '#666';
      ctx.font = 'bold ' + (size * 0.5) + 'px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('+', size * 0.7, -size * 0.3);
    }
  } else {
    // Uzi
    const c1 = active ? '#444' : '#333';
    const c2 = active ? '#777' : '#555';
    // Long barrel
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.roundRect(-size * 1.0, -size * 0.12, size * 1.6, size * 0.24, 2);
    ctx.fill();
    // Body (boxy)
    ctx.fillStyle = c1;
    ctx.fillRect(-size * 0.5, -size * 0.3, size * 1.0, size * 0.55);
    // Magazine
    ctx.fillStyle = active ? '#333' : '#222';
    ctx.fillRect(-size * 0.1, size * 0.2, size * 0.25, size * 0.8);
    // Grip
    ctx.fillStyle = active ? '#3a2518' : '#333';
    ctx.beginPath();
    ctx.roundRect(size * 0.15, size * 0.2, size * 0.3, size * 0.6, 2);
    ctx.fill();
    // Stock
    ctx.fillStyle = c1;
    ctx.fillRect(size * 0.5, -size * 0.25, size * 0.15, size * 0.4);
    ctx.fillRect(size * 0.5, -size * 0.25, size * 0.4, size * 0.1);
    // Muzzle flash hint
    if (active) {
      ctx.fillStyle = 'rgba(255,200,0,0.4)';
      ctx.beginPath();
      ctx.arc(-size * 1.0, 0, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCarIcon(cx, cy, size, active) {
  ctx.save();
  ctx.translate(cx, cy);
  // Sleek sports car body
  const c1 = active ? '#ff2222' : '#555';
  const c2 = active ? '#cc0000' : '#444';
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(-size * 0.9, size * 0.1);
  ctx.lineTo(-size * 0.7, -size * 0.2);
  ctx.lineTo(-size * 0.3, -size * 0.3);
  ctx.lineTo(size * 0.5, -size * 0.3);
  ctx.lineTo(size * 0.9, -size * 0.1);
  ctx.lineTo(size * 1.0, size * 0.1);
  ctx.closePath();
  ctx.fill();
  // Roof (low sporty)
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 0.3);
  ctx.lineTo(-size * 0.05, -size * 0.65);
  ctx.lineTo(size * 0.35, -size * 0.65);
  ctx.lineTo(size * 0.5, -size * 0.3);
  ctx.closePath();
  ctx.fill();
  // Windshield
  ctx.fillStyle = active ? 'rgba(150,220,255,0.6)' : 'rgba(100,100,100,0.4)';
  ctx.beginPath();
  ctx.moveTo(size * 0.2, -size * 0.3);
  ctx.lineTo(size * 0.28, -size * 0.58);
  ctx.lineTo(size * 0.35, -size * 0.58);
  ctx.lineTo(size * 0.45, -size * 0.3);
  ctx.closePath();
  ctx.fill();
  // Headlight
  if (active) {
    ctx.fillStyle = '#ffff88';
    ctx.beginPath();
    ctx.arc(size * 0.95, 0, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  // Wheels
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-size * 0.45, size * 0.2, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size * 0.55, size * 0.2, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  // Rims
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-size * 0.45, size * 0.2, size * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size * 0.55, size * 0.2, size * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawChainIcon(cx, cy, size, active) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = active ? '#ffd700' : '#666';
  ctx.lineWidth = 3;
  ctx.shadowColor = active ? '#ffd700' : 'transparent';
  ctx.shadowBlur = active ? 8 : 0;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  // Inner ring
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  // Diamond pendant
  ctx.fillStyle = active ? '#ffd700' : '#666';
  ctx.beginPath();
  ctx.moveTo(0, size * 0.5);
  ctx.lineTo(size * 0.2, size * 0.8);
  ctx.lineTo(0, size * 1.1);
  ctx.lineTo(-size * 0.2, size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// --- Shop interaction ---
function handleShopClick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top) * scaleY;

  const layout = getShopLayout();

  // Check continue button
  const btn = layout.btn;
  if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
    state = STATE.PLAYING;
    return;
  }

  // Check item cards
  for (let i = 0; i < 3; i++) {
    const card = layout.cards[i];
    if (cx >= card.x && cx <= card.x + card.w && cy >= card.y && cy <= card.y + card.h) {
      buyItem(i);
      return;
    }
  }
}

function buyItem(index) {
  const shopCards = getShopCardData();
  const item = shopCards[index];
  if (item.owned) { playDenySound(); return; }
  if (cashCollected < item.price) { playDenySound(); return; }

  cashCollected -= item.price;
  playBuySound();

  if (index === 0) {
    // Weapon upgrade
    player.weaponTier = item.tier;
    player.batCooldown = 0;
    player.gunTimer = 60; // first shot comes quickly
  } else if (index === 1) {
    // Car - one hit shield
    player.hasShield = true;
    startEngineSound();
  } else {
    // Chain
    player.chainsWorn++;
    chainsBought++;
  }
  updateScoreUI();
}

function killPlayer() {
  spawnHitParticles(player.x + player.w / 2, player.y + player.h / 2);
  state = STATE.DEAD;
  stopMusic();
  const totalChains = chainsCollected + chainsBought;
  const isNewHigh = totalChains > highScore;
  if (isNewHigh) { highScore = totalChains; localStorage.setItem('hoodRunnerHS', highScore); }
  setTimeout(() => showGameOver(isNewHigh), 600);
}

function showGameOver(newHigh) {
  const totalChains = chainsCollected + chainsBought;
  document.getElementById('final-cash').textContent = '$' + cashCollected;
  document.getElementById('final-chains').textContent = totalChains;
  document.getElementById('final-distance').textContent = distance + 'm';
  document.getElementById('final-score').textContent = totalChains + ' chains';
  document.getElementById('high-score-msg').textContent = newHigh ? '🏆 NEW CHAIN RECORD!' : 'Best: ' + highScore + ' chains';
  document.getElementById('high-score-display').textContent = 'Best: ' + highScore + ' chains';
  showScreen('game-over-screen');
}

function updateScoreUI() {
  const totalChains = chainsCollected + chainsBought;
  document.getElementById('cash-score').textContent = '💵 $' + cashCollected;
  document.getElementById('chain-score').textContent = '⛓️ x' + totalChains;
  document.getElementById('distance-score').textContent = '🏃 ' + distance + 'm';
  document.getElementById('high-score-display').textContent = 'Best: ' + highScore + ' chains';
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

  // If in car, skip normal body draw - car has driver inside
  if (p.hasShield) {
    drawCarShield(p, walkOffset);
    return;
  }

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

  // chains on neck (unlimited stacking - hang down off screen!)
  if (p.chainsWorn > 0) {
    const numChains = p.chainsWorn;
    const goldColors = ['#ffd700', '#ffec80', '#daa520', '#fff176', '#e6be00', '#ffb300', '#ffc107', '#ffab00'];
    const diamondColors = ['#88ffff', '#ffffff', '#ff88ff', '#88ff88', '#ffff88'];

    // Each chain hangs progressively lower
    // Spacing: each chain adds 3px of hang distance
    const baseY = -52; // neck position
    const chainSpacing = 3; // vertical spacing between chains

    for (let i = 0; i < numChains; i++) {
      const hangDist = baseY + i * chainSpacing;
      const radius = 6 + i * chainSpacing * 0.5;
      const isDiamond = ((i + 1) % 10 === 0); // every 10th chain has diamonds

      ctx.save();
      if (isDiamond) {
        // Diamond chain - sparkly white/cyan with glow
        ctx.shadowColor = '#88ffff';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#cceeff';
        ctx.lineWidth = 3;
      } else {
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = Math.min(3 + numChains * 0.2, 15);
        ctx.strokeStyle = goldColors[i % goldColors.length];
        ctx.lineWidth = 2.5;
      }

      // Draw the chain arc
      ctx.beginPath();
      ctx.arc(0, hangDist, radius, 0.15, Math.PI - 0.15);
      ctx.stroke();

      // Shimmer highlight
      ctx.strokeStyle = isDiamond ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, hangDist, radius - 0.5, 0.3, Math.PI * 0.6);
      ctx.stroke();

      // Diamond chain gets gems along the arc
      if (isDiamond) {
        const gemCount = Math.min(5, 3 + Math.floor(i / 30));
        for (let g = 0; g < gemCount; g++) {
          const angle = 0.4 + g * (Math.PI - 0.8) / (gemCount - 1 || 1);
          const gx = Math.cos(angle) * radius;
          const gy = hangDist + Math.sin(angle) * radius;
          // Sparkle
          const sparkle = Math.sin(frameCount * 0.15 + g * 1.5) * 0.4 + 0.6;
          ctx.fillStyle = diamondColors[g % diamondColors.length];
          ctx.globalAlpha = sparkle;
          ctx.beginPath();
          // Diamond shape
          ctx.moveTo(gx, gy - 2.5);
          ctx.lineTo(gx + 2, gy);
          ctx.lineTo(gx, gy + 2.5);
          ctx.lineTo(gx - 2, gy);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();

      // Pendant on every 5th chain
      if ((i + 1) % 5 === 0) {
        const py = hangDist + radius;
        ctx.save();
        if (isDiamond) {
          ctx.shadowColor = '#88ffff';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#aaeeff';
        } else {
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 6;
          ctx.fillStyle = '#ffd700';
        }
        // Diamond pendant
        ctx.beginPath();
        ctx.moveTo(0, py - 1);
        ctx.lineTo(3, py + 3);
        ctx.lineTo(0, py + 6);
        ctx.lineTo(-3, py + 3);
        ctx.closePath();
        ctx.fill();
        // Sparkle dot
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-0.5, py + 2, 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Chain count badge (always show)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const badgeX = 18;
    const badgeY = -56;
    ctx.beginPath();
    ctx.roundRect(badgeX - 14, badgeY - 8, 28, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('x' + numChains, badgeX, badgeY + 3);
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

  // Weapon visual in hand
  if (p.weaponTier === 1) {
    // Bat in hand - with swing animation
    ctx.save();
    const swingAngle = p.batSwing > 0 ? -1.2 + (p.batSwing / 15) * 1.6 : 0.4;
    ctx.translate(16, -42 - armSwing);
    ctx.rotate(swingAngle);
    ctx.fillStyle = '#333';
    ctx.fillRect(-2, -4, 4, 12);
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.roundRect(-3, -22, 6, 20, 2);
    ctx.fill();
    ctx.fillStyle = '#A0522D';
    ctx.beginPath();
    ctx.roundRect(-4, -26, 8, 6, 3);
    ctx.fill();
    // Swing trail effect
    if (p.batSwing > 5) {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -14, 18, -0.5, 0.8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  } else if (p.weaponTier >= 2) {
    // Gun in hand (pistol or uzi)
    const isUzi = p.weaponTier === 4;
    ctx.save();
    ctx.translate(18, (isUzi ? -42 : -40) - armSwing);
    ctx.rotate(isUzi ? 0.15 : 0.2);
    if (isUzi) {
      ctx.fillStyle = '#555';
      ctx.fillRect(-2, -16, 4, 14);
      ctx.fillStyle = '#444';
      ctx.fillRect(-3, -4, 7, 8);
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 4, 3, 8);
      ctx.fillStyle = '#3a2518';
      ctx.fillRect(3, 2, 4, 6);
    } else {
      ctx.fillStyle = '#555';
      ctx.fillRect(-1, -12, 3, 10);
      ctx.fillStyle = '#444';
      ctx.fillRect(-2, -4, 5, 6);
      ctx.fillStyle = '#3a2518';
      ctx.fillRect(-1, 2, 4, 6);
    }
    // Muzzle flash
    if (p.muzzleFlash > 0) {
      const flashSize = p.muzzleFlash * 1.2;
      ctx.save();
      ctx.translate(isUzi ? 0 : 0, isUzi ? -18 : -14);
      ctx.fillStyle = '#ffff44';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -flashSize);
      ctx.lineTo(flashSize * 0.4, -flashSize * 0.3);
      ctx.lineTo(flashSize, 0);
      ctx.lineTo(flashSize * 0.4, flashSize * 0.3);
      ctx.lineTo(0, flashSize);
      ctx.lineTo(-flashSize * 0.3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, flashSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  ctx.restore();

  // Car crash flash effect (shows after car breaks)
  if (p.carCrash > 15) {
    ctx.save();
    ctx.globalAlpha = (p.carCrash - 15) / 10 * 0.2;
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

function drawCarShield(p, walkOffset) {
  ctx.save();
  const carX = p.x + p.w / 2;
  const carY = p.y + p.h;

  // Scale car up so it's way bigger than cops
  const carScale = 2.3;
  const groundY = carY + 16; // bottom of wheels
  ctx.translate(carX, groundY);
  ctx.scale(carScale, carScale);
  ctx.translate(-carX, -groundY);

  // Shadow under car
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(carX + 4, carY + 12, 44, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main body - big sleek sports car
  const bodyGrad = ctx.createLinearGradient(carX - 42, carY - 30, carX - 42, carY + 10);
  bodyGrad.addColorStop(0, '#ff3333');
  bodyGrad.addColorStop(0.5, '#cc0000');
  bodyGrad.addColorStop(1, '#880000');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(carX - 42, carY + 6);
  ctx.lineTo(carX - 38, carY - 8);
  ctx.lineTo(carX - 24, carY - 14);
  ctx.lineTo(carX + 28, carY - 14);
  ctx.lineTo(carX + 44, carY - 6);
  ctx.lineTo(carX + 48, carY + 6);
  ctx.closePath();
  ctx.fill();

  // Lower body stripe
  ctx.fillStyle = '#990000';
  ctx.beginPath();
  ctx.moveTo(carX - 40, carY + 2);
  ctx.lineTo(carX + 46, carY + 2);
  ctx.lineTo(carX + 48, carY + 6);
  ctx.lineTo(carX - 42, carY + 6);
  ctx.closePath();
  ctx.fill();

  // Roof (character visible through windows)
  ctx.fillStyle = '#aa0000';
  ctx.beginPath();
  ctx.moveTo(carX - 14, carY - 14);
  ctx.lineTo(carX - 8, carY - 32);
  ctx.lineTo(carX + 18, carY - 32);
  ctx.lineTo(carX + 26, carY - 14);
  ctx.closePath();
  ctx.fill();

  // Windshield (big, see driver)
  ctx.fillStyle = 'rgba(120,200,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(carX + 10, carY - 14);
  ctx.lineTo(carX + 15, carY - 30);
  ctx.lineTo(carX + 18, carY - 30);
  ctx.lineTo(carX + 24, carY - 14);
  ctx.closePath();
  ctx.fill();

  // Driver visible through windshield (head + cap)
  ctx.fillStyle = p.skinColor;
  ctx.beginPath();
  ctx.arc(carX + 8, carY - 24, 6, 0, Math.PI * 2);
  ctx.fill();
  // Cap
  ctx.fillStyle = '#b71c1c';
  ctx.beginPath();
  ctx.arc(carX + 8, carY - 27, 7, Math.PI, 0);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(carX + 6, carY - 25, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(carX + 10, carY - 25, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Hand on wheel
  ctx.fillStyle = p.skinColor;
  ctx.beginPath();
  ctx.arc(carX + 14, carY - 18, 3, 0, Math.PI * 2);
  ctx.fill();

  // Rear window
  ctx.fillStyle = 'rgba(120,200,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(carX - 12, carY - 14);
  ctx.lineTo(carX - 8, carY - 28);
  ctx.lineTo(carX - 4, carY - 28);
  ctx.lineTo(carX + 2, carY - 14);
  ctx.closePath();
  ctx.fill();

  // Hood highlight
  ctx.fillStyle = 'rgba(255,180,180,0.25)';
  ctx.beginPath();
  ctx.ellipse(carX + 38, carY - 8, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Headlights (bright)
  ctx.fillStyle = '#ffffaa';
  ctx.shadowColor = '#ffff44';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(carX + 47, carY - 2, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(carX + 46, carY + 3, 2, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Tail lights
  ctx.fillStyle = '#ff0000';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.ellipse(carX - 41, carY - 2, 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(carX - 40, carY + 3, 2, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Wheels with rims (bigger)
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(carX - 24, carY + 8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(carX + 30, carY + 8, 8, 0, Math.PI * 2);
  ctx.fill();
  // Chrome rims
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(carX - 24, carY + 8, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(carX + 30, carY + 8, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  // Rim spokes (spinning)
  ctx.lineWidth = 1;
  for (let s = 0; s < 5; s++) {
    const a = s * Math.PI * 2 / 5 + frameCount * 0.1;
    ctx.beginPath();
    ctx.moveTo(carX - 24, carY + 8);
    ctx.lineTo(carX - 24 + Math.cos(a) * 4.5, carY + 8 + Math.sin(a) * 4.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(carX + 30, carY + 8);
    ctx.lineTo(carX + 30 + Math.cos(a) * 4.5, carY + 8 + Math.sin(a) * 4.5);
    ctx.stroke();
  }

  // Side mirror
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(carX + 22, carY - 16, 4, 3);

  ctx.restore();
}

function drawBullets() {
  for (const b of bullets) {
    ctx.save();
    ctx.fillStyle = '#ffdd44';
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tracer trail
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.ellipse(b.x - 4, b.y + b.h / 2, 4, b.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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

function drawWeaponHUD() {
  if (state !== STATE.PLAYING || player.weaponTier < 1) return;
  const w = canvas.width;
  const hudX = w - 32;
  const hudY = Math.floor(canvas.height * 0.4); // at skyscraper top level

  ctx.save();
  // Bat cooldown ring
  if (player.weaponTier >= 1) {
    const ready = player.batCooldown <= 0;
    const pct = ready ? 1 : 1 - (player.batCooldown / 1200);

    // Background circle
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(hudX, hudY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Cooldown arc
    ctx.strokeStyle = ready ? '#00e676' : '#ff4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hudX, hudY, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();

    // Bat icon inside
    ctx.fillStyle = ready ? '#A0522D' : '#666';
    ctx.save();
    ctx.translate(hudX, hudY);
    ctx.rotate(-0.4);
    ctx.beginPath();
    ctx.roundRect(-2, -8, 4, 13, 2);
    ctx.fill();
    ctx.fillStyle = ready ? '#8B4513' : '#555';
    ctx.beginPath();
    ctx.roundRect(-3, -11, 6, 4, 2);
    ctx.fill();
    ctx.restore();

    // "READY" or seconds left
    ctx.fillStyle = ready ? '#00e676' : '#ff8888';
    ctx.font = 'bold 7px Arial';
    ctx.textAlign = 'center';
    if (ready) {
      ctx.fillText('READY', hudX, hudY + 24);
    } else {
      const secsLeft = Math.ceil(player.batCooldown / 60);
      ctx.fillText(secsLeft + 's', hudX, hudY + 24);
    }
  }

  // Shield indicator
  if (player.hasShield) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(hudX - 38, hudY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2222';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🚗', hudX - 38, hudY + 4);
  }

  // Gun indicator (show next shot timer for gun tiers)
  if (player.weaponTier >= 2) {
    const gunY = hudY + 42;
    const fireRate = player.weaponTier === 2 ? 900 : player.weaponTier === 3 ? 600 : 300;
    const gunPct = player.gunTimer <= 0 ? 1 : 1 - (player.gunTimer / fireRate);
    const gunReady = player.gunTimer <= 0;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(hudX, gunY, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = gunReady ? '#ffaa00' : '#888';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(hudX, gunY, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * gunPct);
    ctx.stroke();

    // Gun icon
    ctx.fillStyle = gunReady ? '#ddd' : '#888';
    ctx.fillRect(hudX - 5, gunY - 2, 10, 3);
    ctx.fillRect(hudX - 1, gunY + 1, 3, 5);

    // Label
    const gunNames = ['', '', 'GUN', 'GUN+', 'UZI'];
    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 6px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(gunNames[player.weaponTier], hudX, gunY + 22);
  }

  ctx.restore();
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
  drawBullets();
  drawParticles();
  drawSpeedLines();
  drawWeaponHUD();
  drawDeathScreen();
  drawShop();
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
document.getElementById('high-score-display').textContent = 'Best: ' + highScore + ' chains';
initClouds();
spawnInitialPlatforms();
titleLoop();
