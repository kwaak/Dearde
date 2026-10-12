// Music and sound effects for Samen, all synthesised with the Web Audio API
// (no audio files). Every zone has its own soft little tune and the bosses
// share a livelier one.
//
// Sync: the music is not started, it is *joined*. Each song loops on a grid
// that hangs off the server's clock: at server time t the song is at step
// floor(t / stepLength) mod songLength. Every phone syncs its clock to the
// server (min round trip of a few pings) and schedules notes ahead on the
// sample-accurate audio clock, corrected for its output latency, so two
// phones always play the same note at the same moment, however late either
// of them joined.

let ctx = null;
let master, musicBus, sfxBus, echo;
let mode = 'all'; // 'all' | 'sfx' | 'off'
let offsetMs = 0; // server clock minus Date.now()
let anchor = null; // { ctx: audio seconds, server: server seconds } at the same instant
let current = null; // song name that should play
let playing = null; // { name, gain, nextStep, endsAt }

// ---------- Notes ----------

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (n) => 440 * 2 ** ((n - 69) / 12);

const CHORDS = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus: [0, 5, 7],
};
// "Am" -> midi notes of the chord around octave 3/4.
function chord(name) {
  const m = /^([A-G])(#|b)?(.*)$/.exec(name);
  const root = 48 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root, notes: (CHORDS[m[3]] || CHORDS['']).map((i) => root + i) };
}

// "E5 . G5 - ..." in eighths -> [{ step, note, len }]
function parse(line) {
  const tokens = line.trim().split(/\s+/);
  const out = [];
  tokens.forEach((t, i) => {
    if (t === '-' && out.length) out[out.length - 1].len += 1;
    else if (t !== '.' && t !== '-') out.push({ step: i, note: midi(t), len: 1 });
  });
  return out;
}

// ---------- Songs (original tunes, 8 bars in eighths) ----------

