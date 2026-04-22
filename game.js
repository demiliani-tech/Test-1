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

function getMusicPhase() {
  // Phase changes every ~85m for distinct shifts
  return Math.floor(distance / 85);
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
    osc1.frequency.value = 85;
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 42;
    // Second harmonic for fullness
    const osc3 = audioCtx.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.value = 170;
    // Noise for engine texture
    const bufSize = audioCtx.sampleRate * 2;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    // Noise gain - separate louder noise
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.3;
    // Filter for rumble - wider
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    lp.Q.value = 2;
    // Main gain - much louder
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.3);
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 7;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.1;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc1.connect(lp);
    osc2.connect(lp);
    osc3.connect(lp);
    noiseSrc.connect(noiseGain);
    noiseGain.connect(lp);
    lp.connect(gain);
    gain.connect(audioCtx.destination);
    osc1.start(); osc2.start(); osc3.start(); noiseSrc.start(); lfo.start();
    engineNode = { osc1, osc2, osc3, noiseSrc, gain, lfo, lfoGain, noiseGain };
  } catch (e) {}
}

function stopEngineSound() {
  if (!engineNode) return;
  try {
    engineNode.gain.gain.setValueAtTime(engineNode.gain.gain.value, audioCtx.currentTime);
    engineNode.gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    setTimeout(() => {
      try {
        engineNode.osc1.stop(); engineNode.osc2.stop(); engineNode.osc3.stop();
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
    const freq = 70 + spd * 10; // 70-180 Hz range
    engineNode.osc1.frequency.setValueAtTime(freq, audioCtx.currentTime);
    engineNode.osc2.frequency.setValueAtTime(freq * 0.5, audioCtx.currentTime);
    engineNode.osc3.frequency.setValueAtTime(freq * 2, audioCtx.currentTime);
    engineNode.lfo.frequency.setValueAtTime(5 + spd * 1, audioCtx.currentTime);
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

// --- Car-specific trap sounds ---
function play808(dest, time, freq) {
  try {
    // 808 sub bass hit - long sustain, heavy
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq || 45, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.5);
    gain.gain.setValueAtTime(1.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    // Distortion for that 808 crunch
    const waveshaper = audioCtx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x)); }
    waveshaper.curve = curve;
    osc.connect(waveshaper);
    waveshaper.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.5);
  } catch (e) {}
}

function playClap(dest, time) {
  try {
    // Layered clap: multiple short noise bursts
    for (let c = 0; c < 3; c++) {
      const bufSize = Math.floor(audioCtx.sampleRate * 0.03);
      const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = audioCtx.createBufferSource();
      noise.buffer = buf;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.9, time + c * 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, time + c * 0.01 + 0.06);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500;
      bp.Q.value = 1;
      noise.connect(bp);
      bp.connect(gain);
      gain.connect(dest);
      noise.start(time + c * 0.01);
      noise.stop(time + c * 0.01 + 0.06);
    }
  } catch (e) {}
}

