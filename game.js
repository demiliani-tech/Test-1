'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('game-container');

// --- Responsive canvas sizing ---
let safeTop = 0, safeBottom = 0;
function resizeCanvas() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  const style = getComputedStyle(document.documentElement);
  safeTop = parseFloat(style.getPropertyValue('--safe-top')) || 0;
  safeBottom = parseFloat(style.getPropertyValue('--safe-bottom')) || 0;
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
let godMode = false;
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
  if (godMode) savedChains = 999999;
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
document.getElementById('godmode-btn').addEventListener('click', function() {
  godMode = !godMode;
  this.textContent = godMode ? '⚡ GOD MODE: ON ⚡' : '⚡ GOD MODE ⚡';
  this.style.background = godMode ? '#0f0' : '#ff0';
});

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
        if (!godMode) {
          player.dead = true;
          killPlayer();
        }
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
        if (!godMode) {
          killPlayer();
          return;
        }
        player.invincible = 30;
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

// --- Isometric projection constants ---
const ISO_XS = 0.75;
const ISO_YS = 0.375;
const ISO_ZS = 0.65;
let isoOffX = 0, isoOffY = 0;

const BLOCK_BLDG_WORLD = [
  { key: 'trapHouse',  wx: 30,  wy: 10,  ww: 70, wd: 50, baseH: 45, hGrow: 8, wGrow: 8, dGrow: 5 },
  { key: 'garage',     wx: 250, wy: 0,   ww: 80, wd: 50, baseH: 35, hGrow: 5, wGrow: 10, dGrow: 4 },
  { key: 'clothing',   wx: 490, wy: 10,  ww: 65, wd: 50, baseH: 45, hGrow: 12, wGrow: 8, dGrow: 5 },
  { key: 'stashHouse', wx: 140, wy: 200, ww: 65, wd: 45, baseH: 40, hGrow: 6, wGrow: 8, dGrow: 5 },
  { key: 'vault',      wx: 380, wy: 195, ww: 75, wd: 55, baseH: 45, hGrow: 7, wGrow: 7, dGrow: 4 },
];

function wts(wx, wy, wz) {
  return {
    x: (wx - wy) * ISO_XS + isoOffX - blockScrollX,
    y: (wx + wy) * ISO_YS - (wz || 0) * ISO_ZS + isoOffY
  };
}

function getBlockWorldInfo() {
  const w = canvas.width, h = canvas.height;
  const pad = 60;
  let minSX = Infinity, maxSX = -Infinity;
  let minSY = Infinity, maxSY = -Infinity;
  for (const bd of BLOCK_BLDG_WORLD) {
    const lvl = buildingLevels[bd.key] || 0;
    const growW = lvl * (bd.wGrow||6), growD = lvl * (bd.dGrow||4);
    const bh = bd.baseH + lvl * (bd.hGrow||6);
    const eww = bd.ww + growW, ewd = bd.wd + growD;
    for (const [dwx, dwy] of [[0,0],[eww,0],[0,ewd],[eww,ewd]]) {
      const sx = (bd.wx + dwx - bd.wy - dwy) * ISO_XS;
      const syG = (bd.wx + dwx + bd.wy + dwy) * ISO_YS;
      const syT = syG - bh * ISO_ZS;
      if (sx < minSX) minSX = sx;
      if (sx > maxSX) maxSX = sx;
      if (syT < minSY) minSY = syT;
      if (syG > maxSY) maxSY = syG;
    }
  }
  const totalWidth = (maxSX - minSX) + pad * 2;
  isoOffX = pad - minSX;
  isoOffY = h * 0.38 - (minSY + maxSY) / 2 + safeTop * 0.3;
  const maxScroll = Math.max(0, totalWidth - w);
  return { totalWidth, maxScroll, keys: BLOCK_BLDG_WORLD.map(b => b.key) };
}

const ISO_DY = 0.5;

function getBlockLayout() {
  const w = canvas.width, h = canvas.height;
  const info = getBlockWorldInfo();
  const buildings = [];
  for (let i = 0; i < BLOCK_BLDG_WORLD.length; i++) {
    const bd = BLOCK_BLDG_WORLD[i];
    const lvl = buildingLevels[bd.key] || 0;
    const growW = lvl * (bd.wGrow||6), growD = lvl * (bd.dGrow||4);
    const bh = bd.baseH + lvl * (bd.hGrow||6);
    const eww = bd.ww + growW, ewd = bd.wd + growD;
    const gNW = wts(bd.wx, bd.wy, 0);
    const gNE = wts(bd.wx + eww, bd.wy, 0);
    const gSE = wts(bd.wx + eww, bd.wy + ewd, 0);
    const gSW = wts(bd.wx, bd.wy + ewd, 0);
    const tNW = wts(bd.wx, bd.wy, bh);
    const tNE = wts(bd.wx + eww, bd.wy, bh);
    const tSE = wts(bd.wx + eww, bd.wy + ewd, bh);
    const tSW = wts(bd.wx, bd.wy + ewd, bh);
    buildings.push({
      key: bd.key, bh, lvl,
      wx: bd.wx, wy: bd.wy, ww: eww, wd: ewd,
      gNW, gNE, gSE, gSW, tNW, tNE, tSE, tSW,
      sortKey: bd.wx + bd.wy,
      silhouette: [
        [tNW.x, tNW.y], [tNE.x, tNE.y], [gNE.x, gNE.y],
        [gSE.x, gSE.y], [gSW.x, gSW.y], [tSW.x, tSW.y]
      ],
      labelPos: {
        x: (tNW.x + tNE.x + tSE.x + tSW.x) / 4,
        y: tNW.y - (bd.key === 'trapHouse' ? 28 : 14)
      },
    });
  }
  buildings.sort((a, b) => a.sortKey - b.sortKey);
  const btnW = Math.min(220, w * 0.55);
  const btnH = 48;
  const btnX = (w - btnW) / 2;
  const btnY = h - btnH - 20 - safeBottom;
  return {
    buildings, btn: { x: btnX, y: btnY, w: btnW, h: btnH },
    count: buildings.length, totalWidth: info.totalWidth, maxScroll: info.maxScroll
  };
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
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#030308');
  skyGrad.addColorStop(0.4, '#0a0a1e');
  skyGrad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137.5 + 50) % w;
    const sy = (i * 89.3 + 10) % (h * 0.35);
    ctx.globalAlpha = (0.3 + 0.7 * Math.abs(Math.sin(blockFrameCount * 0.02 + i))) * 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, i % 5 === 0 ? 1.5 : 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const moonX = w * 0.82, moonY = h * 0.06;
  ctx.fillStyle = '#e8e4d4';
  ctx.beginPath(); ctx.arc(moonX, moonY, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#030308';
  ctx.beginPath(); ctx.arc(moonX + 5, moonY - 3, 12, 0, Math.PI * 2); ctx.fill();

  const layout = getBlockLayout();
  drawIsoGroundPlane(w, h);
  drawIsoStreetLights(w);

  for (let i = 0; i < layout.count; i++) {
    const b = layout.buildings[i];
    if (b.gNE.x < -80 || b.gSW.x > w + 80) continue;
    const lvl = buildingLevels[b.key] || 0;
    const maxLvl = BUILDINGS[b.key].levels.length - 1;
    drawIsoBuilding2(b, lvl, b.key, blockSelectedBuilding === i);
    drawBldgExteriorProps(b, lvl, b.key);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.min(11, w * 0.028) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(BUILDINGS[b.key].blockName || BUILDINGS[b.key].name, b.labelPos.x, b.labelPos.y);
    ctx.fillStyle = lvl >= maxLvl ? '#ffd700' : '#aaa';
    ctx.font = Math.min(9, w * 0.023) + 'px Arial';
    ctx.fillText(lvl >= maxLvl ? 'MAXED' : BUILDINGS[b.key].levels[lvl].label, b.labelPos.x, b.labelPos.y + 12);
    if (b.key === 'vault' && vaultPendingInterest() > 0.5) {
      ctx.save();
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 12 + 6 * Math.abs(Math.sin(blockFrameCount * 0.08));
      drawBldgOutline(b);
      ctx.restore();
    }
  }

  const playerPos = wts(260, 120, 0);
  drawBlockPlayer(playerPos.x - 19, playerPos.y - 56);

  const st = safeTop;
  const hudGrad = ctx.createLinearGradient(0, 0, 0, st + 110);
  hudGrad.addColorStop(0, 'rgba(3,3,8,0.9)');
  hudGrad.addColorStop(1, 'rgba(3,3,8,0)');
  ctx.fillStyle = hudGrad;
  ctx.fillRect(0, 0, w, st + 110);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold ' + Math.min(20, w * 0.05) + 'px Arial Black, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 10;
  ctx.fillText('YOUR BLOCK', w / 2, st + 24);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + Math.min(14, w * 0.036) + 'px Arial';
  ctx.fillText('⛓️ ' + savedChains + ' chains', w / 2, st + 44);
  drawDailyContract(w, st + 56);

  if (vaultInterestNotice > 0) {
    vaultInterestNotice--;
    ctx.save();
    ctx.globalAlpha = Math.min(1, vaultInterestNotice / 60);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold ' + Math.min(13, w * 0.034) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
    ctx.fillText('💰 Vault earned +' + vaultInterestNoticeAmt + ' chains while you were away', w / 2, st + 106);
    ctx.restore();
  }

  if (layout.maxScroll > 0) {
    const dotGap = 12, dotBaseX = (w - layout.count * dotGap) / 2 + 6;
    const dotY = h - 80 - safeBottom;
    const scrollPct = blockScrollX / layout.maxScroll;
    for (let i = 0; i < layout.count; i++) {
      const dist = Math.abs(scrollPct - i / Math.max(1, layout.count - 1));
      ctx.fillStyle = dist < 0.2 ? '#ffd700' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(dotBaseX + i * dotGap, dotY, dist < 0.2 ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (blockSelectedBuilding >= 0) {
    const sel = layout.buildings[blockSelectedBuilding];
    if (sel.key === 'vault') drawVaultPanel(layout);
    else drawUpgradePanel(layout);
  }

  if (blockSelectedBuilding < 0) {
    const btn = layout.btn;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.roundRect(btn.x + 2, btn.y + 3, btn.w, btn.h, 24); ctx.fill();
    const btnGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x + btn.w, btn.y);
    btnGrad.addColorStop(0, '#00e676'); btnGrad.addColorStop(1, '#00c853');
    ctx.fillStyle = btnGrad;
    ctx.beginPath(); ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 24); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold ' + Math.min(20, w * 0.05) + 'px Arial Black, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('START RUN', btn.x + btn.w / 2, btn.y + btn.h / 2 + 7);
  }

  if (blockFrameCount < 180 && blockFrameCount % 60 < 40) {
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - blockFrameCount / 180);
    ctx.fillStyle = '#fff';
    ctx.font = Math.min(12, w * 0.03) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('← SWIPE TO EXPLORE →', w / 2, h - 72 - safeBottom);
    ctx.restore();
  }
}