const SONGS = {
  tuin: {
    bpm: 104, lead: 'pulse', bass: 'tri', arp: 'pluck', arpPattern: [0, 2, 1, 2, 0, 2, 1, 2], drums: 'soft',
    chords: ['C', 'G', 'Am', 'F', 'C', 'F', 'G', 'C'],
    melody: `E5 . G5 E5 C5 . D5 E5  D5 - B4 . G4 . A4 B4  C5 . E5 . A5 G5 E5 C5  D5 - - . F5 E5 D5 C5
             E5 . G5 E5 C6 - B5 A5  A5 G5 F5 . A5 - G5 F5  E5 D5 C5 . B4 . D5 .  C5 - - . G4 . C5 .`,
  },
  ijs: {
    bpm: 84, lead: 'celesta', bass: 'sine', arp: 'bell', arpPattern: [0, 1, 2, 3, 2, 1, 0, 1], drums: null, pad: true,
    chords: ['F', 'C', 'Dm', 'Bb', 'F', 'Am', 'Bb', 'C'],
    melody: `A5 - - C6 - - A5 .  G5 - - E5 - - C5 .  F5 - A5 - D6 - C6 .  Bb5 - - A5 G5 - F5 .
             A5 - C6 - F6 - E6 .  E6 - C6 - A5 - - .  D6 - Bb5 - G5 - A5 Bb5  C6 - - - G5 - - .`,
  },
  grot: {
    bpm: 78, lead: 'pluck', bass: 'sine', arp: 'drip', arpPattern: [2, -1, -1, 1, -1, -1, 0, -1], drums: null, echo: true,
    chords: ['Am', 'Am', 'F', 'E', 'Am', 'Dm', 'E', 'E'],
    melody: `A4 . C5 . E5 . . D5  C5 . B4 . A4 . . .  F4 . A4 . C5 . E5 .  D5 - - . B4 . G#4 .
             A4 . E5 . A5 . G5 .  F5 . E5 . D5 . A4 .  B4 . E5 . G#5 - - .  E5 - - . . . . .`,
  },
  meer: {
    bpm: 92, lead: 'flute', bass: 'tri', arp: 'harp', arpPattern: [0, 1, 2, 3, 2, 3, 2, 1], drums: null,
    chords: ['D', 'A', 'Bm', 'G', 'D', 'G', 'A', 'D'],
    melody: `F#5 - E5 F#5 A5 - - .  E5 - C#5 E5 A5 - G5 .  F#5 - D5 F#5 B5 - A5 .  G5 - F#5 E5 D5 - B4 .
             A4 - D5 - F#5 - A5 .  B5 - A5 G5 D5 - E5 .  C#5 - E5 - A5 - G5 F#5  D5 - - - . . . .`,
  },
  paddo: {
    bpm: 126, lead: 'square', bass: 'bounce', arp: null, drums: 'bright',
    chords: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G'],
    melody: `G5 . G5 B5 . D6 . B5  C6 . E6 . C6 B5 A5 .  B5 . D5 . G5 . B5 .  A5 - F#5 . A5 . D6 .
             G5 . B5 D6 . G6 . D6  E6 . C6 . E6 D6 C6 .  A5 . D6 . C6 . A5 F#5  G5 . . D5 G5 - - .`,
  },
  kasteel: {
    bpm: 88, lead: 'harpsi', bass: 'tri', arp: 'harpsi', arpPattern: [0, 2, 1, 2, 0, 2, 1, 2], drums: 'march',
    chords: ['Em', 'B', 'Em', 'D', 'C', 'Am', 'B', 'Em'],
    melody: `E5 . G5 . B5 - A5 G5  F#5 - D#5 . B4 . . .  E5 . G5 . B5 . E6 .  D6 - C6 B5 A5 . F#5 .
             G5 . E5 . C6 - B5 A5  A5 . C6 . E6 - D6 C6  B5 . A5 . F#5 . D#5 .  E5 - - - . . . .`,
  },
  berg: {
    bpm: 92, lead: 'flute', bass: 'drone', arp: null, drums: 'soft',
    chords: ['F', 'Eb', 'F', 'C', 'F', 'Eb', 'Bb', 'C'],
    melody: `C5 - F5 - G5 - A5 .  G5 - F5 Eb5 C5 - - .  A4 - C5 - F5 - G5 A5  G5 - - - E5 - C5 .
             F5 - A5 - C6 - Bb5 A5  G5 - Eb5 - Bb4 - C5 .  D5 - F5 - Bb5 - A5 G5  F5 - - - . . E5 .`,
  },
  hart: {
    bpm: 80, lead: 'musicbox', bass: 'sine', arp: 'musicbox', arpPattern: [0, 2, 1, 2, 0, 2, 1, 2], drums: null, pad: true,
    chords: ['Eb', 'Bb', 'Cm', 'Ab', 'Eb', 'Ab', 'Bb', 'Eb'],
    melody: `G5 . Bb5 . Eb6 - D6 .  D6 . F5 . Bb5 - - .  C6 . Eb6 . G6 - F6 Eb6  C6 - Ab5 . Eb5 - - .
             Eb5 . G5 . Bb5 . Eb6 .  F6 - Eb6 . C6 - Ab5 .  Bb5 . D6 . F6 - Eb6 D6  Eb6 - - - . . . .`,
  },
  boss: {
    bpm: 136, lead: 'square', bass: 'ostinato', arp: null, drums: 'boss',
    chords: ['Cm', 'Cm', 'Ab', 'G', 'Cm', 'Cm', 'Ab', 'G'],
    melody: `C5 . . C5 Eb5 . G5 .  F#5 G5 . Eb5 . C5 . .  Ab4 . . Ab4 C5 . Eb5 .  D5 - B4 . G4 . B4 D5
             C6 . . C6 Bb5 . G5 .  Ab5 G5 . Eb5 . F5 G5 .  Ab5 . G5 . F5 . Eb5 .  D5 . B4 . D5 . G5 .`,
  },
};
for (const s of Object.values(SONGS)) {
  s.notes = parse(s.melody);
  s.steps = s.chords.length * 8;
  s.step = 60 / s.bpm / 2; // seconds per eighth
}

// ---------- Instruments ----------

function env(g, t, a, peak, d, sus = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
}