// Drum loop: picks pattern based on phase/car
function loopBeat(dest) {
  if (!musicPlaying) return;
  try {
    const t = audioCtx.currentTime + 0.1;
    const phase = getMusicPhase();
    if (player.hasShield) {
      // Car mode: heavy trap beat with 808s and claps
      play808(dest, t, 50);
      play808(dest, t + BEAT * 0.25, 50);
      playClap(dest, t + BEAT);
      play808(dest, t + BEAT * 2, 55);
      play808(dest, t + BEAT * 2.75, 50);
      playClap(dest, t + BEAT * 3);
      play808(dest, t + BEAT * 4, 50);
      play808(dest, t + BEAT * 4.25, 50);
      play808(dest, t + BEAT * 4.5, 55);
      playClap(dest, t + BEAT * 5);
      play808(dest, t + BEAT * 6, 50);
      playClap(dest, t + BEAT * 7);
    } else {
      drumPatterns[phase % drumPatterns.length](dest, t);
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
    if (player.hasShield) {
      // Car: deep 808 sub bass slides
      const carNotes = [36.71, 36.71, 0, 41.2, 36.71, 0, 32.7, 36.71];
      for (let i = 0; i < carNotes.length; i++) {
        if (carNotes[i] === 0) continue;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = carNotes[i];
        gain.gain.setValueAtTime(0.7, t + i * BEAT);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * BEAT + BEAT * 0.9);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t + i * BEAT);
        osc.stop(t + i * BEAT + BEAT * 0.95);
      }
    } else {
      const notes = bassPatterns[phase % bassPatterns.length];
      for (let i = 0; i < notes.length; i++) {
        if (notes[i] === 0) continue;
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
    if (player.hasShield) {
      // Car: dark trap synth stabs - sparse, heavy
      const stabs = [
        { t: 0, n: 164.81, d: 0.5 },
        { t: 2, n: 146.83, d: 0.5 },
        { t: 3, n: 164.81, d: 1 },
        { t: 5, n: 130.81, d: 0.5 },
        { t: 6.5, n: 146.83, d: 1 },
      ];
      for (const s of stabs) {
        const osc = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc2.type = 'square';
        osc.frequency.value = s.n;
        osc2.frequency.value = s.n * 0.998;
        const filt = audioCtx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 600;
        filt.Q.value = 4;
        gain.gain.setValueAtTime(0.001, t + s.t * BEAT);
        gain.gain.linearRampToValueAtTime(0.15, t + s.t * BEAT + 0.02);
        gain.gain.setValueAtTime(0.15, t + (s.t + s.d * 0.6) * BEAT);
        gain.gain.linearRampToValueAtTime(0.001, t + (s.t + s.d) * BEAT);
        osc.connect(filt); osc2.connect(filt);
        filt.connect(gain); gain.connect(dest);
        osc.start(t + s.t * BEAT); osc.stop(t + (s.t + s.d) * BEAT + 0.01);
        osc2.start(t + s.t * BEAT); osc2.stop(t + (s.t + s.d) * BEAT + 0.01);
      }
    } else {
      const mel = melodyPatterns[phase % melodyPatterns.length];
      let offset = 0;
      for (let i = 0; i < mel.notes.length; i++) {
        if (mel.notes[i] > 0) {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'square';
          osc.frequency.value = mel.notes[i];
          const osc2 = audioCtx.createOscillator();
          osc2.type = 'sawtooth';
          osc2.frequency.value = mel.notes[i] * 1.003;
          const filt = audioCtx.createBiquadFilter();
          filt.type = 'lowpass';
          filt.frequency.value = 1200;
          gain.gain.setValueAtTime(0.001, t + offset * BEAT);
          gain.gain.linearRampToValueAtTime(0.1, t + offset * BEAT + 0.03);
          gain.gain.setValueAtTime(0.1, t + (offset + mel.durs[i] * 0.7) * BEAT);
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
      // Car: trap hi-hat rolls with accents
      for (let i = 0; i < 32; i++) {
        const isRoll = (i >= 6 && i <= 9) || (i >= 14 && i <= 17) || (i >= 22 && i <= 25) || (i >= 30 && i <= 31);
        const isOpen = (i === 9 || i === 17 || i === 25 || i === 31);
        if (isRoll || i % 2 === 0) {
          playHiHat(dest, t + i * BEAT * 0.25, isOpen);
        }
      }
    } else {
      hihatPatterns[phase % hihatPatterns.length](dest, t);
    }
  } catch (e) {}
  musicNodes.hihatTimeout = setTimeout(() => loopHiHat(dest), BEAT * 8 * 1000 - 100);
}

// --- Game state ---
const STATE = { START: 0, PLAYING: 1, DEAD: 2, SHOP: 3, BLOCK: 4 };
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

// --- Block / Home system (persistent) ---
let savedChains = parseInt(localStorage.getItem('hrSavedChains') || '0');
let blockSelectedBuilding = -1; // which building is tapped for upgrade panel
let blockScrollX = 0;
let blockScrollVel = 0;
let blockTouchId = null;
let blockTouchStartX = 0;
let blockTouchStartY = 0;
let blockTouchStartScroll = 0;
let blockDragMoved = false;
let blockLastMoveX = 0;
let blockLastMoveTime = 0;

const BUILDINGS = {
  trapHouse: {
    name: 'TRAP HOUSE',
    blockName: 'TRAP HOUSE',
    levels: [
      { cost: 0, label: 'Empty', desc: 'No perks', effect: null },
      { cost: 25, label: 'Lv 1', desc: 'Start with Bat', effect: { weaponTier: 1 } },
      { cost: 100, label: 'Lv 2', desc: 'Start with Pistol', effect: { weaponTier: 2 } },
      { cost: 300, label: 'Lv 3', desc: 'Start with Pistol+', effect: { weaponTier: 3 } },
      { cost: 800, label: 'Lv 4', desc: 'Start with Uzi', effect: { weaponTier: 4 } },
    ],
  },
  garage: {
    name: 'CHOP SHOP',
    blockName: 'CHOP SHOP',
    levels: [
      { cost: 0, label: 'Empty', desc: 'No car', effect: null },
      { cost: 50, label: 'Lv 1', desc: 'Start with Car', effect: { carHits: 1 } },
      { cost: 200, label: 'Lv 2', desc: 'Car takes 2 hits', effect: { carHits: 2 } },
      { cost: 500, label: 'Lv 3', desc: 'Car takes 3 hits', effect: { carHits: 3 } },
    ],
  },
  clothing: {
    name: 'NIGHTCLUB',
    blockName: 'NIGHTCLUB',
    levels: [
      { cost: 0, label: 'Default', desc: 'Basic fit', effect: null },
      { cost: 20, label: 'Gold', desc: 'Gold outfit', effect: { shirt: '#ffd700', pants: '#b8860b', sneakers: '#ffd700' } },
      { cost: 75, label: 'Diamond', desc: 'Ice drip', effect: { shirt: '#b0e0e6', pants: '#4682b4', sneakers: '#e0ffff' } },
      { cost: 250, label: 'Fire', desc: 'Flame fit', effect: { shirt: '#ff4500', pants: '#8b0000', sneakers: '#ff6347' } },
      { cost: 600, label: 'Shadow', desc: 'All black everything', effect: { shirt: '#1a1a1a', pants: '#0a0a0a', sneakers: '#2a2a2a' } },
    ],
  },
  stashHouse: {
    name: 'STASH HOUSE',
    blockName: 'STASH HOUSE',
    levels: [
      { cost: 0, label: 'Empty', desc: 'No auto-save on death', effect: null },
      { cost: 50, label: 'Lv 1', desc: '10% of chains saved on death', effect: { stashPct: 0.10 } },
      { cost: 150, label: 'Lv 2', desc: '20% of chains saved on death', effect: { stashPct: 0.20 } },
      { cost: 400, label: 'Lv 3', desc: '30% of chains saved on death', effect: { stashPct: 0.30 } },
      { cost: 1000, label: 'Lv 4', desc: '40% of chains saved on death', effect: { stashPct: 0.40 } },
    ],
  },
  vault: {
    name: 'THE VAULT',
    blockName: 'THE VAULT',
    levels: [
      { cost: 0, label: 'Locked', desc: 'Not owned yet', effect: null },
      { cost: 200, label: 'Lv 1', desc: '2%/hr, cap 500, 5% raid', effect: { interest: 0.02, raid: 0.05, cap: 500 } },
      { cost: 600, label: 'Lv 2', desc: '3%/hr, cap 2000, 4% raid', effect: { interest: 0.03, raid: 0.04, cap: 2000 } },
      { cost: 1500, label: 'Lv 3', desc: '4%/hr, cap 5000, 3% raid', effect: { interest: 0.04, raid: 0.03, cap: 5000 } },
      { cost: 3500, label: 'Lv 4', desc: '5%/hr, cap 15000, 2% raid', effect: { interest: 0.05, raid: 0.02, cap: 15000 } },
    ],
  },
};

let buildingLevels = JSON.parse(localStorage.getItem('hrBuildingLevels') || '{"trapHouse":0,"garage":0,"clothing":0,"stashHouse":0,"vault":0}');
// Ensure new keys exist for players with old save data
if (buildingLevels.stashHouse === undefined) buildingLevels.stashHouse = 0;
if (buildingLevels.vault === undefined) buildingLevels.vault = 0;

// Vault state (separate balance)
let vaultBalance = parseFloat(localStorage.getItem('hrVaultBalance') || '0');
let vaultLastCheck = parseInt(localStorage.getItem('hrVaultLastCheck') || Date.now());

function saveBlockData() {
  localStorage.setItem('hrSavedChains', savedChains);
  localStorage.setItem('hrBuildingLevels', JSON.stringify(buildingLevels));
  localStorage.setItem('hrVaultBalance', vaultBalance);
  localStorage.setItem('hrVaultLastCheck', vaultLastCheck);
}

// --- Heat System (per-run state) ---
let heat = 0;
let lastChainFrame = 0;
let heliForcedTimer = 0;
let sniperTimer = 0;
let heatFlashTimer = 0; // for the brief red screen tint at MAX

// --- Per-run stat tracking (for contracts) ---
let runStats = { chains: 0, distNoCar: 0, framesNoUpgrade: 0, cashouts: 0, k9Kills: 0, framesNoHit: 0, cash: 0, dist: 0, usedCar: false, startWeaponTier: 0 };

// --- Daily Hit Contracts ---
const CONTRACT_POOL = [
  { id: 'chains10',  desc: 'Collect 10 chains in a single run',       goal: 10,   reward: 30,  track: 'chains' },
  { id: 'dist1500',  desc: 'Reach 1500m without using the car',        goal: 1500, reward: 50,  track: 'distNoCar' },
  { id: 'survive60', desc: 'Survive 60s with starting weapon only',    goal: 3600, reward: 40,  track: 'framesNoUpgrade' },
  { id: 'cashout3',  desc: 'Cash out 3 shops in a single run',         goal: 3,    reward: 60,  track: 'cashouts' },
  { id: 'kill5k9',   desc: 'Take down 5 K-9 units',                    goal: 5,    reward: 35,  track: 'k9Kills' },
  { id: 'nohit90',   desc: 'Take zero hits for 90s',                   goal: 5400, reward: 75,  track: 'framesNoHit' },
  { id: 'cash500',   desc: 'Collect $500 cash in one run',             goal: 500,  reward: 25,  track: 'cash' },
  { id: 'beatBest',  desc: 'Beat your best by 200m',                   goal: 0,    reward: 50,  track: 'dist', dynamicGoal: true },
];

let contractId = localStorage.getItem('hrContractId') || null;
let contractDate = localStorage.getItem('hrContractDate') || '';
let contractProgress = parseFloat(localStorage.getItem('hrContractProgress') || '0');
let contractCompleted = localStorage.getItem('hrContractCompleted') === '1';
let contractBannerTime = 0; // frames to show "CONTRACT COMPLETE" banner
let contractRunProgress = 0; // progress tracked in-run, committed on end
let contractGoalCache = 0; // cached goal value (useful for dynamic goals)

function getTodayStamp() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function getContract() {
  return CONTRACT_POOL.find(c => c.id === contractId) || null;
}

function rollDailyContract() {
  const today = getTodayStamp();
  if (contractDate === today && contractId) return; // already rolled today
  // Seed by date for deterministic per-day contract
  let seed = 0;
  for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
  const pick = CONTRACT_POOL[seed % CONTRACT_POOL.length];
  contractId = pick.id;
  contractDate = today;
  contractProgress = 0;
  contractCompleted = false;
  saveContractData();
}

function saveContractData() {
  localStorage.setItem('hrContractId', contractId || '');
  localStorage.setItem('hrContractDate', contractDate || '');
  localStorage.setItem('hrContractProgress', contractProgress);
  localStorage.setItem('hrContractCompleted', contractCompleted ? '1' : '0');
}

function getContractGoal(c) {
  if (!c) return 0;
  if (c.dynamicGoal && c.id === 'beatBest') {
    return Math.max(200, highScore * 10 + 200);
  }
  return c.goal;
}

function creditContractReward() {
  if (!contractCompleted) return 0;
  // Already credited flag tracked separately; use contractCompleted + a credited flag.
  if (localStorage.getItem('hrContractRewardDate') === contractDate) return 0;
  const c = getContract();
  if (!c) return 0;
  savedChains += c.reward;
  localStorage.setItem('hrContractRewardDate', contractDate);
  saveBlockData();
  return c.reward;
}

// --- Vault helpers ---
function vaultLevelData() {
  return BUILDINGS.vault.levels[buildingLevels.vault];
}
function vaultEffect() {
  return vaultLevelData().effect;
}
function vaultPendingInterest() {
  const eff = vaultEffect();
  if (!eff || vaultBalance <= 0) return 0;
  const now = Date.now();
  const hours = Math.min(24, (now - vaultLastCheck) / 3600000);
  if (hours <= 0) return 0;
  return vaultBalance * eff.interest * hours;
}
let vaultInterestNotice = 0; // frames to show "+X claimed" message
let vaultInterestNoticeAmt = 0;
function applyVaultInterest() {
  const pending = vaultPendingInterest();
  if (pending > 0.5) {
    const eff = vaultEffect();
    const addAmount = Math.min(pending, Math.max(0, eff.cap - vaultBalance));
    vaultBalance += addAmount;
    vaultInterestNoticeAmt = Math.floor(addAmount);
    if (vaultInterestNoticeAmt > 0) vaultInterestNotice = 300; // ~5 seconds
  }
  vaultLastCheck = Date.now();
  saveBlockData();
}

// Car hit points (for multi-hit car from garage upgrades)
let carHitsLeft = 0;

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

function goToBlock() {
  state = STATE.BLOCK;
  blockSelectedBuilding = -1;
  showScreen(null);
  document.getElementById('ui-overlay').style.display = 'none';
  document.getElementById('mobile-controls').style.display = 'none';
  stopMusic();
  stopEngineSound();
  if (buildingLevels.vault > 0) applyVaultInterest();
  rollDailyContract();
  // Center scroll on the block
  const info = getBlockWorldInfo();
  blockScrollX = Math.max(0, (info.totalWidth - canvas.width) / 2);
  blockScrollVel = 0;
  if (animFrame) cancelAnimationFrame(animFrame);
  blockLoop();
}

function doJump() {
  if (state === STATE.START) { goToBlock(); return; }
  if (state === STATE.DEAD) return;
  if (state === STATE.SHOP) return; // handled by shop click
  if (state === STATE.BLOCK) return; // handled by block click
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
  if (state === STATE.BLOCK) {
    const t = e.touches[0];
    blockTouchId = t.identifier;
    blockTouchStartX = t.clientX;
    blockTouchStartY = t.clientY;
    blockTouchStartScroll = blockScrollX;
    blockDragMoved = false;
    blockLastMoveX = t.clientX;
    blockLastMoveTime = Date.now();
    blockScrollVel = 0;
    return;
  }
  if (state === STATE.SHOP) { handleShopClick(e.touches[0].clientX, e.touches[0].clientY); return; }
  doJump();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (state === STATE.BLOCK && blockTouchId !== null) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== blockTouchId) continue;
      const dx = blockTouchStartX - t.clientX;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaledDx = dx * scaleX;
      if (Math.abs(dx) > 8) blockDragMoved = true;
      if (blockDragMoved) {
        const info = getBlockWorldInfo();
        blockScrollX = Math.max(0, Math.min(info.maxScroll, blockTouchStartScroll + scaledDx));
        const now = Date.now();
        const dt = now - blockLastMoveTime;
        if (dt > 0) blockScrollVel = (blockLastMoveX - t.clientX) * scaleX / dt * 16;
        blockLastMoveX = t.clientX;
        blockLastMoveTime = now;
      }
    }
  }
}, { passive: false });
canvas.addEventListener('touchend', e => {
  if (state === STATE.BLOCK && blockTouchId !== null) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier !== blockTouchId) continue;
      if (!blockDragMoved) {
        handleBlockClick(blockTouchStartX, blockTouchStartY);
      }
      blockTouchId = null;
    }
    return;
  }
}, { passive: false });
canvas.addEventListener('mousedown', e => {
  if (state === STATE.BLOCK) {
    blockTouchStartX = e.clientX;
    blockTouchStartY = e.clientY;
    blockTouchStartScroll = blockScrollX;
    blockDragMoved = false;
    blockLastMoveX = e.clientX;
    blockLastMoveTime = Date.now();
    blockScrollVel = 0;
    blockTouchId = 'mouse';
    return;
  }
  if (state === STATE.SHOP) { handleShopClick(e.clientX, e.clientY); return; }
  doJump();
});
canvas.addEventListener('mousemove', e => {
  if (state === STATE.BLOCK && blockTouchId === 'mouse') {
    const dx = blockTouchStartX - e.clientX;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaledDx = dx * scaleX;
    if (Math.abs(dx) > 5) blockDragMoved = true;
    if (blockDragMoved) {
      const info = getBlockWorldInfo();
      blockScrollX = Math.max(0, Math.min(info.maxScroll, blockTouchStartScroll + scaledDx));
      const now = Date.now();
      const dt = now - blockLastMoveTime;
      if (dt > 0) blockScrollVel = (blockLastMoveX - e.clientX) * scaleX / dt * 16;
      blockLastMoveX = e.clientX;
      blockLastMoveTime = now;
    }
  }
});
canvas.addEventListener('mouseup', e => {
  if (state === STATE.BLOCK && blockTouchId === 'mouse') {
    if (!blockDragMoved) {
      handleBlockClick(e.clientX, e.clientY);
    }
    blockTouchId = null;
  }
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

document.getElementById('start-btn').addEventListener('click', goToBlock);
document.getElementById('retry-btn').addEventListener('click', goToBlock);

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
  document.getElementById('ui-overlay').style.display = '';
  document.getElementById('mobile-controls').style.display = '';
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
  player.batSwing = 0;
  player.muzzleFlash = 0;
  player.carCrash = 0;
  nextShopDistance = SHOP_INTERVAL;
  chainsBought = 0;
  shopSelection = -1;
  bullets = [];
  platforms = [];

  // Heat System reset
  heat = 0;
  lastChainFrame = 0;
  heliForcedTimer = 0;
  sniperTimer = 0;
  heatFlashTimer = 0;

  // Per-run contract tracking (startWeaponTier captured after applying bonuses below)
  rollDailyContract();
  contractRunProgress = 0;
  runStats = { chains: 0, distNoCar: 0, framesNoUpgrade: 0, cashouts: 0, k9Kills: 0, framesNoHit: 0, cash: 0, dist: 0, usedCar: false, startWeaponTier: 0 };

  // Apply building bonuses from the block
  // Trap House: starting weapon
  const trapLvl = buildingLevels.trapHouse;
  const trapEffect = BUILDINGS.trapHouse.levels[trapLvl].effect;
  player.weaponTier = trapEffect ? trapEffect.weaponTier : 0;
  player.batCooldown = 0;
  player.gunTimer = player.weaponTier >= 2 ? 60 : 0;

  // Garage: starting car shield
  const garageLvl = buildingLevels.garage;
  const garageEffect = BUILDINGS.garage.levels[garageLvl].effect;
  if (garageEffect) {
    player.hasShield = true;
    carHitsLeft = garageEffect.carHits;
    runStats.usedCar = true;
    startEngineSound();
  } else {
    player.hasShield = false;
    carHitsLeft = 0;
    stopEngineSound();
  }

  // Capture starting weapon tier for "survive with starting weapon" contract
  runStats.startWeaponTier = player.weaponTier;

  // Clothing: outfit colors
  const clothLvl = buildingLevels.clothing;
  const clothEffect = BUILDINGS.clothing.levels[clothLvl].effect;
  if (clothEffect) {
    player.shirtColor = clothEffect.shirt;
    player.pantsColor = clothEffect.pants;
    player.sneakerColor = clothEffect.sneakers;
  } else {
    player.shirtColor = '#ff4444';
    player.pantsColor = '#1a1a2e';
    player.sneakerColor = '#fff';
  }

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
  // Heat tightens spawn gap (+30% density at Scorching)
  const heatGapMult = heat >= 76 ? 0.77 : heat >= 51 ? 0.9 : 1.0;
  const gap = Math.max(55, 90 - frameCount * 0.01) * heatGapMult;

  if (spawnTimer > gap) {
    spawnTimer = 0;
    const r = Math.random();
    // Heat shifts thresholds: warm bumps cop, hot unlocks K-9 early
    const copTop = heat >= 26 ? 0.78 : 0.75;
    const swatGate = heat >= 51 ? 400 : 500;
    const k9Gate = heat >= 26 ? 400 : 600;
    if (r < 0.35) {
      spawnCash(canvas.width + 20, gY - 30 - Math.random() * 120);
    } else if (r < 0.55) {
      spawnChain(canvas.width + 20, gY - 40 - Math.random() * 100);
    } else if (r < copTop) {
      spawnCop(canvas.width + 20);
    } else if (r < copTop + 0.07 && frameCount > swatGate) {
      spawnSwat(canvas.width + 20);
    } else if (r < copTop + 0.13 && frameCount > 400) {
      spawnHelicopter(canvas.width + 20);
    } else if (r < copTop + 0.18 && frameCount > k9Gate) {
      spawnK9(canvas.width + 20);
    } else {
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

// --- Heat helpers ---
function heatChainMultiplier() {
  if (heat >= 100) return 2.0;
  if (heat >= 76) return 1.75;
  if (heat >= 51) return 1.5;
  if (heat >= 26) return 1.25;
  return 1.0;
}
function heatTierLabel() {
  if (heat >= 100) return 'MAX HEAT';
  if (heat >= 76) return 'SCORCHING';
  if (heat >= 51) return 'HOT';
  if (heat >= 26) return 'WARM';
  return 'COOL';
}
function heatTierColor() {
  if (heat >= 100) return '#ff00ff';
  if (heat >= 76) return '#ff0000';
  if (heat >= 51) return '#ff6600';
  if (heat >= 26) return '#ffcc00';
  return '#00e676';
}

// --- Sniper shot (Scorching heat) ---
let sniperWarning = null;
function spawnSniperShot() {
  // Simple red tracer from right-edge at player's current y, moves fast.
  // Gives a brief laser-sight warning, then the projectile.
  const targetY = player.y + player.h / 2;
  sniperWarning = { y: targetY, life: 45 };
  setTimeout(() => {
    if (state !== STATE.PLAYING) return;
    bullets.push({
      x: canvas.width + 10,
      y: targetY,
      vx: -22, vy: 0,
      sniper: true,
      life: 60,
    });
  }, 700);
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

  // --- Heat decay ---
  // Drops by 1 per second if no chain in last 3s.
  if (heat > 0 && frameCount - lastChainFrame > 180) {
    heat = Math.max(0, heat - 1 / 60);
  }
  if (heatFlashTimer > 0) heatFlashTimer--;

  // --- Heat-driven forced spawns ---
  if (heat >= 51) {
    // Hot: force helicopter every 15-20s (900-1200f)
    heliForcedTimer++;
    const heliInterval = heat >= 76 ? 900 : 1100;
    if (heliForcedTimer > heliInterval) {
      heliForcedTimer = 0;
      spawnHelicopter(canvas.width + 20);
    }
  } else {
    heliForcedTimer = 0;
  }
  if (heat >= 76) {
    // Scorching: sniper every 12s
    sniperTimer++;
    if (sniperTimer > 720) {
      sniperTimer = 0;
      spawnSniperShot();
    }
  } else {
    sniperTimer = 0;
  }

  // --- Contract run-tracking (per-frame) ---
  if (!runStats.usedCar) runStats.distNoCar = distance;
  if (player.weaponTier <= runStats.startWeaponTier) runStats.framesNoUpgrade++;
  if (player.invincible === 0) {
    runStats.framesNoHit++;
    if (runStats.framesNoHit > (runStats.maxFramesNoHit || 0)) runStats.maxFramesNoHit = runStats.framesNoHit;
  } else {
    runStats.framesNoHit = 0;
  }
  runStats.dist = distance;

  // Mid-run contract completion check (every 30 frames)
  if (!contractCompleted && frameCount % 30 === 0) {
    checkContractMidRun();
  }

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

  // Move bullets (tracers only for player guns; sniper bullets can hit)
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += (bullets[i].vx || 12);
    bullets[i].y += (bullets[i].vy || 0);
    // Sniper bullet hits player
    if (bullets[i].sniper && player.invincible === 0 && !player.dead) {
      const pb = { x: player.x + 10, y: player.y + 10, w: player.w - 20, h: player.h - 16 };
      if (bullets[i].x >= pb.x && bullets[i].x <= pb.x + pb.w && bullets[i].y >= pb.y && bullets[i].y <= pb.y + pb.h) {
        // Shield absorbs, otherwise kill
        if (player.hasShield) {
          carHitsLeft--;
          player.invincible = 30;
          spawnHitParticles(bullets[i].x, bullets[i].y);
          bullets.splice(i, 1);
          if (carHitsLeft <= 0) {
            player.hasShield = false;
            stopEngineSound();
            player.carCrash = 25;
          }
          continue;
        }
        bullets.splice(i, 1);
        player.dead = true;
        killPlayer();
        continue;
      }
    }
    if (bullets[i] && (bullets[i].x > canvas.width + 20 || bullets[i].x < -20 || bullets[i].y < -20 || bullets[i].y > canvas.height + 20)) {
      bullets.splice(i, 1);
    }
  }
  if (sniperWarning) {
    sniperWarning.life--;
    if (sniperWarning.life <= 0) sniperWarning = null;
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
      if (c.type === 'cash') {
        cashCollected += 100; score += 100; player.bling = Math.min(player.bling + 1, 5);
        runStats.cash += 100;
      } else {
        // Heat-based chain multiplier (probabilistic extra)
        const mult = heatChainMultiplier();
        const baseGain = Math.floor(mult);
        const extraGain = (Math.random() < (mult - baseGain)) ? 1 : 0;
        const chainsGained = Math.max(1, baseGain + extraGain);
        chainsCollected += chainsGained;
        score += 500 * chainsGained;
        player.bling = Math.min(player.bling + 2, 5);
        player.chainsWorn++;
        runStats.chains++;
        // Heat +8 per chain, capped at 100
        heat = Math.min(100, heat + 8);
        lastChainFrame = frameCount;
        if (heat >= 100 && heatFlashTimer <= 0) heatFlashTimer = 30;
      }
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
          if (o.type === 'k9') runStats.k9Kills++;
          obstacles.splice(oi, 1);
          score += 200;
          playBatCrack();
          updateScoreUI();
          continue;
        }
        // Car shield absorbs hits (multi-hit from garage upgrades)
        if (player.hasShield) {
          carHitsLeft--;
          spawnHitParticles(o.x + o.w / 2, o.y + o.h / 2);
          obstacles.splice(oi, 1);
          player.invincible = 30;
          if (carHitsLeft <= 0) {
            // Car destroyed
            player.hasShield = false;
            stopEngineSound();
            player.carCrash = 25;
            // Big car-breaking particle explosion
            for (let pi = 0; pi < 20; pi++) {
              const colors = ['#ff2222', '#cc0000', '#ff6600', '#ffaa00', '#880000', '#444'];
              particles.push({ x: player.x + player.w / 2 + (Math.random() - 0.5) * 30, y: player.y + player.h / 2,
                vx: (Math.random() - 0.5) * 12, vy: -3 - Math.random() * 7,
                alpha: 1, size: 4 + Math.random() * 8, color: colors[Math.floor(Math.random() * colors.length)], life: 50 });
            }
            for (let pi = 0; pi < 8; pi++) {
              particles.push({ x: player.x + player.w / 2, y: player.y + player.h * 0.3,
                vx: (Math.random() - 0.5) * 10, vy: -2 - Math.random() * 4,
                alpha: 0.8, size: 2 + Math.random() * 3, color: '#aaddff', life: 35 });
            }
            playCarCrash();
          } else {
            // Car takes a hit but keeps going - small impact effect
            for (let pi = 0; pi < 6; pi++) {
              particles.push({ x: player.x + player.w / 2, y: player.y + player.h / 2,
                vx: (Math.random() - 0.5) * 8, vy: -2 - Math.random() * 4,
                alpha: 1, size: 3 + Math.random() * 4, color: '#ff6600', life: 25 });
            }
            playCarCrash();
          }
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
      if (tgt.type === 'k9') runStats.k9Kills++;
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
  { name: 'BAT', desc: 'Auto-swings at cops & K-9s\nevery 20s on contact', price: 500 },
  { name: 'PISTOL', desc: 'Auto-fires at the nearest\nenemy every 15 seconds', price: 1200 },
  { name: 'PISTOL+', desc: 'Faster pistol - shoots\nevery 10 seconds', price: 2500 },
  { name: 'UZI', desc: '3-round burst every 5s\nNever miss a target', price: 5000 },
];

function getShopLayout() {
  const w = canvas.width, h = canvas.height;
  const cardW = Math.min(160, w * 0.30);
  const cardH = cardW * 1.55;
  const gap = Math.min(14, w * 0.025);
  const totalW = cardW * 3 + gap * 2;
  const startX = (w - totalW) / 2;
  const startY = h * 0.29;
  const btnW = Math.min(200, w * 0.44);
  const btnH = 44;
  const btnGap = Math.min(12, w * 0.03);
  const totalBtnW = btnW * 2 + btnGap;
  const btnStartX = (w - totalBtnW) / 2;
  const btnY = startY + cardH + 24;

  const cards = [];
  for (let i = 0; i < 3; i++) {
    cards.push({
      x: startX + i * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
    });
  }
  return {
    cards,
    btn: { x: btnStartX, y: btnY, w: btnW, h: btnH },
    cashOutBtn: { x: btnStartX + btnW + btnGap, y: btnY, w: btnW, h: btnH },
  };
}

function getShopCardData() {
  // Card 0: Next weapon upgrade
  const nextTier = player.weaponTier + 1;
  const maxedWeapon = nextTier > 4;
  const wData = maxedWeapon ? null : WEAPON_TIERS[nextTier];
  // Card 1: Car shield
  // Card 2: Chain
  return [
    { name: maxedWeapon ? 'MAXED' : wData.name, desc: maxedWeapon ? 'All weapons unlocked!' : wData.desc,
      price: maxedWeapon ? 0 : wData.price, owned: maxedWeapon, type: 'weapon', tier: nextTier },
    { name: 'CAR', desc: 'Drive a sports car that\nprotects you from 1 hit', price: 1000, owned: player.hasShield, type: 'car' },
    { name: 'CHAIN', desc: 'Buy a gold chain\nCash out at shops to keep!', price: 300, owned: false, type: 'chain' },
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

  // Cash balance + chains info
  ctx.fillStyle = '#00e676';
  ctx.font = 'bold ' + Math.min(18, w * 0.045) + 'px Arial';
  const totalRunChains = chainsCollected + chainsBought;
  ctx.fillText('💵 $' + cashCollected + '   ⛓️ ' + totalRunChains + ' chains', w / 2, h * 0.22);
  ctx.fillStyle = '#888';
  ctx.font = Math.min(11, w * 0.028) + 'px Arial';
  ctx.fillText('Cash out to save chains to your block!', w / 2, h * 0.26);

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
    const iconCy = card.y + card.h * 0.26;
    const iconSize = card.w * 0.42;
    ctx.save();
    if (i === 0) drawWeaponIcon(iconCx, iconCy, iconSize, canAfford || item.owned, item.tier);
    else if (i === 1) drawCarIcon(iconCx, iconCy, iconSize, canAfford || item.owned);
    else drawChainIcon(iconCx, iconCy, iconSize, canAfford);
    ctx.restore();

    // Name
    ctx.fillStyle = (canAfford || item.owned) ? '#fff' : '#666';
    ctx.font = 'bold ' + Math.min(18, card.w * 0.14) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, iconCx, card.y + card.h * 0.54);

    // Description (multi-line)
    ctx.fillStyle = (canAfford || item.owned) ? '#bbb' : '#555';
    const descFont = Math.min(13, card.w * 0.095);
    ctx.font = descFont + 'px Arial';
    const descLines = item.desc.split('\n');
    for (let dl = 0; dl < descLines.length; dl++) {
      ctx.fillText(descLines[dl], iconCx, card.y + card.h * 0.64 + dl * (descFont + 3));
    }

    // Price / status
    if (item.owned) {
      ctx.fillStyle = '#00e676';
      ctx.font = 'bold ' + Math.min(19, card.w * 0.15) + 'px Arial';
      ctx.fillText(item.type === 'weapon' ? 'MAX' : 'OWNED', iconCx, card.y + card.h * 0.9);
    } else {
      ctx.fillStyle = canAfford ? '#ffd700' : '#666';
      ctx.font = 'bold ' + Math.min(19, card.w * 0.15) + 'px Arial';
      ctx.fillText('$' + item.price, iconCx, card.y + card.h * 0.9);
    }
  }

  // Continue button
  const btn = layout.btn;
  const btnGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x + btn.w, btn.y);
  btnGrad.addColorStop(0, '#ffd700');
  btnGrad.addColorStop(1, '#ff8c00');
  ctx.fillStyle = btnGrad;
  ctx.beginPath();
  ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 20);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = 'bold ' + Math.min(16, w * 0.04) + 'px Arial Black, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('KEEP RUNNING', btn.x + btn.w / 2, btn.y + btn.h / 2);

  // Cash Out button
  const coBtn = layout.cashOutBtn;
  const coGrad = ctx.createLinearGradient(coBtn.x, coBtn.y, coBtn.x + coBtn.w, coBtn.y);
  coGrad.addColorStop(0, '#00e676');
  coGrad.addColorStop(1, '#00c853');
  ctx.fillStyle = coGrad;
  ctx.beginPath();
  ctx.roundRect(coBtn.x, coBtn.y, coBtn.w, coBtn.h, 20);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = 'bold ' + Math.min(16, w * 0.04) + 'px Arial Black, Impact, sans-serif';
  ctx.fillText('CASH OUT (' + totalRunChains + ')', coBtn.x + coBtn.w / 2, coBtn.y + coBtn.h / 2);
  ctx.textBaseline = 'alphabetic';

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

  // Check CASH OUT button - save chains and go back to block
  const coBtn = layout.cashOutBtn;
  if (cx >= coBtn.x && cx <= coBtn.x + coBtn.w && cy >= coBtn.y && cy <= coBtn.y + coBtn.h) {
    const totalRunChains = chainsCollected + chainsBought;
    savedChains += totalRunChains;
    runStats.cashouts++;
    heat = 0; // cashing out wipes heat
    finalizeContractOnRunEnd();
    saveBlockData();
    goToBlock();
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
    // Car - one hit shield (shop car is always 1 hit)
    player.hasShield = true;
    carHitsLeft = Math.max(carHitsLeft, 1); // don't downgrade if garage gives more
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
  stopEngineSound();

  const totalChains = chainsCollected + chainsBought;
  const isNewHigh = totalChains > highScore;
  if (isNewHigh) { highScore = totalChains; localStorage.setItem('hoodRunnerHS', highScore); }

  // --- Stash House: auto-save % of run chains on death ---
  const stashLvl = buildingLevels.stashHouse;
  const stashEffect = BUILDINGS.stashHouse.levels[stashLvl].effect;
  let stashSaved = 0;
  if (stashEffect && totalChains > 0) {
    stashSaved = Math.floor(totalChains * stashEffect.stashPct);
    savedChains += stashSaved;
  }

  // --- Vault: cops raid % of balance on death ---
  let vaultRaided = 0;
  const vEff = vaultEffect();
  if (vEff && vaultBalance > 0) {
    vaultRaided = Math.floor(vaultBalance * vEff.raid);
    vaultBalance = Math.max(0, vaultBalance - vaultRaided);
  }

  // --- Finalize run stats and check contract ---
  finalizeContractOnRunEnd();
  saveBlockData();

  lastDeathInfo = { stashSaved, vaultRaided, totalChainsLost: totalChains - stashSaved };
  setTimeout(() => showGameOver(isNewHigh), 600);
}

let lastDeathInfo = { stashSaved: 0, vaultRaided: 0, totalChainsLost: 0 };

function showGameOver(newHigh) {
  const totalChains = chainsCollected + chainsBought;
  document.getElementById('final-cash').textContent = '$' + cashCollected;
  const lostTxt = lastDeathInfo.stashSaved > 0
    ? (lastDeathInfo.totalChainsLost + ' lost / ' + lastDeathInfo.stashSaved + ' stashed')
    : (totalChains + ' LOST');
  document.getElementById('final-chains').textContent = lostTxt;
  document.getElementById('final-distance').textContent = distance + 'm';
  document.getElementById('final-score').textContent = savedChains + ' chains saved';
  let msg = newHigh ? '🏆 NEW RUN RECORD!' : 'Cash out at shops to keep chains!';
  if (lastDeathInfo.vaultRaided > 0) msg += '  🚔 Cops raided ' + lastDeathInfo.vaultRaided + ' from Vault!';
  document.getElementById('high-score-msg').textContent = msg;
  document.getElementById('high-score-display').textContent = 'Best: ' + highScore + ' chains';
  showScreen('game-over-screen');
}

function checkContractMidRun() {
  const c = getContract();
  if (!c || contractCompleted) return;
  let progress = 0;
  switch (c.track) {
    case 'chains': progress = runStats.chains; break;
    case 'distNoCar': progress = runStats.usedCar ? 0 : runStats.dist; break;
    case 'framesNoUpgrade': progress = runStats.framesNoUpgrade; break;
    case 'cashouts': progress = runStats.cashouts; break;
    case 'k9Kills': progress = runStats.k9Kills; break;
    case 'framesNoHit': progress = runStats.maxFramesNoHit || 0; break;
    case 'cash': progress = runStats.cash; break;
    case 'dist': progress = runStats.dist; break;
  }
  const goal = getContractGoal(c);
  if (progress >= goal) {
    contractCompleted = true;
    contractBannerTime = 180;
    contractProgress = progress;
    creditContractReward();
    saveContractData();
    try { playShopSound(); } catch (e) {}
  }
}

// Evaluate contract progress based on runStats and mark complete if goal reached.
function finalizeContractOnRunEnd() {
  const c = getContract();
  if (!c || contractCompleted) return;
  let progress = 0;
  switch (c.track) {
    case 'chains': progress = runStats.chains; break;
    case 'distNoCar': progress = runStats.usedCar ? 0 : runStats.dist; break;
    case 'framesNoUpgrade': progress = runStats.framesNoUpgrade; break;
    case 'cashouts': progress = runStats.cashouts; break;
    case 'k9Kills': progress = runStats.k9Kills; break;
    case 'framesNoHit': progress = runStats.maxFramesNoHit || 0; break;
    case 'cash': progress = runStats.cash; break;
    case 'dist': progress = runStats.dist; break;
  }
  if (progress > contractProgress) contractProgress = progress;
  const goal = getContractGoal(c);
  if (progress >= goal && !contractCompleted) {
    contractCompleted = true;
    contractBannerTime = 180;
    creditContractReward();
  }
  saveContractData();
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

  // Scale car up so it's bigger than cops
  const carScale = 1.9;
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
  // Sniper warning laser
  if (sniperWarning) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(frameCount * 0.5));
    ctx.strokeStyle = '#ff0040';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(canvas.width, sniperWarning.y);
    ctx.lineTo(0, sniperWarning.y);
    ctx.stroke();
    ctx.restore();
  }
  for (const b of bullets) {
    ctx.save();
    if (b.sniper) {
      // Red sniper tracer
      ctx.fillStyle = '#ff0030';
      ctx.shadowColor = '#ff2255';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ff4466';
      ctx.fillRect(b.x, b.y - 1, 22, 2);
    } else {
      ctx.fillStyle = '#ffdd44';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(b.x + (b.w || 6) / 2, b.y + (b.h || 6) / 2, (b.w || 6) / 2, (b.h || 6) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tracer trail
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.ellipse(b.x - 4, b.y + (b.h || 6) / 2, 4, (b.h || 6) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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

// --- Block / Home Screen ---
let blockFrameCount = 0;

function getBlockWorldInfo() {
  const w = canvas.width, h = canvas.height;
  const keys = ['trapHouse', 'garage', 'clothing', 'stashHouse', 'vault'];
  const bldgW = Math.max(100, Math.min(140, w * 0.32));
  const gap = Math.max(24, bldgW * 0.22);
  const padding = Math.max(30, w * 0.08);
  const totalWidth = padding * 2 + keys.length * bldgW + (keys.length - 1) * gap;
  const maxScroll = Math.max(0, totalWidth - w);
  return { keys, bldgW, gap, padding, totalWidth, maxScroll };
}

function getBlockLayout() {
  const w = canvas.width, h = canvas.height;
  const streetY = h * 0.72;
  const info = getBlockWorldInfo();
  const { keys, bldgW, gap, padding } = info;

  const baseHeights = [0.30, 0.22, 0.28, 0.24, 0.26];
  const buildings = [];
  for (let i = 0; i < keys.length; i++) {
    const lvl = buildingLevels[keys[i]] || 0;
    const growFactor = 0.04 * lvl;
    const bH = Math.floor(h * (baseHeights[i] + growFactor));
    const worldX = padding + i * (bldgW + gap);
    buildings.push({
      x: worldX - blockScrollX,
      y: streetY - bH,
      w: bldgW,
      h: bH,
      key: keys[i],
      worldX: worldX,
    });
  }

  const btnW = Math.min(220, w * 0.55);
  const btnH = 48;
  const btnX = (w - btnW) / 2;
  const btnY = h - btnH - 20;

  return { buildings, streetY, btn: { x: btnX, y: btnY, w: btnW, h: btnH }, count: keys.length, totalWidth: info.totalWidth, maxScroll: info.maxScroll };
}

function drawDailyContract(w, y) {
  rollDailyContract();
  const c = getContract();
  if (!c) return;
  const goal = getContractGoal(c);
  const done = contractCompleted;
  const barW = Math.min(300, w * 0.82);
  const barH = 38;
  const barX = (w - barW) / 2;
  const barY = y;
  ctx.save();
  ctx.fillStyle = done ? 'rgba(0,230,118,0.15)' : 'rgba(255,215,0,0.1)';
  ctx.strokeStyle = done ? '#00e676' : '#ffd700';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = done ? '#00e676' : '#ffd700';
  ctx.font = 'bold ' + Math.min(10, w * 0.028) + 'px Arial';
  ctx.textAlign = 'left';
  ctx.fillText((done ? '✓ CONTRACT COMPLETE' : 'DAILY CONTRACT') + '  •  +' + c.reward + ' ⛓️', barX + 8, barY + 13);

  ctx.fillStyle = '#ddd';
  ctx.font = Math.min(11, w * 0.028) + 'px Arial';
  ctx.fillText(c.desc, barX + 8, barY + 28);

  // Progress dot
  if (!done && goal > 0) {
    const pct = Math.min(1, (contractProgress || 0) / goal);
    ctx.fillStyle = 'rgba(255,215,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(barX, barY + barH - 3, barW * pct, 3, 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBlock() {
  const w = canvas.width, h = canvas.height;
  blockFrameCount++;

  // Night sky gradient (fixed)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  skyGrad.addColorStop(0, '#050510');
  skyGrad.addColorStop(0.6, '#141430');
  skyGrad.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Stars (fixed, parallax-light)
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 35; i++) {
    const sx = ((i * 137.5 + 50) - blockScrollX * 0.02) % w;
    const sy = (i * 89.3 + 10) % (h * 0.28);
    const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(blockFrameCount * 0.02 + i));
    ctx.globalAlpha = twinkle * 0.7;
    ctx.beginPath();
    ctx.arc(sx < 0 ? sx + w : sx, sy, 1 + (i % 3 === 0 ? 1 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Moon (fixed)
  const moonX = w * 0.82;
  const moonY = h * 0.08;
  ctx.fillStyle = '#e8e4d4';
  ctx.beginPath();
  ctx.arc(moonX, moonY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#050510';
  ctx.beginPath();
  ctx.arc(moonX + 5, moonY - 3, 12, 0, Math.PI * 2);
  ctx.fill();

  const layout = getBlockLayout();

  // Background skyline (slow parallax)
  drawBlockSkyline(w, h, layout.streetY);

  // Street + sidewalk (scrolls with buildings)
  const drawLeft = -blockScrollX;
  const drawWidth = layout.totalWidth;

  // Street surface
  ctx.fillStyle = '#222';
  ctx.fillRect(drawLeft, layout.streetY, drawWidth, h - layout.streetY);
  // Curb
  ctx.fillStyle = '#666';
  ctx.fillRect(drawLeft, layout.streetY - 4, drawWidth, 4);
  // Sidewalk
  ctx.fillStyle = '#444';
  ctx.fillRect(drawLeft, layout.streetY - 18, drawWidth, 14);
  // Sidewalk cracks
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.5;
  for (let sx = drawLeft; sx < drawLeft + drawWidth; sx += 60) {
    if (sx + 60 < 0 || sx > w) continue;
    ctx.beginPath();
    ctx.moveTo(sx, layout.streetY - 18);
    ctx.lineTo(sx, layout.streetY - 4);
    ctx.stroke();
  }
  // Road markings
  ctx.strokeStyle = 'rgba(255,215,0,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 14]);
  const roadCenterY = layout.streetY + (h - layout.streetY) * 0.55;
  ctx.beginPath();
  ctx.moveTo(0, roadCenterY);
  ctx.lineTo(w, roadCenterY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Street lamps between buildings
  for (let i = 0; i < layout.count - 1; i++) {
    const b1 = layout.buildings[i];
    const b2 = layout.buildings[i + 1];
    const lampX = b1.x + b1.w + (b2.x - b1.x - b1.w) / 2;
    if (lampX < -20 || lampX > w + 20) continue;
    // Pole
    ctx.fillStyle = '#555';
    ctx.fillRect(lampX - 1.5, layout.streetY - 70, 3, 52);
    // Lamp head
    ctx.fillStyle = '#777';
    ctx.fillRect(lampX - 6, layout.streetY - 72, 12, 4);
    // Light glow
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.03 * Math.sin(blockFrameCount * 0.04 + i);
    const lampGlow = ctx.createRadialGradient(lampX, layout.streetY - 68, 2, lampX, layout.streetY - 50, 45);
    lampGlow.addColorStop(0, '#ffd700');
    lampGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = lampGlow;
    ctx.fillRect(lampX - 45, layout.streetY - 80, 90, 60);
    ctx.restore();
    // Light bulb
    ctx.fillStyle = '#ffd700';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(lampX, layout.streetY - 68, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Draw each themed building (positions already include scroll offset)
  for (let i = 0; i < layout.count; i++) {
    const b = layout.buildings[i];
    if (b.x + b.w < -20 || b.x > w + 20) continue;
    const key = b.key;
    const lvl = buildingLevels[key] || 0;
    const maxLvl = BUILDINGS[key].levels.length - 1;
    const selected = blockSelectedBuilding === i;

    if (key === 'trapHouse') drawTrapHouse(b, lvl, selected, layout.streetY);
    else if (key === 'garage') drawChopShop(b, lvl, selected, layout.streetY);
    else if (key === 'clothing') drawNightclub(b, lvl, selected, layout.streetY);
    else if (key === 'stashHouse') drawStashHouse(b, lvl, selected, layout.streetY);
    else if (key === 'vault') drawVaultBuilding(b, lvl, selected, layout.streetY);

    // Building name above
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.min(11, b.w * 0.1) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(BUILDINGS[key].blockName || BUILDINGS[key].name, b.x + b.w / 2, b.y - 16);

    // Level indicator
    ctx.fillStyle = lvl >= maxLvl ? '#ffd700' : '#aaa';
    ctx.font = Math.min(9, b.w * 0.08) + 'px Arial';
    ctx.fillText(lvl >= maxLvl ? 'MAXED' : BUILDINGS[key].levels[lvl].label, b.x + b.w / 2, b.y - 5);

    // Vault glow if interest is pending
    if (key === 'vault' && vaultPendingInterest() > 0.5) {
      ctx.save();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 12 + 6 * Math.abs(Math.sin(blockFrameCount * 0.08));
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      ctx.restore();
    }
  }

  // Player (fixed center of screen, on sidewalk)
  const pX = w / 2 - 19;
  const pY = layout.streetY - 68;
  drawBlockPlayer(pX, pY);

  // --- Fixed HUD overlay (doesn't scroll) ---

  // Top gradient overlay for HUD
  const hudGrad = ctx.createLinearGradient(0, 0, 0, 100);
  hudGrad.addColorStop(0, 'rgba(5,5,16,0.85)');
  hudGrad.addColorStop(1, 'rgba(5,5,16,0)');
  ctx.fillStyle = hudGrad;
  ctx.fillRect(0, 0, w, 100);

  // Title
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.min(20, w * 0.05) + 'px Arial Black, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 10;
  ctx.fillText('YOUR BLOCK', w / 2, 24);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + Math.min(14, w * 0.036) + 'px Arial';
  ctx.fillText('⛓️ ' + savedChains + ' chains', w / 2, 44);

  // Daily contract banner
  drawDailyContract(w, 56);

  // Vault interest claimed notice
  if (vaultInterestNotice > 0) {
    vaultInterestNotice--;
    const alpha = Math.min(1, vaultInterestNotice / 60);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold ' + Math.min(13, w * 0.034) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;
    ctx.fillText('💰 Vault earned +' + vaultInterestNoticeAmt + ' chains while you were away', w / 2, 106);
    ctx.restore();
  }

  // Scroll indicator dots
  if (layout.maxScroll > 0) {
    const dotCount = layout.count;
    const dotGap = 12;
    const dotTotalW = dotCount * dotGap;
    const dotBaseX = (w - dotTotalW) / 2 + 6;
    const dotY = layout.streetY + 14;
    const scrollPct = layout.maxScroll > 0 ? blockScrollX / layout.maxScroll : 0;
    for (let i = 0; i < dotCount; i++) {
      const nearPct = i / Math.max(1, dotCount - 1);
      const dist = Math.abs(scrollPct - nearPct);
      ctx.fillStyle = dist < 0.2 ? '#ffd700' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(dotBaseX + i * dotGap, dotY, dist < 0.2 ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Upgrade / vault panel (fixed overlay)
  if (blockSelectedBuilding >= 0) {
    const sel = layout.buildings[blockSelectedBuilding];
    if (sel.key === 'vault') drawVaultPanel(layout);
    else drawUpgradePanel(layout);
  }

  // START RUN button (fixed bottom)
  if (blockSelectedBuilding < 0) {
    const btn = layout.btn;
    // Button shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(btn.x + 2, btn.y + 3, btn.w, btn.h, 24);
    ctx.fill();
    const btnGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x + btn.w, btn.y);
    btnGrad.addColorStop(0, '#00e676');
    btnGrad.addColorStop(1, '#00c853');
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 24);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold ' + Math.min(20, w * 0.05) + 'px Arial Black, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('START RUN', btn.x + btn.w / 2, btn.y + btn.h / 2 + 7);
  }

  // Swipe hint on first visit
  if (blockFrameCount < 180 && blockFrameCount % 60 < 40) {
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - blockFrameCount / 180);
    ctx.fillStyle = '#fff';
    ctx.font = Math.min(12, w * 0.03) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('← SWIPE TO EXPLORE →', w / 2, layout.streetY + 32);
    ctx.restore();
  }
}

function drawBlockSkyline(w, h, streetY) {
  // Background buildings (slow parallax)
  const parallax = blockScrollX * 0.15;
  ctx.fillStyle = '#0c0c1e';
  const bgBuildings = [
    { x: 20, w: 60, h: 120 }, { x: 100, w: 45, h: 90 }, { x: 160, w: 70, h: 150 },
    { x: 250, w: 55, h: 110 }, { x: 330, w: 80, h: 140 }, { x: 430, w: 50, h: 100 },
    { x: 500, w: 65, h: 130 }, { x: 580, w: 40, h: 85 }, { x: 640, w: 75, h: 145 },
  ];
  for (const bg of bgBuildings) {
    const bx = bg.x - parallax % 700;
    const bx2 = bx < -bg.w ? bx + 700 : bx;
    const by = streetY - 30 - bg.h;
    ctx.fillRect(bx2, by, bg.w, bg.h + 30);
    // Dim lit windows
    ctx.fillStyle = 'rgba(255,200,100,0.08)';
    for (let wy = by + 10; wy < by + bg.h; wy += 18) {
      for (let wx = bx2 + 6; wx < bx2 + bg.w - 6; wx += 14) {
        if ((wx * 7 + wy * 3) % 5 < 2) ctx.fillRect(wx, wy, 6, 8);
      }
    }
    ctx.fillStyle = '#0c0c1e';
  }
}

// --- Themed building drawings ---

function drawTrapHouse(b, lvl, selected, streetY) {
  // Rundown house look: boarded windows, graffiti, dim lights
  const bGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  bGrad.addColorStop(0, '#4a2020');
  bGrad.addColorStop(0.5, '#5c2828');
  bGrad.addColorStop(1, '#3a1818');
  ctx.fillStyle = bGrad;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, [4, 4, 0, 0]);
  ctx.fill();

  // Roof overhang
  ctx.fillStyle = '#2a1010';
  ctx.beginPath();
  ctx.moveTo(b.x - 4, b.y);
  ctx.lineTo(b.x + b.w / 2, b.y - 12);
  ctx.lineTo(b.x + b.w + 4, b.y);
  ctx.closePath();
  ctx.fill();

  // Selection glow
  if (selected) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4, [6, 6, 0, 0]);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Boarded/cracked windows - some lit based on level
  const rows = Math.max(1, Math.floor(b.h / 32));
  const cols = Math.max(1, Math.floor(b.w / 28));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = b.x + 8 + c * 28;
      const wy = b.y + 18 + r * 32;
      if (wy + 16 > streetY - 25) continue;
      const lit = (r * cols + c) < lvl * 2;
      // Window
      ctx.fillStyle = lit ? 'rgba(255,180,50,0.6)' : 'rgba(20,15,15,0.8)';
      ctx.fillRect(wx, wy, 16, 16);
      // Boards on unlit windows
      if (!lit) {
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wx, wy + 5); ctx.lineTo(wx + 16, wy + 5);
        ctx.moveTo(wx, wy + 11); ctx.lineTo(wx + 16, wy + 11);
        ctx.stroke();
      }
    }
  }

  // Door - heavy, dark
  const doorW = Math.min(24, b.w * 0.28);
  const doorH = 32;
  const doorX = b.x + (b.w - doorW) / 2;
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(doorX, streetY - doorH, doorW, doorH);
  ctx.fillStyle = '#3a1a1a';
  ctx.fillRect(doorX + 2, streetY - doorH + 2, doorW - 4, doorH - 2);
  // Door knob
  ctx.fillStyle = '#aa8844';
  ctx.beginPath();
  ctx.arc(doorX + doorW - 6, streetY - doorH / 2, 2, 0, Math.PI * 2);
  ctx.fill();

  // Graffiti tag (small "$" or scribble)
  ctx.fillStyle = 'rgba(255,50,50,0.4)';
  ctx.font = 'bold ' + Math.min(14, b.w * 0.14) + 'px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('$$$', b.x + 4, streetY - doorH - 8);

  // Smoke/steam if upgraded
  if (lvl >= 2) {
    ctx.globalAlpha = 0.15 + 0.1 * Math.sin(blockFrameCount * 0.05);
    ctx.fillStyle = '#888';
    for (let s = 0; s < 3; s++) {
      const sx = b.x + b.w * 0.3 + s * 12;
      const sy = b.y - 8 - Math.sin(blockFrameCount * 0.03 + s) * 6;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + s * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawChopShop(b, lvl, selected, streetY) {
  // Garage/warehouse look: big roll-up door, tools, car parts
  const bGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  bGrad.addColorStop(0, '#2a3a4a');
  bGrad.addColorStop(0.5, '#1a2a3a');
  bGrad.addColorStop(1, '#0a1a2a');
  ctx.fillStyle = bGrad;
  ctx.fillRect(b.x, b.y, b.w, b.h);

  // Flat industrial roof
  ctx.fillStyle = '#1a2530';
  ctx.fillRect(b.x - 2, b.y, b.w + 4, 6);

  if (selected) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.rect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Big garage roll-up door
  const gDoorW = b.w * 0.7;
  const gDoorH = Math.min(b.h * 0.6, 50);
  const gDoorX = b.x + (b.w - gDoorW) / 2;
  const gDoorY = streetY - gDoorH;
  ctx.fillStyle = '#3a4a5a';
  ctx.fillRect(gDoorX, gDoorY, gDoorW, gDoorH);
  // Horizontal slats on door
  ctx.strokeStyle = '#2a3a4a';
  ctx.lineWidth = 1;
  for (let s = 0; s < 6; s++) {
    const sy = gDoorY + 4 + s * (gDoorH / 6);
    ctx.beginPath();
    ctx.moveTo(gDoorX, sy);
    ctx.lineTo(gDoorX + gDoorW, sy);
    ctx.stroke();
  }
  // Door handle
  ctx.fillStyle = '#888';
  ctx.fillRect(gDoorX + gDoorW / 2 - 8, gDoorY + gDoorH - 8, 16, 4);

  // Small window up top
  if (b.h > 60) {
    const winY = b.y + 14;
    ctx.fillStyle = lvl >= 1 ? 'rgba(100,180,255,0.5)' : 'rgba(20,30,40,0.8)';
    ctx.fillRect(b.x + 8, winY, b.w - 16, 14);
    ctx.strokeStyle = '#1a2a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 8, winY, b.w - 16, 14);
    // Cross divider
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, winY);
    ctx.lineTo(b.x + b.w / 2, winY + 14);
    ctx.stroke();
  }

  // Oil stain on ground in front
  ctx.fillStyle = 'rgba(20,20,20,0.4)';
  ctx.beginPath();
  ctx.ellipse(b.x + b.w / 2, streetY + 4, b.w * 0.3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // "CHOP SHOP" sign or tools indicator based on level
  if (lvl >= 1) {
    // Wrench icon
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w - 16, b.y + 12);
    ctx.lineTo(b.x + b.w - 8, b.y + 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x + b.w - 16, b.y + 10, 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tire stack if upgraded
  if (lvl >= 2) {
    ctx.fillStyle = '#222';
    for (let t = 0; t < 2; t++) {
      ctx.beginPath();
      ctx.arc(b.x + 10, streetY - 6 - t * 10, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawNightclub(b, lvl, selected, streetY) {
  // Nightclub: neon lights, dark walls, pulsing colors, velvet rope
  const bGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  bGrad.addColorStop(0, '#2a1040');
  bGrad.addColorStop(0.5, '#1a0830');
  bGrad.addColorStop(1, '#100520');
  ctx.fillStyle = bGrad;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, [6, 6, 0, 0]);
  ctx.fill();

  // Flat roof with neon trim
  const neonPulse = 0.5 + 0.5 * Math.sin(blockFrameCount * 0.06);
  ctx.strokeStyle = `rgba(255,0,255,${0.4 + neonPulse * 0.4})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ff00ff';
  ctx.shadowBlur = 8 + neonPulse * 8;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + 2);
  ctx.lineTo(b.x + b.w, b.y + 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (selected) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4, [8, 8, 0, 0]);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Neon sign (pulsing club name)
  const signY = b.y + Math.min(28, b.h * 0.15);
  ctx.fillStyle = `rgba(255,100,255,${0.6 + neonPulse * 0.3})`;
  ctx.shadowColor = '#ff00ff';
  ctx.shadowBlur = 6 + neonPulse * 6;
  ctx.font = 'bold ' + Math.min(10, b.w * 0.09) + 'px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('CLUB', b.x + b.w / 2, signY);
  ctx.shadowBlur = 0;

  // Dark tinted windows with color glow inside
  const winColors = ['#ff00ff', '#00ffff', '#ff0066', '#6600ff'];
  const rows = Math.max(1, Math.floor((b.h - 50) / 30));
  for (let r = 0; r < rows; r++) {
    const wy = b.y + 36 + r * 30;
    if (wy + 16 > streetY - 30) continue;
    ctx.fillStyle = 'rgba(10,5,20,0.9)';
    ctx.fillRect(b.x + 6, wy, b.w - 12, 16);
    // Interior glow based on level
    if (r < lvl) {
      const glowCol = winColors[(r + Math.floor(blockFrameCount / 30)) % winColors.length];
      ctx.fillStyle = glowCol;
      ctx.globalAlpha = 0.2 + 0.15 * Math.sin(blockFrameCount * 0.08 + r);
      ctx.fillRect(b.x + 7, wy + 1, b.w - 14, 14);
      ctx.globalAlpha = 1;
    }
  }

  // Club door
  const doorW = Math.min(22, b.w * 0.25);
  const doorH = 30;
  const doorX = b.x + (b.w - doorW) / 2;
  ctx.fillStyle = '#0a0515';
  ctx.fillRect(doorX, streetY - doorH, doorW, doorH);
  ctx.fillStyle = '#2a1040';
  ctx.fillRect(doorX + 2, streetY - doorH + 2, doorW - 4, doorH - 2);

  // Velvet rope
  if (lvl >= 1) {
    ctx.strokeStyle = '#cc0044';
    ctx.lineWidth = 2;
    const ropeY = streetY - 4;
    // Left post
    ctx.fillStyle = '#888';
    ctx.fillRect(doorX - 10, ropeY - 14, 3, 14);
    // Right post
    ctx.fillRect(doorX + doorW + 7, ropeY - 14, 3, 14);
    // Rope
    ctx.beginPath();
    ctx.moveTo(doorX - 8, ropeY - 10);
    ctx.quadraticCurveTo(doorX + doorW / 2, ropeY - 4, doorX + doorW + 8, ropeY - 10);
    ctx.stroke();
  }

  // Bouncing light beams from roof if upgraded
  if (lvl >= 2) {
    ctx.globalAlpha = 0.08 + 0.04 * Math.sin(blockFrameCount * 0.04);
    const beamAngle = Math.sin(blockFrameCount * 0.03) * 0.3;
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y);
    ctx.lineTo(b.x + b.w / 2 - 30 + Math.sin(beamAngle) * 20, b.y - 40);
    ctx.lineTo(b.x + b.w / 2 + 10 + Math.sin(beamAngle) * 20, b.y - 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y);
    ctx.lineTo(b.x + b.w / 2 + 20 - Math.sin(beamAngle) * 20, b.y - 35);
    ctx.lineTo(b.x + b.w / 2 + 40 - Math.sin(beamAngle) * 20, b.y - 35);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawStashHouse(b, lvl, selected, streetY) {
  // Small brick house with steel door and barred windows
  const bGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  bGrad.addColorStop(0, '#6b3024');
  bGrad.addColorStop(0.5, '#7a3a2a');
  bGrad.addColorStop(1, '#4a1f18');
  ctx.fillStyle = bGrad;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, [4, 4, 0, 0]);
  ctx.fill();

  // Brick pattern
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  const brickH = 8;
  for (let y = b.y + brickH; y < b.y + b.h; y += brickH) {
    ctx.beginPath();
    ctx.moveTo(b.x, y);
    ctx.lineTo(b.x + b.w, y);
    ctx.stroke();
  }

  // Flat roof cap
  ctx.fillStyle = '#2a120c';
  ctx.fillRect(b.x - 2, b.y - 4, b.w + 4, 5);

  // Selection glow
  if (selected) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    ctx.shadowBlur = 0;
  }

  // Steel door — thicker at higher levels
  const doorW = Math.min(18, b.w * 0.3);
  const doorH = Math.min(28, b.h * 0.42);
  const doorX = b.x + b.w / 2 - doorW / 2;
  const doorY = b.y + b.h - doorH - 2;
  const doorShade = lvl >= 3 ? '#3a3a44' : lvl >= 1 ? '#4a4a55' : '#666';
  ctx.fillStyle = doorShade;
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(doorX, doorY, doorW, doorH);
  // Bolts on door (more at higher levels)
  ctx.fillStyle = '#888';
  const bolts = Math.min(6, 2 + lvl);
  for (let i = 0; i < bolts; i++) {
    ctx.beginPath();
    ctx.arc(doorX + 2 + (doorW - 4) * (i / Math.max(1, bolts - 1)), doorY + 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Barred window with cash sack visible (more sacks at higher levels)
  const winW = Math.min(20, b.w * 0.38);
  const winH = 12;
  const winX = b.x + 4;
  const winY = b.y + 8;
  ctx.fillStyle = '#111';
  ctx.fillRect(winX, winY, winW, winH);
  // Window bars
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  for (let v = 0; v < 3; v++) {
    ctx.beginPath();
    ctx.moveTo(winX + (v + 1) * winW / 4, winY);
    ctx.lineTo(winX + (v + 1) * winW / 4, winY + winH);
    ctx.stroke();
  }
  // Cash sacks
  if (lvl >= 1) {
    ctx.fillStyle = '#c9a670';
    const sackCount = Math.min(3, lvl);
    for (let s = 0; s < sackCount; s++) {
      const sx = winX + 2 + s * 5;
      ctx.beginPath();
      ctx.ellipse(sx, winY + winH - 3, 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // $ on sacks
    ctx.fillStyle = '#000';
    ctx.font = 'bold 5px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('$', winX + 1, winY + winH - 2);
  }

  // Small dollar sign above door
  if (lvl >= 2) {
    ctx.save();
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 6;
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('$', doorX + doorW / 2, doorY - 2);
    ctx.restore();
  }
}

function drawVaultBuilding(b, lvl, selected, streetY) {
  // Bank-like look: stone exterior, columns, gold arch
  const bGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  bGrad.addColorStop(0, '#3c3c4a');
  bGrad.addColorStop(1, '#252530');
  ctx.fillStyle = bGrad;
  ctx.fillRect(b.x, b.y + 6, b.w, b.h - 6);

  // Pediment / triangular top
  ctx.fillStyle = '#55556a';
  ctx.beginPath();
  ctx.moveTo(b.x - 2, b.y + 6);
  ctx.lineTo(b.x + b.w / 2, b.y - 6);
  ctx.lineTo(b.x + b.w + 2, b.y + 6);
  ctx.closePath();
  ctx.fill();

  // Selection glow
  if (selected) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    ctx.shadowBlur = 0;
  }

  // Columns
  const colCount = 3;
  const colW = Math.max(3, b.w * 0.09);
  const colSpacing = (b.w - colW * colCount) / (colCount + 1);
  ctx.fillStyle = '#d8d4c8';
  for (let c = 0; c < colCount; c++) {
    const cx = b.x + colSpacing + c * (colW + colSpacing);
    ctx.fillRect(cx, b.y + 10, colW, b.h - 26);
    // Cap
    ctx.fillRect(cx - 1, b.y + 8, colW + 2, 3);
    ctx.fillRect(cx - 1, b.y + b.h - 16, colW + 2, 3);
  }

  // Big vault door (circle) - gold at higher levels
  const cx = b.x + b.w / 2;
  const vaultR = Math.min(b.w * 0.22, b.h * 0.2);
  const vaultY = b.y + b.h - vaultR - 6;
  const doorColor = lvl >= 3 ? '#ffd700' : lvl >= 1 ? '#cccccc' : '#666';
  ctx.fillStyle = doorColor;
  ctx.beginPath();
  ctx.arc(cx, vaultY, vaultR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Spokes (only if owned)
  if (lvl >= 1) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let s = 0; s < 4; s++) {
      const a = s * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * vaultR * 0.3, vaultY + Math.sin(a) * vaultR * 0.3);
      ctx.lineTo(cx + Math.cos(a) * vaultR * 0.9, vaultY + Math.sin(a) * vaultR * 0.9);
      ctx.stroke();
    }
    // Handle
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(cx, vaultY, vaultR * 0.15, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Padlock overlay for locked vault
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - 3, vaultY - 2, 6, 6);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, vaultY - 3, 3, Math.PI, 0);
    ctx.stroke();
  }

  // "BANK" sign on pediment
  if (lvl >= 1) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold ' + Math.min(7, b.w * 0.12) + 'px Arial Black, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BANK', cx, b.y + 4);
  }
}

// Vault panel layout — shared between draw + click handler
function getVaultPanelLayout() {
  const w = canvas.width, h = canvas.height;
  const panelW = Math.min(300, w * 0.85);
  const panelH = 210;
  const panelX = (w - panelW) / 2;
  const panelY = h * 0.1;
  const btnH = 28;
  const btnGap = 6;
  const btnRowY = panelY + 98;
  const btnW = (panelW - 16 - btnGap * 3) / 4;
  return {
    panelX, panelY, panelW, panelH,
    depositBtn: { x: panelX + 8, y: btnRowY, w: btnW, h: btnH },
    depositMaxBtn: { x: panelX + 8 + (btnW + btnGap), y: btnRowY, w: btnW, h: btnH },
    withdrawBtn: { x: panelX + 8 + (btnW + btnGap) * 2, y: btnRowY, w: btnW, h: btnH },
    withdrawMaxBtn: { x: panelX + 8 + (btnW + btnGap) * 3, y: btnRowY, w: btnW, h: btnH },
    upgradeBtn: { x: panelX + 20, y: panelY + 150, w: panelW - 40, h: 30 },
    closeBtn: { x: panelX + panelW - 28, y: panelY + 4, w: 24, h: 24 },
  };
}

function drawVaultPanel(layout) {
  const w = canvas.width, h = canvas.height;
  const lvl = buildingLevels.vault;
  const maxLvl = BUILDINGS.vault.levels.length - 1;
  const lvData = BUILDINGS.vault.levels[lvl];
  const eff = lvData.effect;
  const vl = getVaultPanelLayout();

  // Bg
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.beginPath();
  ctx.roundRect(vl.panelX, vl.panelY, vl.panelW, vl.panelH, 14);
  ctx.fill();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(vl.panelX, vl.panelY, vl.panelW, vl.panelH, 14);
  ctx.stroke();

  // Title
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.min(18, w * 0.05) + 'px Arial Black, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THE VAULT', w / 2, vl.panelY + 26);

  if (!eff) {
    // Locked
    ctx.fillStyle = '#aaa';
    ctx.font = Math.min(13, w * 0.033) + 'px Arial';
    ctx.fillText('Locked. Unlock to earn idle interest', w / 2, vl.panelY + 56);
    ctx.fillText('on your chains between runs.', w / 2, vl.panelY + 74);

    // Upgrade-to-unlock button
    const nxt = BUILDINGS.vault.levels[1];
    const canAfford = savedChains >= nxt.cost;
    ctx.fillStyle = canAfford ? '#00e676' : '#555';
    ctx.beginPath();
    ctx.roundRect(vl.upgradeBtn.x, vl.upgradeBtn.y, vl.upgradeBtn.w, vl.upgradeBtn.h, 15);
    ctx.fill();
    ctx.fillStyle = canAfford ? '#000' : '#888';
    ctx.font = 'bold ' + Math.min(14, w * 0.035) + 'px Arial';
    ctx.fillText('UNLOCK VAULT (' + nxt.cost + ' chains)', w / 2, vl.upgradeBtn.y + vl.upgradeBtn.h / 2 + 5);
  } else {
    // Balance + pending interest
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.min(26, w * 0.065) + 'px Arial Black, Impact, sans-serif';
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
    ctx.fillText(Math.floor(vaultBalance) + ' / ' + eff.cap + ' ⛓️', w / 2, vl.panelY + 58);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#aaa';
    ctx.font = Math.min(11, w * 0.029) + 'px Arial';
    ctx.fillText(Math.round(eff.interest * 100) + '%/hr  •  ' + Math.round(eff.raid * 100) + '% raid on death  •  cap ' + eff.cap,
      w / 2, vl.panelY + 76);

    // Deposit / Withdraw buttons
    const canDeposit50 = savedChains >= 50;
    const canDeposit10 = savedChains >= 10;
    ctx.font = 'bold ' + Math.min(12, w * 0.03) + 'px Arial';
    drawVaultButton(vl.depositBtn, '+10', canDeposit10);
    drawVaultButton(vl.depositMaxBtn, 'DEPOSIT MAX', savedChains > 0 && vaultBalance < eff.cap);
    drawVaultButton(vl.withdrawBtn, '-10', vaultBalance >= 10);
    drawVaultButton(vl.withdrawMaxBtn, 'WITHDRAW MAX', vaultBalance > 0);

    // Upgrade button
    if (lvl < maxLvl) {
      const nxt = BUILDINGS.vault.levels[lvl + 1];
      const canAfford = savedChains >= nxt.cost;
      ctx.fillStyle = canAfford ? '#00e676' : '#555';
      ctx.beginPath();
      ctx.roundRect(vl.upgradeBtn.x, vl.upgradeBtn.y, vl.upgradeBtn.w, vl.upgradeBtn.h, 15);
      ctx.fill();
      ctx.fillStyle = canAfford ? '#000' : '#888';
      ctx.font = 'bold ' + Math.min(13, w * 0.033) + 'px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('UPGRADE → ' + nxt.desc + '  (' + nxt.cost + ')', w / 2, vl.upgradeBtn.y + vl.upgradeBtn.h / 2 + 4);
    } else {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold ' + Math.min(14, w * 0.035) + 'px Arial';
      ctx.fillText('VAULT MAXED', w / 2, vl.upgradeBtn.y + vl.upgradeBtn.h / 2 + 4);
    }
  }

  // Close X
  ctx.fillStyle = '#888';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('X', vl.panelX + vl.panelW - 10, vl.panelY + 22);

  // Expose for hit testing
  layout.vaultPanel = vl;
}

function drawVaultButton(b, label, enabled) {
  ctx.save();
  ctx.fillStyle = enabled ? 'rgba(255,215,0,0.18)' : 'rgba(80,80,80,0.2)';
  ctx.strokeStyle = enabled ? '#ffd700' : '#555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = enabled ? '#ffd700' : '#777';
  ctx.textAlign = 'center';
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 4);
  ctx.restore();
}

function drawBlockPlayer(px, py) {
  // Simplified player standing idle on the block
  const p = player;
  ctx.save();
  const cx = px + 19;
  const by = py + 56;

  // Apply clothing from building level
  const clothLvl = buildingLevels.clothing;
  const clothEffect = BUILDINGS.clothing.levels[clothLvl].effect;
  const shirt = clothEffect ? clothEffect.shirt : p.shirtColor;
  const pants = clothEffect ? clothEffect.pants : p.pantsColor;
  const sneakers = clothEffect ? clothEffect.sneakers : p.sneakerColor;

  // Sneakers
  ctx.fillStyle = sneakers;
  ctx.fillRect(cx - 12, by - 8, 10, 8);
  ctx.fillRect(cx + 2, by - 8, 10, 8);
  // Legs
  ctx.fillStyle = pants;
  ctx.fillRect(cx - 10, by - 28, 8, 20);
  ctx.fillRect(cx + 2, by - 28, 8, 20);
  // Torso
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.roundRect(cx - 14, by - 48, 28, 22, 4);
  ctx.fill();
  // Arms
  ctx.fillStyle = p.skinColor;
  ctx.fillRect(cx - 18, by - 46, 6, 18);
  ctx.fillRect(cx + 12, by - 46, 6, 18);
  // Head
  ctx.fillStyle = p.skinColor;
  ctx.beginPath();
  ctx.arc(cx, by - 54, 9, 0, Math.PI * 2);
  ctx.fill();
  // Cap
  ctx.fillStyle = '#b71c1c';
  ctx.beginPath();
  ctx.ellipse(cx, by - 58, 11, 5, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cx - 2, by - 63, 13, 4);
  // Eyes
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(cx - 3, by - 55, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 3, by - 55, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Draw chains on block player
  const totalChains = player.chainsWorn || 0;
  if (totalChains > 0 || buildingLevels.trapHouse > 0) {
    // Just show a small chain indicator
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, by - 42, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawUpgradePanel(layout) {
  const w = canvas.width, h = canvas.height;
  const i = blockSelectedBuilding;
  const b = layout.buildings[i];
  const key = b.key;
  const bData = BUILDINGS[key];
  const lvl = buildingLevels[key];
  const maxLvl = bData.levels.length - 1;
  const isMaxed = lvl >= maxLvl;
  const nextLvl = isMaxed ? null : bData.levels[lvl + 1];

  // Panel background
  const panelW = Math.min(260, w * 0.7);
  const panelH = 160;
  const panelX = (w - panelW) / 2;
  const panelY = h * 0.12;

  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 14);
  ctx.fill();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 14);
  ctx.stroke();

  // Building name
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.min(18, w * 0.045) + 'px Arial Black, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(bData.name, w / 2, panelY + 28);

  // Current level
  ctx.fillStyle = '#aaa';
  ctx.font = Math.min(13, w * 0.033) + 'px Arial';
  ctx.fillText('Current: ' + bData.levels[lvl].desc, w / 2, panelY + 48);

  if (isMaxed) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold ' + Math.min(16, w * 0.04) + 'px Arial';
    ctx.fillText('FULLY UPGRADED!', w / 2, panelY + 80);
  } else {
    // Next upgrade info
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.min(14, w * 0.035) + 'px Arial';
    ctx.fillText('Next: ' + nextLvl.desc, w / 2, panelY + 72);

    // Cost
    const canAfford = savedChains >= nextLvl.cost;
    ctx.fillStyle = canAfford ? '#00e676' : '#ff4444';
    ctx.font = 'bold ' + Math.min(14, w * 0.035) + 'px Arial';
    ctx.fillText('Cost: ' + nextLvl.cost + ' chains', w / 2, panelY + 92);

    // Upgrade button
    const ubW = Math.min(140, panelW * 0.6);
    const ubH = 34;
    const ubX = (w - ubW) / 2;
    const ubY = panelY + 108;

    ctx.fillStyle = canAfford ? '#00e676' : '#555';
    ctx.beginPath();
    ctx.roundRect(ubX, ubY, ubW, ubH, 17);
    ctx.fill();
    ctx.fillStyle = canAfford ? '#000' : '#888';
    ctx.font = 'bold ' + Math.min(14, w * 0.035) + 'px Arial';
    ctx.fillText('UPGRADE', w / 2, ubY + ubH / 2 + 5);

    // Store button rect for click detection
    layout.upgradeBtn = { x: ubX, y: ubY, w: ubW, h: ubH };
  }

  // Close X
  ctx.fillStyle = '#888';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('X', panelX + panelW - 10, panelY + 22);
  layout.closeBtn = { x: panelX + panelW - 28, y: panelY + 4, w: 24, h: 24 };
}

function handleBlockClick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top) * scaleY;

  const layout = getBlockLayout();

  // If any panel is open
  if (blockSelectedBuilding >= 0) {
    const selKey = layout.buildings[blockSelectedBuilding].key;

    // --- Vault panel ---
    if (selKey === 'vault') {
      const vl = getVaultPanelLayout();
      // Close X
      if (cx >= vl.closeBtn.x && cx <= vl.closeBtn.x + vl.closeBtn.w && cy >= vl.closeBtn.y && cy <= vl.closeBtn.y + vl.closeBtn.h) {
        blockSelectedBuilding = -1; return;
      }
      const lvl = buildingLevels.vault;
      const maxLvl = BUILDINGS.vault.levels.length - 1;
      const eff = BUILDINGS.vault.levels[lvl].effect;

      // Upgrade / unlock
      if (lvl < maxLvl) {
        const nxt = BUILDINGS.vault.levels[lvl + 1];
        if (cx >= vl.upgradeBtn.x && cx <= vl.upgradeBtn.x + vl.upgradeBtn.w && cy >= vl.upgradeBtn.y && cy <= vl.upgradeBtn.y + vl.upgradeBtn.h) {
          if (savedChains >= nxt.cost) {
            savedChains -= nxt.cost;
            buildingLevels.vault++;
            if (buildingLevels.vault === 1) vaultLastCheck = Date.now();
            saveBlockData();
            if (audioCtx) playBuySound();
          } else if (audioCtx) playDenySound();
          return;
        }
      }

      if (eff) {
        // Deposit 10
        if (cx >= vl.depositBtn.x && cx <= vl.depositBtn.x + vl.depositBtn.w && cy >= vl.depositBtn.y && cy <= vl.depositBtn.y + vl.depositBtn.h) {
          if (savedChains >= 10 && vaultBalance < eff.cap) {
            const dep = Math.min(10, eff.cap - vaultBalance);
            savedChains -= dep; vaultBalance += dep; vaultLastCheck = Date.now();
            saveBlockData();
            if (audioCtx) playBuySound();
          } else if (audioCtx) playDenySound();
          return;
        }
        // Deposit MAX
        if (cx >= vl.depositMaxBtn.x && cx <= vl.depositMaxBtn.x + vl.depositMaxBtn.w && cy >= vl.depositMaxBtn.y && cy <= vl.depositMaxBtn.y + vl.depositMaxBtn.h) {
          if (savedChains > 0 && vaultBalance < eff.cap) {
            const dep = Math.min(savedChains, eff.cap - vaultBalance);
            savedChains -= dep; vaultBalance += dep; vaultLastCheck = Date.now();
            saveBlockData();
            if (audioCtx) playBuySound();
          } else if (audioCtx) playDenySound();
          return;
        }
        // Withdraw 10
        if (cx >= vl.withdrawBtn.x && cx <= vl.withdrawBtn.x + vl.withdrawBtn.w && cy >= vl.withdrawBtn.y && cy <= vl.withdrawBtn.y + vl.withdrawBtn.h) {
          if (vaultBalance >= 10) {
            const wd = Math.min(10, Math.floor(vaultBalance));
            vaultBalance -= wd; savedChains += wd; vaultLastCheck = Date.now();
            saveBlockData();
            if (audioCtx) playBuySound();
          } else if (audioCtx) playDenySound();
          return;
        }
        // Withdraw MAX
        if (cx >= vl.withdrawMaxBtn.x && cx <= vl.withdrawMaxBtn.x + vl.withdrawMaxBtn.w && cy >= vl.withdrawMaxBtn.y && cy <= vl.withdrawMaxBtn.y + vl.withdrawMaxBtn.h) {
          if (vaultBalance > 0) {
            const wd = Math.floor(vaultBalance);
            vaultBalance -= wd; savedChains += wd; vaultLastCheck = Date.now();
            saveBlockData();
            if (audioCtx) playBuySound();
          } else if (audioCtx) playDenySound();
          return;
        }
      }

      // Click outside panel closes
      if (cx < vl.panelX || cx > vl.panelX + vl.panelW || cy < vl.panelY || cy > vl.panelY + vl.panelH) {
        blockSelectedBuilding = -1;
      }
      return;
    }

    // --- Standard upgrade panel ---
    const panelW = Math.min(260, canvas.width * 0.7);
    const panelH = 160;
    const panelX = (canvas.width - panelW) / 2;
    const panelY = canvas.height * 0.12;

    // Close X
    const closeX = panelX + panelW - 28, closeY = panelY + 4;
    if (cx >= closeX && cx <= closeX + 24 && cy >= closeY && cy <= closeY + 24) {
      blockSelectedBuilding = -1;
      return;
    }

    // Upgrade button
    const key = layout.buildings[blockSelectedBuilding].key;
    const bData = BUILDINGS[key];
    const lvl = buildingLevels[key];
    const maxLvl = bData.levels.length - 1;
    if (lvl < maxLvl) {
      const nextLvl = bData.levels[lvl + 1];
      const ubW = Math.min(140, panelW * 0.6);
      const ubH = 34;
      const ubX = (canvas.width - ubW) / 2;
      const ubY = panelY + 108;
      if (cx >= ubX && cx <= ubX + ubW && cy >= ubY && cy <= ubY + ubH) {
        if (savedChains >= nextLvl.cost) {
          savedChains -= nextLvl.cost;
          buildingLevels[key]++;
          saveBlockData();
          if (audioCtx) playBuySound();
        } else {
          if (audioCtx) playDenySound();
        }
        return;
      }
    }

    // Click outside panel = close
    if (cx < panelX || cx > panelX + panelW || cy < panelY || cy > panelY + panelH) {
      blockSelectedBuilding = -1;
    }
    return;
  }

  // Check START RUN button
  const btn = layout.btn;
  if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
    startGame();
    return;
  }

  // Check building clicks (buildings have scroll-adjusted x positions)
  for (let i = 0; i < layout.count; i++) {
    const b = layout.buildings[i];
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
      blockSelectedBuilding = i;
      if (b.key === 'vault' && buildingLevels.vault > 0) {
        applyVaultInterest();
      }
      return;
    }
  }
}

function drawUpgradePanelHitTest() {
  // no-op, just used for consistency
}

function blockLoop() {
  if (state !== STATE.BLOCK) return;
  // Momentum scrolling
  if (blockTouchId === null && Math.abs(blockScrollVel) > 0.3) {
    const info = getBlockWorldInfo();
    blockScrollX += blockScrollVel;
    blockScrollVel *= 0.93;
    if (blockScrollX < 0) { blockScrollX = 0; blockScrollVel = 0; }
    if (blockScrollX > info.maxScroll) { blockScrollX = info.maxScroll; blockScrollVel = 0; }
  } else if (blockTouchId === null) {
    blockScrollVel = 0;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBlock();
  animFrame = requestAnimationFrame(blockLoop);
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
  drawHeatMeter();
  drawContractBanner();
  drawDeathScreen();
  drawShop();
  animFrame = requestAnimationFrame(gameLoop);
}

function drawHeatMeter() {
  if (state !== STATE.PLAYING && state !== STATE.SHOP) return;
  const w = canvas.width, h = canvas.height;
  const mW = Math.min(150, w * 0.4);
  const mH = 10;
  const mX = w - mW - 10;
  const mY = 62;

  // Label
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = 'bold ' + Math.min(11, w * 0.028) + 'px Arial';
  ctx.fillStyle = heatTierColor();
  ctx.shadowColor = heatTierColor();
  ctx.shadowBlur = heat >= 51 ? 8 : 0;
  ctx.fillText('🔥 ' + heatTierLabel() + ' (x' + heatChainMultiplier().toFixed(2) + ')', w - 10, mY - 2);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Background bar
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(mX, mY, mW, mH, 5);
  ctx.fill();

  // Fill
  const fillW = (heat / 100) * mW;
  const grad = ctx.createLinearGradient(mX, mY, mX + mW, mY);
  grad.addColorStop(0, '#00e676');
  grad.addColorStop(0.3, '#ffcc00');
  grad.addColorStop(0.6, '#ff6600');
  grad.addColorStop(0.85, '#ff0000');
  grad.addColorStop(1, '#ff00ff');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(mX, mY, fillW, mH, 5);
  ctx.fill();

  // Border
  ctx.strokeStyle = heat >= 75 ? heatTierColor() : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(mX, mY, mW, mH, 5);
  ctx.stroke();
  ctx.restore();

  // Red edge pulse at 75+
  if (heat >= 75) {
    ctx.save();
    const pulse = 0.15 + 0.12 * Math.abs(Math.sin(frameCount * 0.12));
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, w, 24);
    ctx.fillRect(0, h - 24, w, 24);
    ctx.fillRect(0, 0, 16, h);
    ctx.fillRect(w - 16, 0, 16, h);
    ctx.restore();
  }
  // MAX HEAT screen flash
  if (heatFlashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = (heatFlashTimer / 30) * 0.35;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function drawContractBanner() {
  if (contractBannerTime <= 0) return;
  contractBannerTime--;
  const w = canvas.width, h = canvas.height;
  const c = getContract();
  if (!c) return;
  ctx.save();
  const bY = h * 0.4;
  const bH = 60;
  const slide = Math.min(1, contractBannerTime / 30);
  const alpha = contractBannerTime > 150 ? (180 - contractBannerTime) / 30 : slide;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, bY, w, bH);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, bY, w, bH);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.min(20, w * 0.055) + 'px Arial Black, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12;
  ctx.fillText('CONTRACT COMPLETE', w / 2, bY + 26);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#00e676';
  ctx.font = 'bold ' + Math.min(14, w * 0.038) + 'px Arial';
  ctx.fillText('+' + c.reward + ' chains banked', w / 2, bY + 48);
  ctx.restore();
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
rollDailyContract();
if (buildingLevels.vault > 0) applyVaultInterest();
initClouds();
spawnInitialPlatforms();
titleLoop();
