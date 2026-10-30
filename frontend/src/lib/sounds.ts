import { storage } from "./storage";

// All sounds are synthesised with WebAudio, so there are no assets to load.

let ctx: AudioContext | null = null;
let muted = storage.muted();

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Browsers only allow audio after a user gesture; call from one. */
export function unlockAudio(): void {
  audio();
}

export function isMuted(): boolean {
  return muted;
}

const muteListeners = new Set<(muted: boolean) => void>();

export function setMuted(value: boolean): void {
  muted = value;
  storage.setMuted(value);
  muteListeners.forEach((l) => l(value));
}

export function onMuteChange(listener: (muted: boolean) => void): () => void {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

/** The shared audio context, or null while muted or unavailable. */
export function audioContext(): AudioContext | null {
  return audio();
}

function tone(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "square",
  gain = 0.12,
  slideTo?: number
): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Dev/test builds record which sounds played so E2E tests can assert on them. */
export function record(name: string): void {
  if (!import.meta.env.DEV || muted) return;
  const w = window as unknown as { __yartSounds?: string[] };
  (w.__yartSounds ??= []).push(name);
}

export const sounds = {
  alarm() {
    record("alarm");
    for (let i = 0; i < 4; i++) {
      tone(880, i * 0.5, 0.18, "square", 0.15);
      tone(660, i * 0.5 + 0.2, 0.18, "square", 0.15);
    }
  },
  shoot() {
    tone(900, 0, 0.08, "square", 0.04, 300);
  },
  hit() {
    tone(220, 0, 0.06, "sawtooth", 0.05, 120);
  },
  explode() {
    tone(160, 0, 0.35, "sawtooth", 0.09, 40);
  },
  shield() {
    tone(520, 0, 0.12, "sine", 0.1, 880);
  },
  topicFell() {
    tone(300, 0, 0.6, "triangle", 0.12, 60);
  },
  countdown() {
    tone(660, 0, 0.12, "sine", 0.12);
  },
  special() {
    tone(220, 0, 0.5, "sawtooth", 0.12, 880);
    tone(440, 0.05, 0.45, "square", 0.06, 1320);
  },
  ready() {
    record("ready");
    tone(660, 0, 0.12, "sine", 0.12);
    tone(880, 0.1, 0.12, "sine", 0.12);
    tone(1320, 0.2, 0.25, "sine", 0.12);
  },
  go() {
    tone(990, 0, 0.3, "sine", 0.14);
  },
};