function osc(type, f, t, end, dest, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

// One note of an instrument, at audio time t, `dur` seconds long.
function play(inst, n, t, dur, vol, bus) {
  const f = hz(n);
  const g = ctx.createGain();
  g.connect(bus);
  const end = t + dur;
  switch (inst) {
    case 'pulse': case 'square': {
      // A soft, low-passed square: a gentle chiptune voice.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = inst === 'pulse' ? 1800 : 2600;
      lp.connect(g);
      osc('square', f, t, end, lp);
      env(g, t, 0.01, vol * 0.5, Math.max(0.05, dur * (inst === 'square' ? 0.7 : 0.9)), vol * 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, end + 0.04);
      break;
    }
    case 'celesta': case 'bell': case 'musicbox': {
      const ring = inst === 'musicbox' ? 1.4 : inst === 'bell' ? 1.1 : 1.6;
      osc('sine', f, t, t + ring, g);
      const h = ctx.createGain();
      h.connect(g);
      h.gain.value = inst === 'musicbox' ? 0.35 : 0.25;
      osc('sine', f * (inst === 'musicbox' ? 4 : 3), t, t + ring, h);
      env(g, t, 0.004, vol, ring);
      break;
    }
    case 'pluck': case 'drip': case 'harp': case 'harpsi': {
      const type = inst === 'harpsi' ? 'sawtooth' : 'triangle';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(inst === 'harpsi' ? 3200 : 2400, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + 0.4);
      lp.connect(g);
      osc(type, f, t, t + 0.8, lp);
      env(g, t, 0.003, vol * (inst === 'harpsi' ? 0.4 : 1), inst === 'drip' ? 0.25 : 0.6);
      if (inst === 'drip' || inst === 'pluck') g.connect(echo);
      break;
    }
    case 'flute': {
      const o = osc('sine', f, t, end, g);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.value = f * 0.006;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t + 0.12);
      lfo.stop(end + 0.05);
      const air = ctx.createGain();
      air.gain.value = 0.15;
      air.connect(g);
      osc('triangle', f * 2, t, end, air);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * 0.8, t + 0.06);
      g.gain.setValueAtTime(vol * 0.7, Math.max(t + 0.07, end - 0.08));
      g.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
      break;
    }
    case 'pad': {
      osc('sine', f, t, end + 0.3, g);
      osc('triangle', f, t, end + 0.3, g, 7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.6, dur / 2));
      g.gain.exponentialRampToValueAtTime(0.0001, end + 0.3);
      break;
    }
    default: { // tri, sine, bounce, ostinato, drone: basses
      osc(inst === 'sine' || inst === 'drone' ? 'sine' : 'triangle', f, t, end, g);
      env(g, t, 0.01, vol, Math.max(0.08, dur * 0.9), vol * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, end + 0.03);
    }
  }
}