function drawIsoQuad(p1, p2, p3, p4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
  ctx.closePath(); ctx.fill();
}

function drawIsoGroundPlane(w, h) {
  drawIsoQuad(wts(-80,-80,0), wts(650,-80,0), wts(650,360,0), wts(-80,360,0), '#1a1a1a');
  drawIsoQuad(wts(-50,75,0), wts(600,75,0), wts(600,85,0), wts(-50,85,0), '#2a2a2a');
  drawIsoQuad(wts(-50,170,0), wts(600,170,0), wts(600,180,0), wts(-50,180,0), '#2a2a2a');
  drawIsoQuad(wts(-50,85,0), wts(600,85,0), wts(600,170,0), wts(-50,170,0), '#222');
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  var p1 = wts(-50,85,0), p2 = wts(600,85,0);
  ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
  p1 = wts(-50,170,0); p2 = wts(600,170,0);
  ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,215,0,0.35)'; ctx.lineWidth = 2;
  ctx.setLineDash([14,10]);
  p1 = wts(-50,127,0); p2 = wts(600,127,0);
  ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (var wx = 150; wx <= 450; wx += 25) {
    p1 = wts(wx,15,0); p2 = wts(wx,60,0);
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
  }
  for (var bd2 of BLOCK_BLDG_WORLD) {
    var cx2 = bd2.wx + bd2.ww/2, cy2 = bd2.wy + bd2.wd/2;
    var sp = wts(cx2+10, cy2+10, 0);
    ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y, (bd2.ww+bd2.wd)*ISO_XS*0.4, (bd2.ww+bd2.wd)*ISO_YS*0.3, -0.5, 0, Math.PI*2);
    ctx.fill(); ctx.restore();
  }
}

