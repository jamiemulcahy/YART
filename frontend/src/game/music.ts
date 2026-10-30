import { audioContext, isMuted, onMuteChange, record } from "../lib/sounds";

/**
 * A synthesised chiptune loop for the battle: bass, arpeggio and drums, scheduled slightly ahead
 * of time with WebAudio. It speeds up as later lanes come in.
 */

const ROOTS = [57, 53, 48, 55]; // A, F, C, G (MIDI)
const CHORDS = [
  [0, 3, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 11],
];
const LOOKAHEAD_S = 0.15;
const TICK_MS = 50;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

let timer: ReturnType<typeof setInterval> | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let step = 0;
let nextAt = 0;
let bpm = 132;
let unsubscribe: (() => void) | null = null;

function voice(
  ac: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  freq: number,
  at: number,
  len: number,
  gain: number
) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + len + 0.02);
}

function kick(ac: AudioContext, out: AudioNode, at: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.setValueAtTime(150, at);
  osc.frequency.exponentialRampToValueAtTime(40, at + 0.12);
  g.gain.setValueAtTime(0.9, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + 0.18);
}

function hiss(ac: AudioContext, out: AudioNode, at: number, len: number, gain: number, highpass: number) {
  noise ??= (() => {
    const buf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  })();
  const src = ac.createBufferSource();
  src.buffer = noise;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpass;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(filter).connect(g).connect(out);
  src.start(at);
  src.stop(at + len + 0.02);
}

function schedule() {
  const ac = audioContext();
  if (!ac || !master) return;
  const sixteenth = 60 / bpm / 4;
  while (nextAt < ac.currentTime + LOOKAHEAD_S) {
    const bar = Math.floor(step / 16) % ROOTS.length;
    const s = step % 16;
    const root = ROOTS[bar] as number;
    const chord = CHORDS[bar] as number[];
    if (s % 2 === 0)
      voice(ac, master, "square", midi(root - 24 + (s % 8 === 6 ? 12 : 0)), nextAt, sixteenth * 1.8, 0.22);
    voice(ac, master, "triangle", midi(root + 12 + (chord[s % 4] as number)), nextAt, sixteenth * 0.9, 0.12);
    if (s % 4 === 0) kick(ac, master, nextAt);
    if (s % 8 === 4) hiss(ac, master, nextAt, 0.12, 0.35, 1500);
    if (s % 2 === 1) hiss(ac, master, nextAt, 0.03, 0.12, 7000);
    nextAt += sixteenth;
    step++;
  }
}

export function startMusic(): void {
  if (timer) return;
  unsubscribe ??= onMuteChange((muted) => {
    if (muted) stopMusic(false);
    else startMusic();
  });
  if (isMuted()) return;
  const ac = audioContext();
  if (!ac) return;
  master = ac.createGain();
  master.gain.value = 0.09;
  master.connect(ac.destination);
  step = 0;
  nextAt = ac.currentTime + 0.05;
  timer = setInterval(schedule, TICK_MS);
  schedule();
  record("music:start");
}

/** Faster as the battle goes on. */
export function setMusicLevel(level: number): void {
  bpm = Math.min(176, 132 + level * 8);
}

export function stopMusic(forget = true): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (master) {
    const ac = audioContext();
    if (ac) master.gain.setTargetAtTime(0, ac.currentTime, 0.1);
    const m = master;
    setTimeout(() => m.disconnect(), 400);
  }
  master = null;
  if (forget) {
    unsubscribe?.();
    unsubscribe = null;
  }
  record("music:stop");
}