let noiseBuf = null;
function noise(t, dur, vol, bus, { type = 'bandpass', freq = 1000, q = 1, to = null } = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.003, vol, dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function drum(kind, step, t, bus) {
  const beat = step % 8;
  if (kind === 'boss') {
    if (beat % 2 === 0) kick(t, 0.5, bus);
    if (beat === 2 || beat === 6) noise(t, 0.12, 0.18, bus, { freq: 1800, q: 0.7 });
    noise(t, 0.03, 0.05, bus, { type: 'highpass', freq: 7000 });
  } else if (kind === 'bright') {
    if (beat === 0 || beat === 3 || beat === 4) kick(t, 0.35, bus);
    if (beat === 2 || beat === 6) noise(t, 0.08, 0.1, bus, { freq: 2500, q: 0.8 });
    if (beat % 2 === 1) noise(t, 0.025, 0.04, bus, { type: 'highpass', freq: 8000 });
  } else if (kind === 'march') {
    if (beat === 0 || beat === 4) kick(t, 0.3, bus);
    if (beat === 6 || beat === 7) noise(t, 0.06, 0.06, bus, { freq: 1500, q: 1 });
  } else {
    if (beat === 0 || beat === 4) kick(t, 0.25, bus);
    if (beat % 2 === 1) noise(t, 0.02, 0.025, bus, { type: 'highpass', freq: 8000 });
  }
}

function kick(t, vol, bus) {
  const g = ctx.createGain();
  g.connect(bus);
  const o = osc('sine', 120, t, t + 0.2, g);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  env(g, t, 0.003, vol, 0.18);
}

// All notes of one step (an eighth) of a song.
function playStep(song, step, t, bus) {
  const s = SONGS[song];
  const bar = Math.floor(step / 8);
  const ch = chord(s.chords[bar]);
  const len = s.step;
  for (const n of s.notes) if (n.step === step) play(s.lead, n.note, t, n.len * len * 0.95, 0.22, bus);
  // Bass.
  const b = step % 8;
  if (s.bass === 'bounce') { if (b % 2 === 0) play('tri', ch.root - 12 + (b % 4 ? 7 : 0), t, len * 0.8, 0.3, bus); }
  else if (s.bass === 'ostinato') play('tri', ch.root - 12 + (b % 2 ? 12 : 0), t, len * 0.8, 0.28, bus);
  else if (s.bass === 'drone') { if (b === 0) { play('drone', ch.root - 12, t, len * 8, 0.18, bus); play('drone', ch.root - 5, t, len * 8, 0.1, bus); } }
  else if (b === 0 || b === 4 || (s.bpm > 100 && b === 6)) play(s.bass, ch.root - 12, t, len * (b === 6 ? 1.5 : 3.5), 0.26, bus);
  // Arpeggio.
  if (s.arp) {
    const i = s.arpPattern[b];
    if (i >= 0) play(s.arp, ch.notes[i % ch.notes.length] + 12 * (1 + Math.floor(i / ch.notes.length)), t, len, s.arp === 'harp' ? 0.1 : 0.08, bus);
  }
  if (s.pad && b === 0) for (const n of ch.notes) play('pad', n + 12, t, len * 8, 0.035, bus);
  if (s.drums) drum(s.drums, step, t, bus);
}

// ---------- Clock and scheduler ----------

// Server time (seconds) at a given audio-clock time.
const serverAt = (audioT) => anchor.server + (audioT - anchor.ctx);

function reanchor() {
  // Pair the audio clock with the server clock; the audio clock is the
  // steady one, so this only nudges when the two drift apart.
  const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  const fresh = { ctx: ctx.currentTime + latency, server: (Date.now() + offsetMs) / 1000 };
  if (!anchor || Math.abs(serverAt(fresh.ctx) - fresh.server) > 0.03) anchor = fresh;
}

async function syncClock() {
  let best = null;
  for (let i = 0; i < 5; i++) {
    try {
      const t0 = Date.now();
      const res = await fetch('/api/time', { cache: 'no-store' });
      const { now } = await res.json();
      const t1 = Date.now();
      if (!best || t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: now + (t1 - t0) / 2 - t1 };
    } catch { /* offline: keep the last offset */ }
  }
  if (best) { offsetMs = best.offset; anchor = null; }
}

const LOOKAHEAD = 0.25;
function tick() {
  if (!ctx || ctx.state !== 'running') return;
  reanchor();
  const want = mode === 'all' ? current : null;
  const now = ctx.currentTime;
  // Switch songs on the next bar of the global grid, with a short fade.
  if (playing && playing.name !== want) {
    playing.gain.gain.setTargetAtTime(0.0001, now, 0.25);
    const old = playing.gain;
    setTimeout(() => old.disconnect(), 2000);
    playing = null;
  }
  if (!playing && want) {
    const s = SONGS[want];
    const gain = ctx.createGain();
    gain.connect(musicBus);
    const barLen = s.step * 8;
    const nextBar = Math.ceil(serverAt(now + 0.05) / barLen) * barLen;
    playing = { name: want, gain, nextStep: Math.round(nextBar / s.step) };
  }
  if (!playing) return;
  const s = SONGS[playing.name];
  for (;;) {
    const t = anchor.ctx + (playing.nextStep * s.step - anchor.server);
    if (t > now + LOOKAHEAD) break;
    if (t >= now - 0.02) playStep(playing.name, ((playing.nextStep % s.steps) + s.steps) % s.steps, Math.max(now, t), playing.gain);
    playing.nextStep += 1;
  }
}

// ---------- Sound effects ----------

const FX = {
  step(t, seat) {
    const g = ctx.createGain(); g.connect(sfxBus);
    const o = osc('sine', seat ? 330 : 520, t, t + 0.08, g);
    o.frequency.exponentialRampToValueAtTime(seat ? 220 : 380, t + 0.06);
    env(g, t, 0.003, 0.12, 0.07);
  },
  bump(t) {
    const g = ctx.createGain(); g.connect(sfxBus);
    const o = osc('sine', 140, t, t + 0.15, g);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    env(g, t, 0.003, 0.3, 0.12);
    noise(t, 0.06, 0.1, sfxBus, { type: 'lowpass', freq: 400 });
  },
  push(t) {
    noise(t, 0.16, 0.18, sfxBus, { freq: 380, q: 2, to: 260 });
    play('pluck', 45, t, 0.1, 0.3, sfxBus);
  },
  splash(t) {
    noise(t, 0.35, 0.3, sfxBus, { type: 'lowpass', freq: 2400, to: 300 });
    [0.08, 0.15, 0.24].forEach((d, i) => {
      const g = ctx.createGain(); g.connect(sfxBus);
      const o = osc('sine', 500 + i * 150, t + d, t + d + 0.06, g);
      o.frequency.exponentialRampToValueAtTime(900 + i * 200, t + d + 0.05);
      env(g, t + d, 0.003, 0.08, 0.05);
    });
  },
  bridge(t) { FX.splash(t); play('pluck', 50, t + 0.18, 0.2, 0.35, sfxBus); },
  slide(t) { noise(t, 0.3, 0.12, sfxBus, { type: 'highpass', freq: 1500, to: 4500 }); },
  plate(t) {
    noise(t, 0.02, 0.15, sfxBus, { type: 'highpass', freq: 3000 });
    play('bell', 84, t + 0.02, 0.2, 0.08, sfxBus);
    play('bell', 91, t + 0.09, 0.2, 0.07, sfxBus);
  },
  door(t, open) {
    const g = ctx.createGain(); g.connect(sfxBus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g);
    const o = osc('sawtooth', open ? 110 : 220, t, t + 0.3, lp);
    o.frequency.exponentialRampToValueAtTime(open ? 220 : 110, t + 0.28);
    env(g, t, 0.02, 0.12, 0.28);
  },
  lever(t) { noise(t, 0.03, 0.2, sfxBus, { freq: 1200, q: 3 }); noise(t + 0.07, 0.03, 0.15, sfxBus, { freq: 900, q: 3 }); },
  key(t) { [84, 88, 91, 96].forEach((n, i) => play('celesta', n, t + i * 0.06, 0.2, 0.12, sfxBus)); },
  unlock(t) { noise(t, 0.04, 0.2, sfxBus, { freq: 2000, q: 4 }); play('bell', 79, t + 0.06, 0.2, 0.12, sfxBus); play('bell', 86, t + 0.14, 0.3, 0.12, sfxBus); },
  squeak(t) {
    const g = ctx.createGain(); g.connect(sfxBus);
    const o = osc('sine', 1600, t, t + 0.12, g);
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(1800, t + 0.1);
    env(g, t, 0.005, 0.07, 0.1);
  },
  creak(t) {
    const g = ctx.createGain(); g.connect(sfxBus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(g);
    const o = osc('sawtooth', 70, t, t + 0.3, lp);
    o.frequency.linearRampToValueAtTime(95, t + 0.15);
    o.frequency.linearRampToValueAtTime(65, t + 0.28);
    env(g, t, 0.02, 0.1, 0.26);
  },
  pipe(t) {
    for (let i = 0; i < 6; i++) {
      const g = ctx.createGain(); g.connect(sfxBus);
      const o = osc('square', 620 - i * 80, t + i * 0.05, t + i * 0.05 + 0.05, g);
      o.frequency.exponentialRampToValueAtTime(400 - i * 50, t + i * 0.05 + 0.045);
      env(g, t + i * 0.05, 0.003, 0.05, 0.045);
    }
  },
  smash(t) {
    noise(t, 0.25, 0.35, sfxBus, { type: 'lowpass', freq: 3000, to: 400 });
    [0, 0.05, 0.1].forEach((d) => noise(t + d, 0.05, 0.15, sfxBus, { freq: 900 + d * 4000, q: 2 }));
  },
  spring(t) {
    const g = ctx.createGain(); g.connect(sfxBus);
    const o = osc('sine', 180, t, t + 0.45, g);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.42);
    const lfo = ctx.createOscillator(); const d = ctx.createGain();
    lfo.frequency.value = 18; d.gain.value = 40; lfo.connect(d).connect(o.frequency); lfo.start(t); lfo.stop(t + 0.5);
    env(g, t, 0.005, 0.16, 0.42);
  },
  coin(t) { play('bell', 84, t, 0.08, 0.14, sfxBus); play('bell', 91, t + 0.07, 0.4, 0.14, sfxBus); },
  star(t) { [72, 76, 79, 84, 88].forEach((n, i) => play('celesta', n, t + i * 0.07, 0.3, 0.12, sfxBus)); },
  pswitch(t) {
    const g = ctx.createGain(); g.connect(sfxBus);
    const o = osc('square', 220, t, t + 0.25, g);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
    env(g, t, 0.003, 0.1, 0.22);
    FX.blocks(t + 0.1, true);
  },
  tick(t, hurry) { noise(t, 0.025, hurry ? 0.2 : 0.12, sfxBus, { freq: hurry ? 2400 : 1500, q: 6 }); },
  blocks(t, on) { [0, 1, 2].forEach((i) => play('bell', (on ? 72 : 84) + (on ? i : -i) * 4, t + i * 0.05, 0.1, 0.06, sfxBus)); },
  crash(t) {
    noise(t, 0.6, 0.35, sfxBus, { type: 'lowpass', freq: 600, to: 80 });
    const g = ctx.createGain(); g.connect(sfxBus);
    const o = osc('sine', 160, t, t + 0.6, g);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.55);
    env(g, t, 0.01, 0.35, 0.55);
  },
  crumble(t) { noise(t, 0.5, 0.25, sfxBus, { type: 'lowpass', freq: 900, to: 120 }); FX.crash(t + 0.1); },
  heart(t) { play('musicbox', 88, t, 0.3, 0.1, sfxBus); play('musicbox', 95, t + 0.08, 0.4, 0.08, sfxBus); },
  bossStep(t) { kick(t, 0.18, sfxBus); },
  bossHit(t) {
    noise(t, 0.15, 0.4, sfxBus, { type: 'lowpass', freq: 2500, to: 300 });
    const g = ctx.createGain(); g.connect(sfxBus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; lp.connect(g);
    const o = osc('sawtooth', 900, t + 0.05, t + 0.5, lp);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.45);
    env(g, t + 0.05, 0.01, 0.15, 0.42);
  },
  bossDown(t) {
    FX.bossHit(t);
    [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]].forEach((ch, i) =>
      ch.forEach((n) => play('square', n + 12, t + 0.5 + i * 0.16, i === 3 ? 0.9 : 0.14, 0.07, sfxBus)));
  },
  cage(t) { for (let i = 0; i < 8; i++) play('harp', 72 + [0, 2, 4, 7, 9, 12, 14, 16][i], t + i * 0.04, 0.4, 0.09, sfxBus); },
  solved(t) { [67, 72, 76, 79, 84].forEach((n, i) => play('celesta', n, t + i * 0.09, i === 4 ? 0.8 : 0.2, 0.14, sfxBus)); },
  warp(t) {
    for (let i = 0; i < 3; i++) {
      const g = ctx.createGain(); g.connect(sfxBus);
      const o = osc('sine', 300 * (i + 1), t, t + 0.7, g);
      o.frequency.exponentialRampToValueAtTime(1200 * (i + 1), t + 0.6);
      env(g, t, 0.05, 0.05 / (i + 1), 0.6);
    }
  },
  click(t) { noise(t, 0.015, 0.12, sfxBus, { type: 'highpass', freq: 2500 }); },
};