function drawIsoStreetLights(w) {
  var lamps = [[100,82],[300,82],[500,82],[200,170],[400,170]];
  for (var lp of lamps) {
    var base = wts(lp[0],lp[1],0), top2 = wts(lp[0],lp[1],45);
    var arm = wts(lp[0]+6,lp[1],42);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(base.x,base.y); ctx.lineTo(top2.x,top2.y); ctx.stroke();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(top2.x,top2.y); ctx.lineTo(arm.x,arm.y); ctx.stroke();
    var fl = 0.7 + 0.3*Math.sin(blockFrameCount*0.05+lp[0]*0.02);
    ctx.fillStyle = '#ffd700'; ctx.globalAlpha = fl;
    ctx.beginPath(); ctx.arc(arm.x,arm.y,2.5,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    var glowP = wts(lp[0],lp[1]+15,0);
    ctx.save(); ctx.globalAlpha = 0.06+0.015*Math.sin(blockFrameCount*0.03+lp[0]*0.01);
    var glow = ctx.createRadialGradient(glowP.x,glowP.y,2,glowP.x,glowP.y,55);
    glow.addColorStop(0,'#ffd700'); glow.addColorStop(1,'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(glowP.x-65,glowP.y-45,130,90); ctx.restore();
  }
}

function wallPt(bl, br, tl, tr, u, v) {
  var bx=bl.x+(br.x-bl.x)*u, by=bl.y+(br.y-bl.y)*u;
  var tx=tl.x+(tr.x-tl.x)*u, ty=tl.y+(tr.y-tl.y)*u;
  return {x:bx+(tx-bx)*v, y:by+(ty-by)*v};
}
function wallQuad(bl, br, tl, tr, u1, v1, u2, v2, color) {
  var p1=wallPt(bl,br,tl,tr,u1,v1), p2=wallPt(bl,br,tl,tr,u2,v1);
  var p3=wallPt(bl,br,tl,tr,u2,v2), p4=wallPt(bl,br,tl,tr,u1,v2);
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y);
  ctx.lineTo(p3.x,p3.y); ctx.lineTo(p4.x,p4.y);
  ctx.closePath(); ctx.fill();
}
function roofPt(b, u, v) {
  var tx=b.tNW.x+(b.tNE.x-b.tNW.x)*u, ty=b.tNW.y+(b.tNE.y-b.tNW.y)*u;
  var bx=b.tSW.x+(b.tSE.x-b.tSW.x)*u, by=b.tSW.y+(b.tSE.y-b.tSW.y)*u;
  return {x:tx+(bx-tx)*v, y:ty+(by-ty)*v};
}
function drawBldgOutline(b) {
  ctx.beginPath();
  ctx.moveTo(b.tNW.x,b.tNW.y); ctx.lineTo(b.tNE.x,b.tNE.y);
  ctx.lineTo(b.gNE.x,b.gNE.y); ctx.lineTo(b.gSE.x,b.gSE.y);
  ctx.lineTo(b.gSW.x,b.gSW.y); ctx.lineTo(b.tSW.x,b.tSW.y);
  ctx.closePath(); ctx.stroke();
}
function isoBldgContains(px, py, sil) {
  var inside = false;
  for (var i=0, j=sil.length-1; i<sil.length; j=i++) {
    var xi=sil[i][0],yi=sil[i][1],xj=sil[j][0],yj=sil[j][1];
    if ((yi>py)!==(yj>py) && px<(xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

var ISO_BLDG_STYLES_BY_LVL = {
  trapHouse: [
    {lw:'#4a2820',rw:'#2a1210',rf:'#5a3028',rf2:'#3a1810',trim:'#2a1208'},
    {lw:'#4e2c22',rw:'#2e1412',rf:'#5e3228',rf2:'#3e1a12',trim:'#3a1a10'},
    {lw:'#523018',rw:'#321815',rf:'#62362a',rf2:'#421e14',trim:'#4a2a18'},
    {lw:'#563420',rw:'#361a18',rf:'#663a2e',rf2:'#462218',trim:'#4a3020'},
    {lw:'#5a3828',rw:'#3a1e1a',rf:'#6a3e32',rf2:'#4a261a',trim:'#5a3828'},
  ],
  garage: [
    {lw:'#3a4848',rw:'#1a2828',rf:'#445050',rf2:'#2a3535',trim:'#1a2525'},
    {lw:'#3e4c4c',rw:'#1e2c2c',rf:'#485454',rf2:'#2e3838',trim:'#2a3535'},
    {lw:'#424e4e',rw:'#222e2e',rf:'#4c5858',rf2:'#323c3c',trim:'#2a4a4a'},
    {lw:'#465252',rw:'#263232',rf:'#505c5c',rf2:'#364040',trim:'#3a5a5a'},
    {lw:'#4a5656',rw:'#2a3636',rf:'#546060',rf2:'#3a4444',trim:'#4a6a6a'},
  ],
  clothing: [
    {lw:'#221038',rw:'#140820',rf:'#1a0828',rf2:'#0e0518',trim:'#8800aa'},
    {lw:'#281440',rw:'#1a0a28',rf:'#200c30',rf2:'#14081e',trim:'#aa00cc'},
    {lw:'#2e1848',rw:'#1e0c30',rf:'#261038',rf2:'#1a0a24',trim:'#cc00ee'},
    {lw:'#341c50',rw:'#221038',rf:'#2c1440',rf2:'#200e2a',trim:'#dd00ff'},
    {lw:'#3a2058',rw:'#281440',rf:'#321848',rf2:'#261230',trim:'#ee22ff'},
  ],
  stashHouse: [
    {lw:'#5a4028',rw:'#3a2418',rf:'#604830',rf2:'#3e2a18',trim:'#2a1a10'},
    {lw:'#5e4428',rw:'#3e2818',rf:'#644c30',rf2:'#422e18',trim:'#3a2818'},
    {lw:'#62482a',rw:'#422a1a',rf:'#685032',rf2:'#46301a',trim:'#4a3020'},
    {lw:'#664c2c',rw:'#462c1c',rf:'#6c5434',rf2:'#4a321c',trim:'#5a3828'},
    {lw:'#6a502e',rw:'#4a2e1e',rf:'#705836',rf2:'#4e341e',trim:'#6a4030'},
  ],
  vault: [
    {lw:'#404050',rw:'#282838',rf:'#484860',rf2:'#323242',trim:'#887722'},
    {lw:'#454558',rw:'#2c2c3c',rf:'#4c4c64',rf2:'#363646',trim:'#998822'},
    {lw:'#4a4a5e',rw:'#303040',rf:'#505068',rf2:'#3a3a4a',trim:'#aa9922'},
    {lw:'#4e4e62',rw:'#343444',rf:'#54546c',rf2:'#3e3e4e',trim:'#bbaa33'},
    {lw:'#525268',rw:'#383848',rf:'#585870',rf2:'#424252',trim:'#ccbb44'},
  ],
};
function getIsoStyle(key, lvl) {
  var arr = ISO_BLDG_STYLES_BY_LVL[key];
  return arr[Math.min(lvl, arr.length - 1)];
}

function drawIsoPalmTree(sx, sy) {
  // Trunk
  ctx.strokeStyle='#4a2a12';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(sx+5,sy-22,sx+3,sy-40);ctx.stroke();
  ctx.strokeStyle='#5a3a1a';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(sx+5,sy-22,sx+3,sy-40);ctx.stroke();
  // Fronds - drooping leaves
  ctx.fillStyle='#1a5a12';
  for(var a=0;a<6;a++){var ang=a*Math.PI*2/6-Math.PI/2;
    ctx.beginPath();ctx.ellipse(sx+3+Math.cos(ang)*10,sy-40+Math.sin(ang)*6,12,3,ang+0.3,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#226a18';
  for(var a2=0;a2<5;a2++){var ang2=a2*Math.PI*2/5;
    ctx.beginPath();ctx.ellipse(sx+3+Math.cos(ang2)*7,sy-42+Math.sin(ang2)*4,8,2.5,ang2,0,Math.PI*2);ctx.fill();}
  // Coconuts
  ctx.fillStyle='#5a3a1a';
  ctx.beginPath();ctx.arc(sx+2,sy-38,1.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(sx+5,sy-39,1.5,0,Math.PI*2);ctx.fill();
}

function drawIsoCarProp(sx, sy, color) {
  // Shadow
  ctx.save();ctx.globalAlpha=0.2;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(sx,sy+2,14,5,0,0,Math.PI*2);ctx.fill();ctx.restore();
  // Body - isometric diamond shape
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.moveTo(sx,sy-8);ctx.lineTo(sx+13,sy-2);ctx.lineTo(sx,sy+4);ctx.lineTo(sx-13,sy-2);ctx.closePath();ctx.fill();
  // Darker side panels
  ctx.fillStyle='rgba(0,0,0,0.2)';
  ctx.beginPath();ctx.moveTo(sx,sy+4);ctx.lineTo(sx+13,sy-2);ctx.lineTo(sx,sy-2);ctx.closePath();ctx.fill();
  // Windshield
  ctx.fillStyle='rgba(80,160,220,0.35)';
  ctx.beginPath();ctx.moveTo(sx-2,sy-6);ctx.lineTo(sx+6,sy-4);ctx.lineTo(sx+2,sy-1);ctx.lineTo(sx-6,sy-3);ctx.closePath();ctx.fill();
  // Headlights
  ctx.fillStyle='rgba(255,240,180,0.6)';ctx.beginPath();ctx.arc(sx-10,sy-1,1.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(sx+1,sy+3,1.5,0,Math.PI*2);ctx.fill();
  // Taillights
  ctx.fillStyle='rgba(255,30,30,0.5)';ctx.beginPath();ctx.arc(sx+10,sy-1,1,0,Math.PI*2);ctx.fill();
}

function drawIsoPersonProp(sx, sy, shirtColor) {
  // Shadow
  ctx.save();ctx.globalAlpha=0.15;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(sx,sy+1,4,2,0,0,Math.PI*2);ctx.fill();ctx.restore();
  // Legs
  ctx.fillStyle='#1a1a2a';ctx.fillRect(sx-3,sy-3,2,4);ctx.fillRect(sx+1,sy-3,2,4);
  // Shoes
  ctx.fillStyle='#111';ctx.fillRect(sx-4,sy,3,2);ctx.fillRect(sx+1,sy,3,2);
  // Torso
  ctx.fillStyle=shirtColor;ctx.fillRect(sx-3,sy-8,6,6);
  // Head
  ctx.fillStyle='#c68642';ctx.beginPath();ctx.arc(sx,sy-10,3,0,Math.PI*2);ctx.fill();
  // Hair/hat
  ctx.fillStyle='#222';ctx.beginPath();ctx.arc(sx,sy-11,2.5,Math.PI,0);ctx.fill();
}

function drawBldgExteriorProps(b, lvl, key) {
  if(lvl<1) return;
  var gMid={x:(b.gSW.x+b.gSE.x)/2,y:(b.gSW.y+b.gSE.y)/2};
  if(key==='clothing'){
    // L1: empty, dark
    // L2: a couple people outside
    // L3: palm trees, more people, bouncer
    // L4: crowd, palm trees, VIP car, bright
    // L5: massive crowd, multiple cars, full palm tree row
    if(lvl>=3){drawIsoPalmTree(b.gNE.x+10,b.gNE.y-2);drawIsoPalmTree(b.gSE.x+12,b.gSE.y-4);}
    if(lvl>=4){drawIsoPalmTree(b.gSW.x-10,b.gSW.y-2);drawIsoPalmTree(b.gNE.x+24,b.gNE.y-4);}
    // People in line — grows into crowd
    if(lvl>=1){drawIsoPersonProp(gMid.x+8,gMid.y+6,'#ff00ff');}
    if(lvl>=2){drawIsoPersonProp(gMid.x+14,gMid.y+4,'#aa00ff');drawIsoPersonProp(gMid.x+2,gMid.y+10,'#cc44aa');}
    if(lvl>=3){drawIsoPersonProp(gMid.x-4,gMid.y+8,'#ff44aa');drawIsoPersonProp(gMid.x+20,gMid.y+2,'#cc00cc');drawIsoPersonProp(gMid.x+10,gMid.y+12,'#aa44cc');}
    if(lvl>=4){drawIsoPersonProp(gMid.x-10,gMid.y+12,'#ff22aa');drawIsoPersonProp(gMid.x+26,gMid.y,'#8800cc');drawIsoPersonProp(gMid.x+16,gMid.y+14,'#dd00ff');
      // Bouncer (big person, dark suit)
      var bn={x:gMid.x,y:gMid.y+4};ctx.fillStyle='#111';ctx.fillRect(bn.x-2,bn.y-3,4,5);ctx.fillStyle='#222';ctx.fillRect(bn.x-3,bn.y-7,6,5);ctx.fillStyle='#daa06d';ctx.beginPath();ctx.arc(bn.x,bn.y-9,2.5,0,Math.PI*2);ctx.fill();
      // VIP car
      drawIsoCarProp(b.gNE.x+18,b.gNE.y+10,'#111');
    }
  } else if(key==='garage'){
    // Chop Shop exterior - grows from empty lot to full car operation
    // Fence/lot boundary at lvl 2+
    if(lvl>=2){
      ctx.strokeStyle='#555';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(b.gNE.x+4,b.gNE.y);ctx.lineTo(b.gNE.x+35+lvl*6,b.gNE.y-6);ctx.lineTo(b.gSE.x+35+lvl*6,b.gSE.y-6);ctx.stroke();
      // Fence posts
      for(var fp=0;fp<3+lvl;fp++){var fpx=b.gNE.x+6+fp*8,fpy=b.gNE.y-1-fp*0.4;ctx.fillStyle='#666';ctx.fillRect(fpx,fpy-5,2,6);}
    }
    // Cars outside - more with each level
    if(lvl>=2){drawIsoCarProp(b.gNE.x+18,b.gNE.y+4,'#cc2200');}
    if(lvl>=3){drawIsoCarProp(b.gNE.x+30,b.gNE.y+2,'#2244cc');drawIsoCarProp(b.gSE.x+16,b.gSE.y-6,'#ffaa00');}
    if(lvl>=4){drawIsoCarProp(b.gNE.x+42,b.gNE.y,'#aa00ff');drawIsoCarProp(b.gSE.x+30,b.gSE.y-8,'#22cc44');drawIsoCarProp(b.gSW.x-14,b.gSW.y+4,'#ff4444');}
    // Toolboxes and equipment outside
    if(lvl>=2){var tb1=b.gSW;ctx.fillStyle='#cc2222';ctx.fillRect(tb1.x-10,tb1.y-4,6,4);ctx.fillStyle='#aa1818';ctx.fillRect(tb1.x-10,tb1.y-6,6,2);}
    if(lvl>=3){var tb2={x:b.gSW.x-16,y:b.gSW.y+2};ctx.fillStyle='#2266cc';ctx.fillRect(tb2.x,tb2.y-3,5,3);ctx.fillStyle='#555';ctx.fillRect(tb2.x-2,tb2.y-5,3,2);}
    // Tires stacked
    if(lvl>=3){var tp={x:b.gNE.x+8,y:b.gNE.y+8};ctx.fillStyle='#222';for(var t=0;t<3;t++){ctx.beginPath();ctx.ellipse(tp.x,tp.y-t*3,4,2.5,0,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#333';ctx.beginPath();ctx.ellipse(tp.x,tp.y-6,3,1.8,0,0,Math.PI*2);ctx.fill();}
    // Oil drums
    if(lvl>=2){var od={x:b.gSE.x+6,y:b.gSE.y};ctx.fillStyle='#3a5a3a';ctx.fillRect(od.x,od.y-6,4,6);ctx.fillStyle='#4a6a4a';ctx.beginPath();ctx.ellipse(od.x+2,od.y-6,2.5,1.5,0,0,Math.PI*2);ctx.fill();}
    // Mechanics (people in coveralls)
    if(lvl>=3){drawIsoPersonProp(b.gSW.x-4,b.gSW.y+6,'#336');}
    if(lvl>=4){drawIsoPersonProp(b.gNE.x+12,b.gNE.y+10,'#336');drawIsoPersonProp(b.gSE.x+8,b.gSE.y+4,'#446');}
  } else if(key==='trapHouse'){
    // L1: quiet, one person on porch
    // L2: porch light on, person + car
    // L3: busier, street lamp, more people, car
    // L4: purple lit windows, yellow car, crowd
    // L5: mansion vibe, multiple cars, people everywhere, street lamps
    if(lvl>=1){drawIsoPersonProp(b.gSW.x-4,b.gSW.y+4,'#884422');}
    if(lvl>=2){drawIsoPersonProp(gMid.x+14,gMid.y+8,'#aa4444');}
    if(lvl>=3){drawIsoCarProp(gMid.x+22,gMid.y+4,'#ccaa00');drawIsoPersonProp(b.gSW.x-10,b.gSW.y+8,'#664422');drawIsoPersonProp(gMid.x+6,gMid.y+12,'#cc4444');}
    if(lvl>=4){drawIsoCarProp(b.gNE.x+16,b.gNE.y+6,'#aa22cc');drawIsoCarProp(b.gSE.x+12,b.gSE.y-4,'#4444cc');drawIsoPersonProp(b.gNE.x+6,b.gNE.y+10,'#662244');drawIsoPersonProp(b.gSW.x-16,b.gSW.y+6,'#886644');drawIsoPersonProp(gMid.x+30,gMid.y+2,'#cc6622');}
    // Street lamp at lvl 3+
    if(lvl>=3){var sl={x:b.gSW.x-18,y:b.gSW.y-2};ctx.strokeStyle='#555';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sl.x,sl.y);ctx.lineTo(sl.x,sl.y-22);ctx.stroke();ctx.strokeStyle='#666';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sl.x,sl.y-22);ctx.lineTo(sl.x+6,sl.y-23);ctx.stroke();ctx.save();ctx.fillStyle='#ffa500';ctx.shadowColor='#ffa500';ctx.shadowBlur=8;ctx.globalAlpha=0.5+0.2*Math.sin(blockFrameCount*0.04);ctx.beginPath();ctx.arc(sl.x+6,sl.y-23,2.5,0,Math.PI*2);ctx.fill();ctx.restore();}
    if(lvl>=4){var sl2={x:b.gNE.x+30,y:b.gNE.y-4};ctx.strokeStyle='#555';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sl2.x,sl2.y);ctx.lineTo(sl2.x,sl2.y-22);ctx.stroke();ctx.strokeStyle='#666';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sl2.x,sl2.y-22);ctx.lineTo(sl2.x-6,sl2.y-23);ctx.stroke();ctx.save();ctx.fillStyle='#ffa500';ctx.shadowColor='#ffa500';ctx.shadowBlur=8;ctx.globalAlpha=0.5+0.2*Math.sin(blockFrameCount*0.05);ctx.beginPath();ctx.arc(sl2.x-6,sl2.y-23,2.5,0,Math.PI*2);ctx.fill();ctx.restore();}
    // Trash/boxes on porch at lvl 2+
    if(lvl>=2){ctx.fillStyle='#4a3a2a';ctx.fillRect(b.gSW.x+2,b.gSW.y-3,4,3);ctx.fillRect(b.gSW.x+7,b.gSW.y-2,3,2);}
  } else if(key==='stashHouse'){
    // L1: small shack, boarded up, a crate outside
    // L2: boxes stacked outside, light in window
    // L3: more boxes/crates, guard outside
    // L4: warehouse loaded, purple interior glow, guard, crates everywhere
    // L5: full compound, overflowing product, multiple guards, car
    // Crates/boxes outside
    if(lvl>=1){ctx.fillStyle='#8a6a40';ctx.fillRect(b.gSW.x-8,b.gSW.y-4,5,4);ctx.fillStyle='#7a5a30';ctx.fillRect(b.gSW.x-8,b.gSW.y-6,5,2);}
    if(lvl>=2){ctx.fillStyle='#6a5030';ctx.fillRect(b.gSW.x-14,b.gSW.y-3,5,3);ctx.fillRect(b.gSW.x-6,b.gSW.y-8,4,4);ctx.fillStyle='#9a7a50';ctx.fillRect(b.gNE.x+4,b.gNE.y-3,6,3);}
    if(lvl>=3){ctx.fillStyle='#7a5a38';ctx.fillRect(b.gNE.x+8,b.gNE.y-4,5,4);ctx.fillRect(b.gNE.x+4,b.gNE.y-7,5,4);ctx.fillStyle='#5a4020';for(var cb=0;cb<3;cb++){ctx.fillRect(b.gSW.x-18+cb*5,b.gSW.y-3-cb*2,4,3);}}
    if(lvl>=4){for(var cb2=0;cb2<4;cb2++){ctx.fillStyle=cb2%2?'#8a6a40':'#6a5030';ctx.fillRect(b.gSE.x+4+cb2*5,b.gSE.y-6-cb2*2,5,4);}
      // Money bag
      ctx.fillStyle='#c9a670';ctx.beginPath();ctx.ellipse(b.gNE.x+16,b.gNE.y+2,4,3,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#aa8844';ctx.font='bold 5px Arial';ctx.textAlign='center';ctx.fillText('$',b.gNE.x+16,b.gNE.y+3);}
    // Guards
    if(lvl>=2){drawIsoPersonProp(b.gNE.x+6,b.gNE.y+6,'#333');}
    if(lvl>=3){drawIsoPersonProp(b.gSW.x-10,b.gSW.y+5,'#333');}
    if(lvl>=4){drawIsoPersonProp(b.gSE.x+10,b.gSE.y+2,'#222');drawIsoCarProp(b.gSW.x-22,b.gSW.y+6,'#333');}
  } else if(key==='vault'){
    // L1: small bank, minimal
    // L2: bushes/plants outside, gold badge
    // L3: more plants, guard posted
    // L4: armored car, guards, ornamental plants
    // L5: full security, helicopter on roof drawn in roof details
    // Ornamental bushes
    if(lvl>=2){
      var drawBush=function(bx,by,sz){ctx.fillStyle='#1a4a1a';ctx.beginPath();ctx.arc(bx,by,sz,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2a6a2a';ctx.beginPath();ctx.arc(bx-1,by-1,sz*0.7,0,Math.PI*2);ctx.fill();};
      drawBush(b.gSW.x-6,b.gSW.y,4);drawBush(b.gNE.x+6,b.gNE.y,4);
    }
    if(lvl>=3){
      var drawBush2=function(bx,by,sz){ctx.fillStyle='#1a4a1a';ctx.beginPath();ctx.arc(bx,by,sz,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2a6a2a';ctx.beginPath();ctx.arc(bx-1,by-1,sz*0.7,0,Math.PI*2);ctx.fill();};
      drawBush2(b.gSW.x-14,b.gSW.y+2,3);drawBush2(b.gNE.x+14,b.gNE.y-2,3);drawBush2(b.gSE.x+8,b.gSE.y-4,4);
    }
    // Security guards (dark suits)
    if(lvl>=2){drawIsoPersonProp(gMid.x+8,gMid.y+6,'#1a1a3a');}
    if(lvl>=3){drawIsoPersonProp(b.gSW.x-4,b.gSW.y+6,'#1a1a3a');}
    if(lvl>=4){drawIsoPersonProp(b.gNE.x+4,b.gNE.y+8,'#1a1a3a');}
    // Armored car at lvl 3+
    if(lvl>=3){var ac={x:b.gNE.x+20,y:b.gNE.y+6};ctx.fillStyle='#222';ctx.beginPath();ctx.moveTo(ac.x-12,ac.y);ctx.lineTo(ac.x-10,ac.y-5);ctx.lineTo(ac.x+10,ac.y-5);ctx.lineTo(ac.x+12,ac.y);ctx.closePath();ctx.fill();ctx.fillStyle='#333';ctx.beginPath();ctx.moveTo(ac.x-6,ac.y-5);ctx.lineTo(ac.x-4,ac.y-9);ctx.lineTo(ac.x+4,ac.y-9);ctx.lineTo(ac.x+6,ac.y-5);ctx.closePath();ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(ac.x-7,ac.y+1,2.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(ac.x+7,ac.y+1,2.5,0,Math.PI*2);ctx.fill();
      // Gold "$" on side
      ctx.fillStyle='#ffd700';ctx.font='bold 5px Arial';ctx.textAlign='center';ctx.fillText('$',ac.x,ac.y-2);}
    // Bollards/posts at entrance
    if(lvl>=2){for(var bl=0;bl<2;bl++){var blx=gMid.x+bl*12-6,bly=gMid.y+10;ctx.fillStyle='#888';ctx.fillRect(blx,bly-4,2,4);ctx.fillStyle='#ffd700';ctx.beginPath();ctx.arc(blx+1,bly-5,1.5,0,Math.PI*2);ctx.fill();}}
  }
}

function drawIsoBuilding2(b, lvl, key, selected) {
  var st2 = getIsoStyle(key, lvl);
  // Ground light pool at higher levels
  if(lvl>=2){
    var glowColor=key==='clothing'?'rgba(200,0,255,':key==='trapHouse'&&lvl>=4?'rgba(160,60,220,':'rgba(255,180,60,';
    if(key==='vault') glowColor='rgba(255,215,0,';
    if(key==='garage') glowColor='rgba(50,200,80,';
    if(key==='stashHouse'&&lvl>=4) glowColor='rgba(160,60,220,';
    var gcx=(b.gSW.x+b.gSE.x+b.gNE.x)/3, gcy=(b.gSW.y+b.gSE.y+b.gNE.y)/3;
    var gr=ctx.createRadialGradient(gcx,gcy,0,gcx,gcy,30+lvl*8);
    gr.addColorStop(0,glowColor+(0.06+lvl*0.02)+')');
    gr.addColorStop(1,glowColor+'0)');
    ctx.save();ctx.fillStyle=gr;ctx.beginPath();ctx.arc(gcx,gcy,30+lvl*8,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  // Ground platform/foundation
  ctx.save(); ctx.globalAlpha=0.2+lvl*0.03; ctx.fillStyle='#111';
  ctx.beginPath();
  ctx.moveTo(b.gNW.x,b.gNW.y+3); ctx.lineTo(b.gNE.x,b.gNE.y+3);
  ctx.lineTo(b.gSE.x,b.gSE.y+3); ctx.lineTo(b.gSW.x,b.gSW.y+3);
  ctx.closePath(); ctx.fill(); ctx.restore();
  // Left wall with gradient
  var lwG=ctx.createLinearGradient(b.gSW.x,b.gSW.y,b.tSW.x,b.tSW.y);
  lwG.addColorStop(0,st2.lw); lwG.addColorStop(1,st2.trim);
  ctx.fillStyle=lwG; ctx.beginPath();
  ctx.moveTo(b.gSW.x,b.gSW.y); ctx.lineTo(b.tSW.x,b.tSW.y);
  ctx.lineTo(b.tSE.x,b.tSE.y); ctx.lineTo(b.gSE.x,b.gSE.y);
  ctx.closePath(); ctx.fill();
  // Right wall with gradient
  var rwG=ctx.createLinearGradient(b.gNE.x,b.gNE.y,b.tNE.x,b.tNE.y);
  rwG.addColorStop(0,st2.rw); rwG.addColorStop(1,st2.trim);
  ctx.fillStyle=rwG; ctx.beginPath();
  ctx.moveTo(b.gNE.x,b.gNE.y); ctx.lineTo(b.tNE.x,b.tNE.y);
  ctx.lineTo(b.tSE.x,b.tSE.y); ctx.lineTo(b.gSE.x,b.gSE.y);
  ctx.closePath(); ctx.fill();
  // Roof with two-tone
  ctx.fillStyle=st2.rf; ctx.beginPath();
  ctx.moveTo(b.tNW.x,b.tNW.y); ctx.lineTo(b.tNE.x,b.tNE.y);
  ctx.lineTo(b.tSE.x,b.tSE.y); ctx.lineTo(b.tSW.x,b.tSW.y);
  ctx.closePath(); ctx.fill();
  // Roof inner border
  var ri=4;
  var riNW=roofPt(b,0.06,0.06),riNE=roofPt(b,0.94,0.06),riSE=roofPt(b,0.94,0.94),riSW=roofPt(b,0.06,0.94);
  ctx.fillStyle=st2.rf2; ctx.beginPath();
  ctx.moveTo(riNW.x,riNW.y); ctx.lineTo(riNE.x,riNE.y);
  ctx.lineTo(riSE.x,riSE.y); ctx.lineTo(riSW.x,riSW.y);
  ctx.closePath(); ctx.fill();
  // Edges - thicker for definition
  ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(b.gSW.x,b.gSW.y); ctx.lineTo(b.tSW.x,b.tSW.y);
  ctx.moveTo(b.gSE.x,b.gSE.y); ctx.lineTo(b.tSE.x,b.tSE.y);
  ctx.moveTo(b.gNE.x,b.gNE.y); ctx.lineTo(b.tNE.x,b.tNE.y);
  ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(b.tNW.x,b.tNW.y); ctx.lineTo(b.tNE.x,b.tNE.y);
  ctx.lineTo(b.tSE.x,b.tSE.y); ctx.lineTo(b.tSW.x,b.tSW.y);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.gSW.x,b.gSW.y); ctx.lineTo(b.gSE.x,b.gSE.y);
  ctx.lineTo(b.gNE.x,b.gNE.y); ctx.stroke();
  // Ambient occlusion at base
  ctx.save(); ctx.globalAlpha=0.15;
  ctx.strokeStyle='#000'; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(b.gSW.x,b.gSW.y); ctx.lineTo(b.gSE.x,b.gSE.y);
  ctx.lineTo(b.gNE.x,b.gNE.y); ctx.stroke();
  ctx.restore();
  drawBldgWallDetails(b, lvl, key);
  drawBldgRoofDetails(b, lvl, key);
  if (selected) {
    ctx.save(); ctx.strokeStyle='#ffd700'; ctx.lineWidth=3;
    ctx.shadowColor='#ffd700'; ctx.shadowBlur=14;
    drawBldgOutline(b); ctx.restore();
  }
}

function drawBldgWallDetails(b, lvl, key) {
  var lbl=b.gSW,lbr=b.gSE,ltl=b.tSW,ltr=b.tSE;
  var rbl=b.gNE,rbr=b.gSE,rtl=b.tNE,rtr=b.tSE;
  if (key==='trapHouse') {
    // L1: dark house, boarded windows, "TRAP" graffiti
    // L2: some windows lit warm orange, porch light
    // L3: more windows lit, busier
    // L4: windows go purple (party/lean vibe), busy
    // L5: all windows purple+warm, fully lit, mansion energy
    var winColor=lvl>=4?'rgba(160,60,220,0.6)':lvl>=2?'rgba(255,160,40,0.6)':'rgba(15,10,10,0.8)';
    var winColorLit=lvl>=4?'rgba(180,80,255,0.5)':'rgba(255,160,40,0.5)';
    // Wood siding
    ctx.strokeStyle='rgba(0,0,0,0.08)';ctx.lineWidth=0.5;
    for(var vv=0.08;vv<0.95;vv+=0.05){var ps1=wallPt(lbl,lbr,ltl,ltr,0,vv),ps2=wallPt(lbl,lbr,ltl,ltr,1,vv);ctx.beginPath();ctx.moveTo(ps1.x,ps1.y);ctx.lineTo(ps2.x,ps2.y);ctx.stroke();}
    // Windows — rows x cols, lit count grows with level
    var nRows=lvl>=3?2:lvl>=1?2:1,nCols=lvl>=4?4:3;
    for(var r=0;r<nRows;r++) for(var c=0;c<nCols;c++){
      var u1=0.04+c*(0.92/nCols),u2=u1+0.72/nCols,v1=0.52-r*0.28,v2=v1+0.2;
      var litN=(r*nCols+c)<lvl*2;
      wallQuad(lbl,lbr,ltl,ltr,u1-0.01,v1-0.01,u2+0.01,v2+0.01,'#2a1a10');
      wallQuad(lbl,lbr,ltl,ltr,u1,v1,u2,v2,litN?winColor:'rgba(15,10,10,0.8)');
      if(litN){wallQuad(lbl,lbr,ltl,ltr,u1+(u2-u1)*0.45,v1,u1+(u2-u1)*0.55,v2,'rgba(0,0,0,0.3)');wallQuad(lbl,lbr,ltl,ltr,u1,v1+(v2-v1)*0.45,u2,v1+(v2-v1)*0.55,'rgba(0,0,0,0.3)');}
      if(!litN&&lvl<=1){wallQuad(lbl,lbr,ltl,ltr,u1+0.02,v1+0.04,u2-0.02,v1+0.06,'#5a3a1a');wallQuad(lbl,lbr,ltl,ltr,u1+0.02,v1+0.12,u2-0.02,v1+0.14,'#5a3a1a');}
    }
    // Door with porch step
    wallQuad(lbl,lbr,ltl,ltr,0.32,0.0,0.68,0.02,'#4a3020');
    wallQuad(lbl,lbr,ltl,ltr,0.35,0.0,0.65,0.36,'#1a0808');
    wallQuad(lbl,lbr,ltl,ltr,0.37,0.02,0.63,0.34,lvl>=3?'#2a1218':'#2a1212');
    var dk=wallPt(lbl,lbr,ltl,ltr,0.58,0.16);ctx.fillStyle='#aa8844';ctx.beginPath();ctx.arc(dk.x,dk.y,1.5,0,Math.PI*2);ctx.fill();
    // "TRAP" graffiti — always there, gets bolder
    var gp=wallPt(lbl,lbr,ltl,ltr,0.08,0.4);
    ctx.save();ctx.fillStyle=lvl>=3?'rgba(255,50,50,0.55)':'rgba(255,50,50,0.3)';ctx.font='bold '+(7+lvl)+'px Arial';ctx.textAlign='left';ctx.fillText('TRAP',gp.x,gp.y);ctx.restore();
    // Right wall windows
    var rwN=Math.min(3,1+lvl);
    for(var r2=0;r2<rwN;r2++){var rwu1=0.08+r2*(0.84/rwN),rwu2=rwu1+0.6/rwN;
      wallQuad(rbl,rbr,rtl,rtr,rwu1,0.5,rwu2,0.72,r2<lvl?winColorLit:'rgba(10,8,8,0.6)');
      wallQuad(rbl,rbr,rtl,rtr,rwu1-0.01,0.49,rwu2+0.01,0.73,'rgba(0,0,0,0.15)');}
    // Porch light
    if(lvl>=1){var pl=wallPt(lbl,lbr,ltl,ltr,0.7,0.36);ctx.save();ctx.fillStyle='#ffa500';ctx.shadowColor='#ffa500';ctx.shadowBlur=6+lvl*3;ctx.globalAlpha=0.5+0.2*Math.sin(blockFrameCount*0.05);ctx.beginPath();ctx.arc(pl.x,pl.y,2+lvl*0.5,0,Math.PI*2);ctx.fill();ctx.restore();}
    // Second porch light at lvl 3+
    if(lvl>=3){var pl2=wallPt(lbl,lbr,ltl,ltr,0.15,0.36);ctx.save();ctx.fillStyle='#ffa500';ctx.shadowColor='#ffa500';ctx.shadowBlur=8;ctx.globalAlpha=0.35;ctx.beginPath();ctx.arc(pl2.x,pl2.y,2,0,Math.PI*2);ctx.fill();ctx.restore();}
    // Purple interior glow spilling from door at lvl 4+
    if(lvl>=4){ctx.save();var dg=wallPt(lbl,lbr,ltl,ltr,0.5,0.1);var dgr=ctx.createRadialGradient(dg.x,dg.y,0,dg.x,dg.y,12);dgr.addColorStop(0,'rgba(160,60,220,0.2)');dgr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=dgr;ctx.fillRect(dg.x-15,dg.y-10,30,20);ctx.restore();}
  } else if (key==='garage') {
    // L1: single closed garage bay
    // L2: bay open with green light, car silhouette inside
    // L3: two bays, both open, cars inside, tools
    // L4+: wide open bays, cars visible, bright green neon sign
    var nBays=lvl>=3?2:1;
    var bayW=0.84/nBays;
    for(var bay=0;bay<nBays;bay++){
      var bx1=0.08+bay*bayW,bx2=bx1+bayW-0.02;
      // Garage door frame
      wallQuad(lbl,lbr,ltl,ltr,bx1,0.0,bx2,0.55,'#3a4248');
      if(lvl<=1){
        // Closed door with panels
        wallQuad(lbl,lbr,ltl,ltr,bx1+0.01,0.01,bx2-0.01,0.54,'#4a5560');
        for(var pan=0;pan<4;pan++){wallQuad(lbl,lbr,ltl,ltr,bx1+0.02,0.03+pan*0.13,bx2-0.02,0.04+pan*0.13,'#3a4550');}
        wallQuad(lbl,lbr,ltl,ltr,(bx1+bx2)/2-0.05,0.02,(bx1+bx2)/2+0.05,0.04,'#888');
      } else {
        // Open bay - dark interior with green work light
        wallQuad(lbl,lbr,ltl,ltr,bx1+0.01,0.0,bx2-0.01,0.5,'#0a0e0a');
        // Green interior glow
        ctx.save();var gi=wallPt(lbl,lbr,ltl,ltr,(bx1+bx2)/2,0.25);
        var gg=ctx.createRadialGradient(gi.x,gi.y,0,gi.x,gi.y,15+lvl*3);
        gg.addColorStop(0,'rgba(50,200,80,'+(0.12+lvl*0.04)+')');gg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=gg;ctx.fillRect(gi.x-25,gi.y-20,50,40);ctx.restore();
        // Car silhouette inside bay
        var carY=0.18;
        wallQuad(lbl,lbr,ltl,ltr,bx1+0.06,carY,bx2-0.06,carY+0.12,'#1a1a1a');
        wallQuad(lbl,lbr,ltl,ltr,bx1+0.1,carY+0.12,bx2-0.1,carY+0.17,'#151515');
        // Headlights
        var hl=wallPt(lbl,lbr,ltl,ltr,bx1+0.08,carY+0.06);
        ctx.fillStyle='rgba(255,240,180,0.5)';ctx.beginPath();ctx.arc(hl.x,hl.y,1.5,0,Math.PI*2);ctx.fill();
        var hr=wallPt(lbl,lbr,ltl,ltr,bx2-0.08,carY+0.06);
        ctx.fillStyle='rgba(255,240,180,0.5)';ctx.beginPath();ctx.arc(hr.x,hr.y,1.5,0,Math.PI*2);ctx.fill();
        // Lift/jack at higher levels
        if(lvl>=3&&bay===0){wallQuad(lbl,lbr,ltl,ltr,bx1+0.04,0.0,bx1+0.06,0.15,'#cc3333');}
      }
    }
    // "CHOP SHOP" sign - goes from plain to green neon
    wallQuad(lbl,lbr,ltl,ltr,0.1,0.58,0.9,0.73,lvl>=2?'#2a3a2a':'#2a3a3a');
    var cs=wallPt(lbl,lbr,ltl,ltr,0.5,0.68);
    ctx.save();
    ctx.fillStyle=lvl>=3?'#44ee66':lvl>=2?'#33aa44':'#556';
    if(lvl>=2){ctx.shadowColor='#33cc44';ctx.shadowBlur=4+lvl*3;}
    ctx.font='bold '+(7+lvl)+'px Arial';ctx.textAlign='center';ctx.fillText('CHOP SHOP',cs.x,cs.y);ctx.restore();
    // Green neon trim at lvl 3+
    if(lvl>=3){ctx.save();ctx.strokeStyle='rgba(50,200,80,'+(0.3+lvl*0.08)+')';ctx.lineWidth=1.5;ctx.shadowColor='#33cc44';ctx.shadowBlur=6+lvl*2;
      ctx.beginPath();ctx.moveTo(ltl.x,ltl.y);ctx.lineTo(ltr.x,ltr.y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(lbl.x,lbl.y);ctx.lineTo(lbr.x,lbr.y);ctx.stroke();ctx.restore();}
    // Upper windows
    for(var uw=0;uw<2;uw++){wallQuad(lbl,lbr,ltl,ltr,0.1+uw*0.45,0.78,0.45+uw*0.45,0.9,uw<lvl?'rgba(100,200,150,0.4)':'rgba(20,30,40,0.5)');}
    // Right wall - side door
    wallQuad(rbl,rbr,rtl,rtr,0.3,0.0,0.6,0.35,'#3a4550');
    // Right wall windows - more light up
    for(var rw=0;rw<2;rw++){wallQuad(rbl,rbr,rtl,rtr,0.1+rw*0.45,0.5,0.4+rw*0.45,0.7,rw<lvl?'rgba(100,200,150,0.3)':'rgba(20,30,40,0.5)');}
    // Right wall sign at high level
    if(lvl>=4){var rs2=wallPt(rbl,rbr,rtl,rtr,0.5,0.88);ctx.save();ctx.fillStyle='#33cc44';ctx.shadowColor='#33cc44';ctx.shadowBlur=6;ctx.font='bold 6px Arial';ctx.textAlign='center';ctx.fillText('OPEN 24/7',rs2.x,rs2.y);ctx.restore();}
  } else if (key==='clothing') {
    var np=0.5+0.5*Math.sin(blockFrameCount*0.06);
    var neonA=0.4+lvl*0.12+np*0.3;
    var neonBlur=6+lvl*4+np*6;
    // Neon trim - scales with level
    ctx.save();ctx.strokeStyle='rgba(255,0,255,'+neonA+')';ctx.lineWidth=2+lvl*0.5;
    ctx.shadowColor='#ff00ff';ctx.shadowBlur=neonBlur;
    ctx.beginPath();ctx.moveTo(ltl.x,ltl.y);ctx.lineTo(ltr.x,ltr.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(lbl.x,lbl.y);ctx.lineTo(lbr.x,lbr.y);ctx.stroke();ctx.restore();
    // "CLUB" neon sign - bigger with level
    var sp2=wallPt(lbl,lbr,ltl,ltr,0.5,0.88);
    ctx.save();ctx.fillStyle='rgba(255,100,255,'+(0.7+np*0.3)+')';ctx.shadowColor='#ff00ff';ctx.shadowBlur=neonBlur;
    ctx.font='bold '+(10+lvl*2)+'px Arial';ctx.textAlign='center';ctx.fillText('CLUB',sp2.x,sp2.y);ctx.restore();
    // Windows - more light with level
    var wc=['#ff00ff','#00ffff','#ff0066','#6600ff'];
    var nWin=Math.min(4,2+lvl);
    for(var r3=0;r3<nWin;r3++){
      var vy1=0.12+r3*0.18,vy2=vy1+0.13;
      wallQuad(lbl,lbr,ltl,ltr,0.05,vy1,0.95,vy2,'rgba(8,3,18,0.9)');
      wallQuad(lbl,lbr,ltl,ltr,0.06,vy1+0.01,0.94,vy2-0.01,'rgba(15,5,30,0.7)');
      if(r3<lvl+1){ctx.globalAlpha=0.3+0.2*Math.sin(blockFrameCount*0.08+r3);
        wallQuad(lbl,lbr,ltl,ltr,0.07,vy1+0.02,0.93,vy2-0.02,wc[(r3+Math.floor(blockFrameCount/20))%wc.length]);ctx.globalAlpha=1;}
    }
    // Door with velvet rope
    wallQuad(lbl,lbr,ltl,ltr,0.36,0.0,0.64,0.12,'#080315');
    if(lvl>=1){var rp1=wallPt(lbl,lbr,ltl,ltr,0.28,0.06),rp2=wallPt(lbl,lbr,ltl,ltr,0.72,0.06);
      ctx.fillStyle=lvl>=3?'#ffd700':'#888';ctx.beginPath();ctx.arc(rp1.x,rp1.y,1.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(rp2.x,rp2.y,1.5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=lvl>=3?'#ff0066':'#cc0044';ctx.lineWidth=1.5+lvl*0.3;ctx.beginPath();ctx.moveTo(rp1.x,rp1.y);ctx.quadraticCurveTo((rp1.x+rp2.x)/2,(rp1.y+rp2.y)/2+4,rp2.x,rp2.y);ctx.stroke();}
    // Right wall neon - scales
    ctx.save();ctx.strokeStyle='rgba(255,0,255,'+(0.3+lvl*0.1+np*0.2)+')';ctx.lineWidth=1.5+lvl*0.3;ctx.shadowColor='#ff00ff';ctx.shadowBlur=4+lvl*2;
    ctx.beginPath();ctx.moveTo(rtl.x,rtl.y);ctx.lineTo(rtr.x,rtr.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(rbl.x,rbl.y);ctx.lineTo(rbr.x,rbr.y);ctx.stroke();ctx.restore();
    for(var r4=0;r4<Math.min(3,1+lvl);r4++){wallQuad(rbl,rbr,rtl,rtr,0.1,0.2+r4*0.25,0.6,0.4+r4*0.25,r4<lvl?'rgba(180,0,255,0.2)':'rgba(10,5,20,0.5)');}
  } else if (key==='stashHouse') {
    // L1: small shack, boarded windows, heavy door
    // L2: windows with warm light, stash visible
    // L3: more windows, reinforced, interior glow
    // L4: warehouse style, purple interior glow, stash overflowing
    // L5: full compound, neon interior, loaded
    var stashGlow=lvl>=4?'rgba(160,60,220,0.3)':lvl>=2?'rgba(255,180,80,0.35)':'rgba(10,8,5,0.8)';
    // Brick/wood texture on both walls
    ctx.strokeStyle='rgba(0,0,0,0.1)';ctx.lineWidth=0.5;
    for(var v2=0.06;v2<0.95;v2+=0.05){var p1s=wallPt(lbl,lbr,ltl,ltr,0,v2),p2s=wallPt(lbl,lbr,ltl,ltr,1,v2);ctx.beginPath();ctx.moveTo(p1s.x,p1s.y);ctx.lineTo(p2s.x,p2s.y);ctx.stroke();}
    for(var v3=0.06;v3<0.95;v3+=0.05){var p1r=wallPt(rbl,rbr,rtl,rtr,0,v3),p2r=wallPt(rbl,rbr,rtl,rtr,1,v3);ctx.beginPath();ctx.moveTo(p1r.x,p1r.y);ctx.lineTo(p2r.x,p2r.y);ctx.stroke();}
    // Heavy steel door — gets reinforced with level
    wallQuad(lbl,lbr,ltl,ltr,0.3,0.0,0.7,0.4,lvl>=3?'#2a2a38':'#4a4a55');
    wallQuad(lbl,lbr,ltl,ltr,0.32,0.02,0.68,0.38,lvl>=3?'#3a3a4a':'#555568');
    for(var i2=0;i2<Math.min(6,2+lvl);i2++){var bp=wallPt(lbl,lbr,ltl,ltr,0.34+i2*0.055,0.36);ctx.fillStyle=lvl>=3?'#aaa':'#888';ctx.beginPath();ctx.arc(bp.x,bp.y,1.2+lvl*0.1,0,Math.PI*2);ctx.fill();}
    var dh=wallPt(lbl,lbr,ltl,ltr,0.62,0.2);ctx.fillStyle='#777';ctx.fillRect(dh.x-1,dh.y-3,2,6);
    // Barred windows — more appear with level, interior glow visible
    var stWins=lvl>=3?3:2;
    var stWinW=0.2;
    for(var sw=0;sw<stWins;sw++){
      var su1=0.04+sw*(0.92/stWins),su2=su1+stWinW;
      if(su1>0.28&&su1<0.72) continue;
      wallQuad(lbl,lbr,ltl,ltr,su1,0.55,su2,0.75,sw<lvl?stashGlow:'#0a0a0a');
      // Bars
      for(var bar=0;bar<3;bar++){var baru=su1+0.03+bar*((su2-su1-0.06)/2);var bp1=wallPt(lbl,lbr,ltl,ltr,baru,0.55),bp2=wallPt(lbl,lbr,ltl,ltr,baru,0.75);ctx.strokeStyle='#777';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(bp1.x,bp1.y);ctx.lineTo(bp2.x,bp2.y);ctx.stroke();}
      // Stash bags visible through windows
      if(sw<lvl&&lvl>=2){for(var sb=0;sb<Math.min(2,lvl-1);sb++){var sbp=wallPt(lbl,lbr,ltl,ltr,su1+0.04+sb*0.06,0.62);ctx.fillStyle='#c9a670';ctx.beginPath();ctx.ellipse(sbp.x,sbp.y,2,2,0,0,Math.PI*2);ctx.fill();}}
    }
    // $ symbol above door at lvl 2+
    if(lvl>=2){var dp=wallPt(lbl,lbr,ltl,ltr,0.5,0.44);ctx.save();ctx.fillStyle='#ffd700';if(lvl>=3){ctx.shadowColor='#ffd700';ctx.shadowBlur=4+lvl;}ctx.font='bold '+(7+lvl)+'px Arial';ctx.textAlign='center';ctx.fillText('$',dp.x,dp.y);ctx.restore();}
    // Right wall — more windows with level
    var rwStash=Math.min(2,lvl);
    for(var rws=0;rws<rwStash;rws++){wallQuad(rbl,rbr,rtl,rtr,0.15+rws*0.4,0.5,0.45+rws*0.4,0.7,rws<lvl?stashGlow:'#111');}
    // Purple interior glow from door at lvl 4+
    if(lvl>=4){ctx.save();var sg=wallPt(lbl,lbr,ltl,ltr,0.5,0.15);var sgr=ctx.createRadialGradient(sg.x,sg.y,0,sg.x,sg.y,12);sgr.addColorStop(0,'rgba(160,60,220,0.2)');sgr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sgr;ctx.fillRect(sg.x-15,sg.y-10,30,20);ctx.restore();}
  } else if (key==='vault') {
    // Stone block texture
    ctx.strokeStyle='rgba(0,0,0,0.08)';ctx.lineWidth=0.5;
    for(var vv2=0.1;vv2<0.9;vv2+=0.08){var ps1=wallPt(lbl,lbr,ltl,ltr,0,vv2),ps2=wallPt(lbl,lbr,ltl,ltr,1,vv2);ctx.beginPath();ctx.moveTo(ps1.x,ps1.y);ctx.lineTo(ps2.x,ps2.y);ctx.stroke();}
    // Columns with capitals
    for(var c2=0;c2<3;c2++){var u=0.12+c2*0.3;
      wallQuad(lbl,lbr,ltl,ltr,u,0.08,u+0.08,0.88,'#c8c4b8');
      wallQuad(lbl,lbr,ltl,ltr,u-0.01,0.85,u+0.09,0.9,'#d8d4c8');
      wallQuad(lbl,lbr,ltl,ltr,u-0.01,0.06,u+0.09,0.1,'#d8d4c8');
      wallQuad(lbl,lbr,ltl,ltr,u+0.01,0.12,u+0.07,0.84,'#b8b4a8');}
    // Vault door - grows with level
    var dc=wallPt(lbl,lbr,ltl,ltr,0.5,0.3),vr=10+lvl*2;
    ctx.save();
    if(lvl>=3){ctx.shadowColor='#ffd700';ctx.shadowBlur=8+lvl*2;}
    ctx.fillStyle=lvl>=3?'#ffd700':lvl>=2?'#ddc060':lvl>=1?'#bbb':'#666';ctx.beginPath();ctx.arc(dc.x,dc.y,vr,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=lvl>=3?'#aa8800':'#333';ctx.lineWidth=1.5+lvl*0.3;ctx.stroke();ctx.restore();
    ctx.strokeStyle=lvl>=3?'#aa8800':'#555';ctx.lineWidth=0.8;ctx.beginPath();ctx.arc(dc.x,dc.y,vr*0.7,0,Math.PI*2);ctx.stroke();
    for(var s2=0;s2<8;s2++){var a=s2*Math.PI/4;ctx.beginPath();ctx.moveTo(dc.x+Math.cos(a)*vr*0.25,dc.y+Math.sin(a)*vr*0.25);ctx.lineTo(dc.x+Math.cos(a)*vr*0.65,dc.y+Math.sin(a)*vr*0.65);ctx.stroke();}
    ctx.fillStyle=lvl>=3?'#aa8800':'#333';ctx.beginPath();ctx.arc(dc.x,dc.y,vr*0.15,0,Math.PI*2);ctx.fill();
    // "BANK" text - bigger with level
    var bl2=wallPt(lbl,lbr,ltl,ltr,0.5,0.92);
    ctx.save();ctx.fillStyle='#ffd700';if(lvl>=2){ctx.shadowColor='#ffd700';ctx.shadowBlur=4+lvl*2;}
    ctx.font='bold '+(8+lvl*2)+'px Arial Black,Impact,sans-serif';ctx.textAlign='center';ctx.fillText('BANK',bl2.x,bl2.y);ctx.restore();
    // Right wall - side windows
    for(var rw=0;rw<2;rw++){wallQuad(rbl,rbr,rtl,rtr,0.15+rw*0.4,0.5,0.4+rw*0.4,0.7,lvl>=1?'rgba(255,215,100,0.15)':'rgba(20,20,30,0.5)');}
  }
}

function drawBldgRoofDetails(b, lvl, key) {
  if (key==='trapHouse') {
    // Peaked shingle roof
    var rs=roofPt(b,0.5,0),re=roofPt(b,0.5,1),pH=14;
    ctx.fillStyle='#5a2a1a';ctx.beginPath();
    ctx.moveTo(b.tNW.x,b.tNW.y);ctx.lineTo(rs.x,rs.y-pH);ctx.lineTo(re.x,re.y-pH);ctx.lineTo(b.tSW.x,b.tSW.y);ctx.closePath();ctx.fill();
    ctx.fillStyle='#3a1808';ctx.beginPath();
    ctx.moveTo(b.tNE.x,b.tNE.y);ctx.lineTo(rs.x,rs.y-pH);ctx.lineTo(re.x,re.y-pH);ctx.lineTo(b.tSE.x,b.tSE.y);ctx.closePath();ctx.fill();
    // Shingle lines
    ctx.strokeStyle='rgba(0,0,0,0.15)';ctx.lineWidth=0.5;
    for(var sh=0.2;sh<1;sh+=0.2){var sl=roofPt(b,0.5-sh*0.5,sh),sr=roofPt(b,0.5,sh);ctx.beginPath();ctx.moveTo(sl.x,sl.y);ctx.lineTo(sr.x,sr.y-pH*(1-sh));ctx.stroke();}
    ctx.strokeStyle='#6a3020';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(rs.x,rs.y-pH);ctx.lineTo(re.x,re.y-pH);ctx.stroke();
    // Chimney
    var ch=roofPt(b,0.75,0.25);ctx.fillStyle='#6a4030';ctx.fillRect(ch.x-5,ch.y-pH-12,10,pH+12);
    ctx.fillStyle='#4a2a1a';ctx.fillRect(ch.x-6,ch.y-pH-14,12,3);
    ctx.fillStyle='#5a3828';ctx.fillRect(ch.x-6,ch.y-pH-2,12,3);
    // Smoke
    if(lvl>=1){ctx.save();ctx.globalAlpha=0.12+0.08*Math.sin(blockFrameCount*0.05);ctx.fillStyle='#999';
      for(var s=0;s<4;s++){ctx.beginPath();ctx.arc(ch.x+Math.sin(blockFrameCount*0.025+s*1.5)*5,ch.y-pH-18-s*6-Math.sin(blockFrameCount*0.02)*3,2+s*0.8,0,Math.PI*2);ctx.fill();}ctx.restore();}
  } else if (key==='garage') {
    // Flat concrete roof - more equipment with level
    // AC/vent units
    var vt1=roofPt(b,0.82,0.12);
    ctx.fillStyle='#4a5555';ctx.fillRect(vt1.x-5,vt1.y-4,10,8);ctx.strokeStyle='#3a4545';ctx.lineWidth=0.5;ctx.strokeRect(vt1.x-5,vt1.y-4,10,8);
    if(lvl>=2){var vt2=roofPt(b,0.15,0.8);ctx.fillStyle='#505858';ctx.fillRect(vt2.x-4,vt2.y-3,8,6);}
    if(lvl>=3){var vt3=roofPt(b,0.5,0.15);ctx.fillStyle='#4a5555';ctx.fillRect(vt3.x-6,vt3.y-5,12,10);ctx.fillStyle='#555';ctx.beginPath();ctx.arc(vt3.x,vt3.y,3,0,Math.PI*2);ctx.fill();}
    // Oil stains - more with level
    ctx.save();ctx.globalAlpha=0.08+lvl*0.02;ctx.fillStyle='#1a1a1a';
    var oil1=roofPt(b,0.4,0.4);ctx.beginPath();ctx.ellipse(oil1.x,oil1.y,6+lvl*2,4+lvl,-0.5,0,Math.PI*2);ctx.fill();
    if(lvl>=2){var oil2=roofPt(b,0.6,0.65);ctx.beginPath();ctx.ellipse(oil2.x,oil2.y,5+lvl,3+lvl,-0.3,0,Math.PI*2);ctx.fill();}
    if(lvl>=3){var oil3=roofPt(b,0.25,0.6);ctx.beginPath();ctx.ellipse(oil3.x,oil3.y,4,3,0,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    // Exhaust pipes at high levels
    if(lvl>=3){var ep=roofPt(b,0.9,0.5);ctx.fillStyle='#555';ctx.beginPath();ctx.arc(ep.x,ep.y,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#444';ctx.beginPath();ctx.arc(ep.x,ep.y,2,0,Math.PI*2);ctx.fill();
      if(lvl>=4){ctx.save();ctx.globalAlpha=0.1+0.05*Math.sin(blockFrameCount*0.06);ctx.fillStyle='#888';for(var sm=0;sm<3;sm++){ctx.beginPath();ctx.arc(ep.x+Math.sin(blockFrameCount*0.03+sm)*3,ep.y-4-sm*3,1.5+sm*0.4,0,Math.PI*2);ctx.fill();}ctx.restore();}}
    // Antenna
    var ant=roofPt(b,0.92,0.92);ctx.strokeStyle='#666';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ant.x,ant.y);ctx.lineTo(ant.x,ant.y-8);ctx.stroke();ctx.fillStyle='#888';ctx.beginPath();ctx.arc(ant.x,ant.y-8,1.5,0,Math.PI*2);ctx.fill();
  } else if (key==='clothing') {
    var np=0.5+0.5*Math.sin(blockFrameCount*0.06);
    var neonA2=0.3+lvl*0.12+np*0.3;
    var neonBlur2=4+lvl*4+np*4;
    // Neon roof border - scales with level
    ctx.save();ctx.strokeStyle='rgba(255,0,255,'+neonA2+')';ctx.lineWidth=1.5+lvl*0.5;ctx.shadowColor='#ff00ff';ctx.shadowBlur=neonBlur2;
    ctx.beginPath();ctx.moveTo(b.tNW.x,b.tNW.y);ctx.lineTo(b.tNE.x,b.tNE.y);ctx.lineTo(b.tSE.x,b.tSE.y);ctx.lineTo(b.tSW.x,b.tSW.y);ctx.closePath();ctx.stroke();ctx.restore();
    // Spotlights - appear at lvl 1, get bigger
    if(lvl>=1){ctx.save();ctx.globalAlpha=0.08+0.04*lvl+0.04*np;
      var spH=30+lvl*10;
      var sp1=roofPt(b,0.25,0.5),sp2=roofPt(b,0.75,0.5);
      ctx.fillStyle='#ff00ff';ctx.beginPath();ctx.moveTo(sp1.x,sp1.y);ctx.lineTo(sp1.x-15-lvl*4+Math.sin(blockFrameCount*0.025)*12,sp1.y-spH);ctx.lineTo(sp1.x+6+lvl*2+Math.sin(blockFrameCount*0.025)*12,sp1.y-spH);ctx.closePath();ctx.fill();
      ctx.fillStyle='#00ffff';ctx.beginPath();ctx.moveTo(sp2.x,sp2.y);ctx.lineTo(sp2.x+8-Math.sin(blockFrameCount*0.03)*10,sp2.y-spH+5);ctx.lineTo(sp2.x+22+lvl*3-Math.sin(blockFrameCount*0.03)*10,sp2.y-spH+5);ctx.closePath();ctx.fill();ctx.restore();}
    // DJ/music symbols
    var mn=roofPt(b,0.5,0.5);ctx.fillStyle='rgba(255,0,255,'+(0.35+np*0.25)+')';ctx.font='12px Arial';ctx.textAlign='center';
    ctx.fillText('♪',mn.x-8+Math.sin(blockFrameCount*0.04)*4,mn.y);ctx.fillText('♫',mn.x+10+Math.cos(blockFrameCount*0.03)*4,mn.y-3);
    // Helipad at lvl 4+
    if(lvl>=4){ctx.save();ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=1.5;var hp=roofPt(b,0.5,0.5);ctx.beginPath();ctx.arc(hp.x,hp.y,12,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.12)';ctx.font='bold 10px Arial';ctx.fillText('H',hp.x,hp.y+4);ctx.restore();
      // Helicopter parked on helipad
      var hx=hp.x,hy=hp.y;
      ctx.fillStyle='#222';ctx.beginPath();ctx.ellipse(hx,hy,10,5,0.3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#333';ctx.beginPath();ctx.ellipse(hx-2,hy-1,6,3,0.3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(100,200,255,0.3)';ctx.beginPath();ctx.ellipse(hx-1,hy-2,3,2,0.3,0,Math.PI*2);ctx.fill();
      // Tail boom
      ctx.strokeStyle='#333';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hx+8,hy+2);ctx.lineTo(hx+16,hy+5);ctx.stroke();
      ctx.fillStyle='#444';ctx.fillRect(hx+14,hy+2,4,3);
      // Rotor
      ctx.save();ctx.strokeStyle='rgba(200,200,200,0.15)';ctx.lineWidth=1;
      var ra=blockFrameCount*0.15;
      ctx.beginPath();ctx.moveTo(hx+Math.cos(ra)*16,hy-3+Math.sin(ra)*4);ctx.lineTo(hx-Math.cos(ra)*16,hy-3-Math.sin(ra)*4);ctx.stroke();ctx.restore();
    }
  } else if (key==='stashHouse') {
    // Flat roof with vents, pipes, and tarps
    var v1=roofPt(b,0.15,0.15),v2=roofPt(b,0.85,0.2),v3=roofPt(b,0.5,0.85);
    ctx.fillStyle='#666';ctx.fillRect(v1.x-4,v1.y-3,8,6);ctx.fillRect(v2.x-3,v2.y-2,6,4);
    // Pipe across roof
    ctx.strokeStyle='#555';ctx.lineWidth=2;var pp1=roofPt(b,0.1,0.4),pp2=roofPt(b,0.9,0.4);ctx.beginPath();ctx.moveTo(pp1.x,pp1.y);ctx.lineTo(pp2.x,pp2.y);ctx.stroke();
    // Tarp/cover
    ctx.save();ctx.globalAlpha=0.3;ctx.fillStyle='#3a5a3a';
    var tp1=roofPt(b,0.4,0.5),tp2=roofPt(b,0.7,0.5),tp3=roofPt(b,0.7,0.8),tp4=roofPt(b,0.4,0.8);
    ctx.beginPath();ctx.moveTo(tp1.x,tp1.y);ctx.lineTo(tp2.x,tp2.y);ctx.lineTo(tp3.x,tp3.y);ctx.lineTo(tp4.x,tp4.y);ctx.closePath();ctx.fill();ctx.restore();
    // Stash bags — more piles with level
    if(lvl>=1){ctx.fillStyle='#c9a670';var nBags=Math.min(6,lvl*2);for(var s3=0;s3<nBags;s3++){var bx3=0.3+s3*0.08+(s3%2)*0.03,by3=0.55+s3*0.05;var bg=roofPt(b,bx3,by3);ctx.beginPath();ctx.ellipse(bg.x,bg.y,3+lvl*0.3,2.5,0,0,Math.PI*2);ctx.fill();}}
    // Stacked crates on roof
    if(lvl>=2){ctx.fillStyle='#6a5030';var cr1=roofPt(b,0.2,0.6);ctx.fillRect(cr1.x-4,cr1.y-3,8,6);if(lvl>=3){ctx.fillStyle='#5a4020';ctx.fillRect(cr1.x-3,cr1.y-7,6,4);}}
    // $ gold symbol — gets bigger
    if(lvl>=2){var ds=roofPt(b,0.5,0.25);ctx.save();ctx.fillStyle='#ffd700';ctx.shadowColor='#ffd700';ctx.shadowBlur=3+lvl*2;ctx.font='bold '+(8+lvl*2)+'px Arial';ctx.textAlign='center';ctx.fillText('$',ds.x,ds.y);ctx.restore();}
    // Purple glow from skylight at lvl 4+
    if(lvl>=4){ctx.save();var slp=roofPt(b,0.5,0.5);var slg=ctx.createRadialGradient(slp.x,slp.y,0,slp.x,slp.y,15);slg.addColorStop(0,'rgba(160,60,220,0.15)');slg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=slg;ctx.beginPath();ctx.arc(slp.x,slp.y,15,0,Math.PI*2);ctx.fill();ctx.restore();}
  } else if (key==='vault') {
    // Pediment triangular front - grows with level
    var pedH=10+lvl*3;
    var midSE={x:(b.tSW.x+b.tSE.x)/2,y:(b.tSW.y+b.tSE.y)/2};
    ctx.fillStyle=lvl>=3?'#6a6a80':'#5a5a6e';ctx.beginPath();ctx.moveTo(b.tSW.x,b.tSW.y);ctx.lineTo(midSE.x,midSE.y-pedH);ctx.lineTo(b.tSE.x,b.tSE.y);ctx.closePath();ctx.fill();
    ctx.save();ctx.strokeStyle='rgba(255,215,0,'+(0.1+lvl*0.08)+')';ctx.lineWidth=0.8+lvl*0.3;
    if(lvl>=3){ctx.shadowColor='#ffd700';ctx.shadowBlur=4;}
    ctx.stroke();ctx.restore();
    // Marble tile pattern
    ctx.strokeStyle='rgba(255,255,255,'+(0.04+lvl*0.02)+')';ctx.lineWidth=0.5;
    for(var i3=0;i3<4;i3++){var p1r=roofPt(b,0,0.2+i3*0.2),p2r=roofPt(b,1,0.2+i3*0.2);ctx.beginPath();ctx.moveTo(p1r.x,p1r.y);ctx.lineTo(p2r.x,p2r.y);ctx.stroke();}
    for(var i4=0;i4<4;i4++){var p3r=roofPt(b,0.2+i4*0.2,0),p4r=roofPt(b,0.2+i4*0.2,1);ctx.beginPath();ctx.moveTo(p3r.x,p3r.y);ctx.lineTo(p4r.x,p4r.y);ctx.stroke();}
    // Gold emblem - appears earlier, grows
    if(lvl>=1){ctx.save();var gc=roofPt(b,0.5,0.45);ctx.fillStyle='#ffd700';ctx.globalAlpha=0.15+lvl*0.08+0.1*Math.sin(blockFrameCount*0.04);
      if(lvl>=3){ctx.shadowColor='#ffd700';ctx.shadowBlur=6+lvl*2;}
      ctx.beginPath();ctx.arc(gc.x,gc.y,5+lvl*2,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=0.3+lvl*0.05;ctx.font='bold '+(6+lvl*2)+'px Arial';ctx.textAlign='center';ctx.fillText('★',gc.x,gc.y+2+lvl);ctx.restore();}
    // Helipad + helicopter at max level
    if(lvl>=4){ctx.save();ctx.strokeStyle='rgba(255,215,0,0.25)';ctx.lineWidth=1.5;var hp2=roofPt(b,0.5,0.75);ctx.beginPath();ctx.arc(hp2.x,hp2.y,12,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(255,215,0,0.12)';ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.fillText('H',hp2.x,hp2.y+4);ctx.restore();
      // Helicopter
      var hx2=hp2.x,hy2=hp2.y;ctx.fillStyle='#2a2a2a';ctx.beginPath();ctx.ellipse(hx2,hy2,9,4.5,0.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3a3a3a';ctx.beginPath();ctx.ellipse(hx2-2,hy2-1,5,2.5,0.3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#3a3a3a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hx2+7,hy2+2);ctx.lineTo(hx2+14,hy2+4);ctx.stroke();ctx.fillStyle='#444';ctx.fillRect(hx2+12,hy2+2,3,3);
      ctx.save();ctx.strokeStyle='rgba(200,200,200,0.12)';ctx.lineWidth=1;var ra2=blockFrameCount*0.12;ctx.beginPath();ctx.moveTo(hx2+Math.cos(ra2)*14,hy2-2+Math.sin(ra2)*3);ctx.lineTo(hx2-Math.cos(ra2)*14,hy2-2-Math.sin(ra2)*3);ctx.stroke();ctx.restore();}
    // Security cameras - more at higher levels
    for(var sc2=0;sc2<Math.min(3,1+lvl);sc2++){var scPos=roofPt(b,0.1+sc2*0.35,0.1);ctx.fillStyle='#444';ctx.fillRect(scPos.x-2,scPos.y-1,4,3);ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(scPos.x,scPos.y);ctx.lineTo(scPos.x+4,scPos.y-3);ctx.stroke();}
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
  const p = player;
  ctx.save();
  const cx = px + 19;
  const by = py + 56;
  const clothLvl = buildingLevels.clothing;
  const clothEffect = BUILDINGS.clothing.levels[clothLvl].effect;
  const shirt = clothEffect ? clothEffect.shirt : p.shirtColor;
  const pants = clothEffect ? clothEffect.pants : p.pantsColor;
  const sneakers = clothEffect ? clothEffect.sneakers : p.sneakerColor;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, by + 2, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Sneakers with soles
  ctx.fillStyle = '#222';
  ctx.fillRect(cx - 13, by - 4, 11, 4); ctx.fillRect(cx + 2, by - 4, 11, 4);
  ctx.fillStyle = sneakers;
  ctx.fillRect(cx - 12, by - 8, 10, 5); ctx.fillRect(cx + 2, by - 8, 10, 5);
  // Swoosh
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx - 10, by - 5); ctx.lineTo(cx - 4, by - 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 4, by - 5); ctx.lineTo(cx + 10, by - 7); ctx.stroke();
  // Legs
  ctx.fillStyle = pants;
  ctx.fillRect(cx - 10, by - 28, 9, 20); ctx.fillRect(cx + 1, by - 28, 9, 20);
  // Belt
  ctx.fillStyle = '#222'; ctx.fillRect(cx - 12, by - 29, 24, 2);
  ctx.fillStyle = '#ffd700'; ctx.fillRect(cx - 2, by - 30, 4, 3);
  // Torso
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.roundRect(cx - 14, by - 48, 28, 20, 4); ctx.fill();
  // Shirt collar
  ctx.fillStyle = p.skinColor;
  ctx.beginPath(); ctx.moveTo(cx - 6, by - 48); ctx.lineTo(cx, by - 44); ctx.lineTo(cx + 6, by - 48); ctx.fill();
  // Arms
  ctx.fillStyle = p.skinColor;
  ctx.fillRect(cx - 19, by - 47, 7, 16); ctx.fillRect(cx + 12, by - 47, 7, 16);
  // Hands
  ctx.fillRect(cx - 19, by - 32, 6, 5); ctx.fillRect(cx + 13, by - 32, 6, 5);
  // Chain necklace
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 8, by - 48); ctx.quadraticCurveTo(cx, by - 40, cx + 8, by - 48); ctx.stroke();
  // Chain pendant
  ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(cx, by - 41, 2.5, 0, Math.PI * 2); ctx.fill();
  // Head
  ctx.fillStyle = p.skinColor;
  ctx.beginPath(); ctx.arc(cx, by - 55, 10, 0, Math.PI * 2); ctx.fill();
  // Cap - flat brim style
  ctx.fillStyle = '#b71c1c';
  ctx.beginPath(); ctx.ellipse(cx, by - 59, 12, 5, 0, Math.PI, 0); ctx.fill();
  ctx.fillRect(cx - 3, by - 65, 14, 5);
  // Cap brim
  ctx.fillStyle = '#8b1111'; ctx.fillRect(cx + 2, by - 60, 12, 2);
  // Eyes
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(cx - 4, by - 55, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4, by - 55, 1.5, 0, Math.PI * 2); ctx.fill();
  // Mouth
  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx - 3, by - 49); ctx.lineTo(cx + 3, by - 49); ctx.stroke();

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

  // Check building clicks (iso polygon hit test, front-to-back priority)
  for (let i = layout.count - 1; i >= 0; i--) {
    const b = layout.buildings[i];
    if (isoBldgContains(cx, cy, b.silhouette)) {
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
  const mY = 62 + safeTop;

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