// The last few sounds played, newest last (handy when testing).
export const recent = [];

export function sfx(name, ...args) {
  if (!ctx || ctx.state !== 'running' || mode === 'off' || !FX[name]) return;
  FX[name](ctx.currentTime + 0.01, ...args);
  recent.push(name);
  if (recent.length > 50) recent.shift();
}

// Works out what just happened between two views of the same area and
// plays the matching sounds. `mine` is false for moves of the partner on
// another phone (that phone plays those itself).
export function observe(prev, next, mine) {
  if (!ctx || !prev || !next) return;
  if (prev.level !== next.level) { if (prev.solved) sfx('warp'); return; }
  const tile = (g, r, c) => g.tiles[r] && g.tiles[r][c];
  const solvedNow = next.solved && !prev.solved;
  if (mine) {
    for (const seat of [0, 1]) {
      const [r0, c0] = prev.players[seat];
      const [r1, c1] = next.players[seat];
      if (r0 === r1 && c0 === c1) continue;
      const far = Math.abs(r1 - r0) + Math.abs(c1 - c0);
      const t = tile(next, r1, c1);
      if (/^[1-4]$/.test(t) && far > 1) sfx('pipe');
      else if (far > 1 && (r0 === r1 || c0 === c1) && [...Array(far)].some((_, k) => tile(prev, r0 + Math.sign(r1 - r0) * k, c0 + Math.sign(c1 - c0) * k) === 'j')) sfx('spring');
      else if (far > 1) sfx('slide');
      else sfx('step', seat);
      if (t === 'o') sfx('squeak');
      if (t === 'x') sfx('creak');
      if (t === 'E' && !solvedNow) sfx('heart');
    }
    const prevBoxes = prev.boxes.filter(Boolean).map(String).sort().join();
    const nextBoxes = next.boxes.filter(Boolean).map(String).sort().join();
    const sunk = next.boxes.filter((b) => !b).length > prev.boxes.filter((b) => !b).length;
    const filled = (g) => g.tiles.flat().filter((t) => t === '=').length;
    const bossHit = next.boss && prev.boss && next.boss.hits > prev.boss.hits;
    if (sunk && !bossHit) sfx(filled(next) > filled(prev) ? 'bridge' : 'splash');
    else if (prevBoxes !== nextBoxes) sfx('push');
    // Tiles that changed state.
    const seen = new Set();
    next.tiles.forEach((row, r) => row.forEach((t, c) => {
      const was = prev.tiles[r][c];
      if (t === was) return;
      let fx = null;
      if (/^[A-D]/.test(t)) fx = t.endsWith('+') ? 'door+' : 'door-';
      else if (/^[UV]/.test(t)) fx = t.endsWith('1') ? 'door+' : 'door-';
      else if (/^[uv]/.test(t)) fx = 'lever';
      else if (was === 'k') fx = 'key';
      else if (t === 'K+') fx = 'unlock';
      else if (was === 'r') fx = 'smash';
      else if (was === '*') fx = 'coin';
      else if (t === 'S+') fx = 'star';
      else if (t === 'Z+') fx = 'cage';
      else if (t === 'h') fx = 'crash';
      else if (t === 'Q0') fx = 'crumble';
      else if (t === 'q0' && was === 'q1') fx = 'blocks-';
      if (fx && !seen.has(fx)) {
        seen.add(fx);
        if (fx === 'door+' || fx === 'door-') sfx('door', fx === 'door+');
        else if (fx === 'blocks-') sfx('blocks', false);
        else sfx(fx);
      }
    }));
    // Buttons going down.
    const occupiedPlates = (g) => {
      const occ = new Set([...g.boxes.filter(Boolean), ...g.players].map(String));
      let n = 0;
      g.tiles.forEach((row, r) => row.forEach((t, c) => { if (/^[a-d]$/.test(t) && occ.has(`${r},${c}`)) n++; }));
      return n;
    };
    if (occupiedPlates(next) > occupiedPlates(prev)) sfx('plate');
    if (next.ptimer > prev.ptimer) sfx('pswitch');
    else if (next.ptimer > 0) sfx('tick', next.ptimer <= 2);
    if (next.boss && prev.boss) {
      if (next.boss.hits > prev.boss.hits) sfx(next.boss.hp > 0 ? 'bossHit' : 'bossDown');
      else if (next.boss.pos && prev.boss.pos && String(next.boss.pos) !== String(prev.boss.pos)) sfx('bossStep');
    }
  }
  if (solvedNow && mine) sfx('solved');
}

// ---------- Public controls ----------

// Which song fits this view: the boss theme while a boss is about.
export function setScene(view) {
  current = view ? (view.boss && view.boss.hp > 0 ? 'boss' : SONGS[view.zone] ? view.zone : 'tuin') : null;
  tick();
}

export function setMode(m) {
  mode = m;
  if (master) master.gain.setTargetAtTime(m === 'off' ? 0.0001 : 1, ctx.currentTime, 0.05);
  tick();
}

export function getMode() { return mode; }

// Where the music is right now: song, step in the song and server time.
export function status() {
  if (!ctx || !anchor) return null;
  const now = serverAt(ctx.currentTime);
  const s = playing && SONGS[playing.name];
  return { song: playing && playing.name, step: s ? Math.floor(now / s.step) % s.steps : null, server: now, offsetMs, state: ctx.state };
}

// Browsers only allow sound after a tap: call this from one.
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.55;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    musicBus.connect(master);
    sfxBus.connect(master);
    // A soft echo for the cave.
    echo = ctx.createDelay(1);
    echo.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    echo.connect(fb).connect(echo);
    echo.connect(musicBus);
    setMode(mode);
    syncClock();
    setInterval(syncClock, 60000);
    setInterval(tick, 40);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else ctx.resume().then(() => { anchor = null; tick(); });
    });
  }
  if (ctx.state !== 'running') ctx.resume().then(() => { anchor = null; tick(); });
}
