/**
 * Battle maths shared by server and clients.
 *
 * The server generates the whole battle up front as a script. Attacker positions are a pure
 * function of time, so every client draws every attacker in the same place without movement
 * messages. Ships, shots, kills and topic damage travel over the wire, and the server is the
 * authority on every point of damage.
 */

// ------------------------------------------------------------------ Arena

export const ARENA_W = 1600;
export const ARENA_H = 900;
/** Topic tiles sit in the upper part of the arena… */
export const TILE_TOP = 40;
export const TILE_BOTTOM = 400;
/** …ships fly in the lower part… */
export const SHIP_MIN_Y = 470;
export const SHIP_MAX_Y = 815;
/** …and lanes that survive fly down into the safe zone at the very bottom. */
export const SAFE_ZONE_Y = 868;

export const MAX_BATTLE_TOPICS = 40;
/** Enemies per lane before they start getting tougher rather than more numerous. */
export const MAX_ENEMIES_PER_LANE = 110;
export const COUNTDOWN_MS = 3500;
/** A finished lane flies down to the safe zone while the next one moves in. */
export const LANE_SWAP_MS = 1500;

// ------------------------------------------------------------------ Ships

/** Ships drift back towards the bottom unless thrusting forward. */
export const FLIGHT = { thrust: 2600, maxSpeed: 620, pushBack: 900, damping: 3.2 } as const;

export const SHIP_KINDS = ["viper", "lancer", "hornet"] as const;
export type ShipKind = (typeof SHIP_KINDS)[number];

/** Weapon codes used in hit claims. */
export type WeaponCode = "b" | "l" | "m" | "od" | "ion" | "sw";
export const WEAPON_CODES: readonly WeaponCode[] = ["b", "l", "m", "od", "ion", "sw"];

export interface ShipSpec {
  name: string;
  weapon: string;
  blurb: string;
  special: string;
  specialBlurb: string;
  colour: string;
  /** Normal fire. */
  primary: WeaponCode;
  specialWeapon: WeaponCode;
  /** Milliseconds between shots (laser: between damage ticks). */
  fireMs: number;
  dmg: number;
  specialMs: number;
}

export const SHIPS: Record<ShipKind, ShipSpec> = {
  viper: {
    name: "Viper",
    weapon: "Rapid blaster",
    blurb: "Sprays fast bolts. Hard to miss, easy to love.",
    special: "Overdrive",
    specialBlurb: "Six seconds of triple-spread, double-speed fire.",
    colour: "#facc15",
    primary: "b",
    specialWeapon: "od",
    fireMs: 110,
    dmg: 1,
    specialMs: 6000,
  },
  lancer: {
    name: "Lancer",
    weapon: "Laser beam",
    blurb: "A continuous beam that burns whatever's straight ahead.",
    special: "Ion Cannon",
    specialBlurb: "A screen-high ion blast that vaporises everything in its column.",
    colour: "#22d3ee",
    primary: "l",
    specialWeapon: "ion",
    fireMs: 120,
    dmg: 1,
    specialMs: 2200,
  },
  hornet: {
    name: "Hornet",
    weapon: "Homing missiles",
    blurb: "Slow, heavy rockets that find their own way.",
    special: "Swarm",
    specialBlurb: "Launches sixteen homing missiles at once.",
    colour: "#fb923c",
    primary: "m",
    specialWeapon: "sw",
    fireMs: 550,
    dmg: 5,
    specialMs: 1600,
  },
};

export const SWARM_MISSILES = 16;
/** Damage per weapon code; the server never trusts a client's damage number. */
export const WEAPON_DMG: Record<WeaponCode, number> = { b: 1, l: 1, m: 5, od: 1, ion: 3, sw: 5 };
/** Charge needed for a special; normal-weapon damage dealt fills it 1:1. */
export const SPECIAL_COST = 60;
/** Specials keep landing for a moment after they end (missiles in flight). */
export const SPECIAL_GRACE_MS = 1500;

/** Allowed horizontal gap between a shot's line and an attacker it claims to hit. */
const LINE_TOLERANCE: Record<WeaponCode, number> = {
  b: 70,
  od: 260,
  l: 40,
  ion: 110,
  m: Infinity,
  sw: Infinity,
};
/** Damage per second a player can deal with each weapon, with headroom. */
export const DPS_BUDGET: Record<WeaponCode, number> = { b: 14, od: 45, l: 13, ion: 500, m: 16, sw: 120 };

/** How far in the past a hit may be claimed. */
export const HIT_MAX_AGE_MS = 2000;

// ------------------------------------------------------------------ Enemies

export type AttackerKind = "drone" | "grunt" | "brute" | "boss";

export interface EnemySpec {
  hp: number;
  radius: number;
  speed: number;
  strikes: number;
  strikeGapMs: number;
  dmg: number;
}

export const ENEMIES: Record<Exclude<AttackerKind, "boss">, EnemySpec> = {
  /** Fodder: fragile, quick, nibbles. */
  drone: { hp: 2, radius: 18, speed: 300, strikes: 2, strikeGapMs: 650, dmg: 3 },
  grunt: { hp: 5, radius: 24, speed: 230, strikes: 3, strikeGapMs: 850, dmg: 6 },
  /** Slow and heavy: ignore one and a topic is in trouble. */
  brute: { hp: 16, radius: 34, speed: 150, strikes: 4, strikeGapMs: 950, dmg: 11 },
};

export const BOSS = {
  radius: 64,
  speed: 100,
  visits: 3,
  strikesPerVisit: 3,
  strikeGapMs: 1000,
  dmg: 14,
} as const;

export function bossHp(players: number): number {
  return 50 + 35 * Math.max(1, players);
}

export const BASE_TOPIC_HP = 60;
export const SHIELD_HP = 30;

/** Bigger teams bring bigger invasions, so topics toughen up with them; shields add on top. */
export function topicMaxHp(shields: number, players = 1): number {
  return Math.round(BASE_TOPIC_HP * (0.6 + 0.4 * Math.max(1, players)) + SHIELD_HP * shields);
}

// ------------------------------------------------------------------ Script

export interface TopicTile {
  topicId: string;
  /** Which lane (in battle order) this tile belongs to. */
  level: number;
  /** centre */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Waypoint {
  x: number;
  y: number;
  at: number;
}

export interface Strike {
  topicId: string;
  at: number;
  dmg: number;
}

export interface AttackerScript {
  id: number;
  level: number;
  kind: AttackerKind;
  hp: number;
  waypoints: Waypoint[];
  strikes: Strike[];
}

export interface BattleLevel {
  laneId: string;
  title: string;
  /** Tiles are in place and under attack from here… */
  startsAt: number;
  /** …until here, when they fly down to safety. */
  endsAt: number;
}

/** Deterministic grid of a lane's topic tiles across the top of the arena. */
export function layoutTiles(topicIds: string[], level = 0): TopicTile[] {
  const n = topicIds.length;
  if (n === 0) return [];
  const side = 40;
  const gap = 14;
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 3))));
  const rows = Math.ceil(n / cols);
  const w = Math.min(340, (ARENA_W - side * 2 - gap * (cols - 1)) / cols);
  const h = Math.min(130, (TILE_BOTTOM - TILE_TOP - gap * (rows - 1)) / rows);
  const gridW = cols * w + (cols - 1) * gap;
  const left = (ARENA_W - gridW) / 2;
  return topicIds.map((topicId, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // Centre a short final row.
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const rowLeft = left + ((cols - inRow) * (w + gap)) / 2;
    return {
      topicId,
      level,
      x: rowLeft + col * (w + gap) + w / 2,
      y: TILE_TOP + row * (h + gap) + h / 2,
      w,
      h,
    };
  });
}

/** Attacker position at time t, or null when it isn't on the field. */
export function attackerPos(a: AttackerScript, t: number): { x: number; y: number } | null {
  const wps = a.waypoints;
  const first = wps[0];
  const last = wps[wps.length - 1];
  if (!first || !last || t < first.at || t > last.at) return null;
  for (let i = 1; i < wps.length; i++) {
    const p = wps[i - 1] as Waypoint;
    const q = wps[i] as Waypoint;
    if (t <= q.at) {
      const span = q.at - p.at;
      const f = span <= 0 ? 1 : (t - p.at) / span;
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
    }
  }
  return { x: last.x, y: last.y };
}

export function attackerRadius(a: { kind: AttackerKind }): number {
  return a.kind === "boss" ? BOSS.radius : ENEMIES[a.kind].radius;
}

/** Mulberry32: small deterministic PRNG. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function travel(from: { x: number; y: number }, to: { x: number; y: number }, speed: number): number {
  return (Math.hypot(to.x - from.x, to.y - from.y) / speed) * 1000;
}

/** Pressure builds lane by lane. */
export function laneIntensity(level: number): number {
  return Math.min(1.5, 0.85 + 0.13 * level);
}

/** Damage per second we assume each player manages (aim, dodging and misses included). */
const ASSUMED_DPS = 5;
/** Enemy health each lane brings, relative to what the team can deal in that time. */
const PRESSURE = 0.85;

/**
 * How many of each enemy a lane brings. Sized by total health against the team's firepower, so
 * difficulty doesn't depend on how many topics the lane has: there's always more than you can
 * shoot, so you have to choose what to save.
 */
export function waveFor(
  players: number,
  level: number,
  laneMs = 18_000
): { drone: number; grunt: number; brute: number } {
  const p = Math.max(1, players);
  const budget = PRESSURE * laneIntensity(level) * p * ASSUMED_DPS * (laneMs / 1000);
  const bruteShare = level === 0 ? 0 : Math.min(0.3, 0.1 + 0.05 * level);
  const gruntShare = 0.45;
  const droneShare = 1 - gruntShare - bruteShare;
  return {
    drone: Math.round((budget * droneShare) / ENEMIES.drone.hp),
    grunt: Math.round((budget * gruntShare) / ENEMIES.grunt.hp),
    brute: Math.round((budget * bruteShare) / ENEMIES.brute.hp),
  };
}

export function laneBosses(level: number, levels: number, players: number): number {
  // The opening lane is a warm-up unless it's the only one.
  if (level === 0 && levels > 1) return 0;
  return Math.min(3, 1 + Math.floor((level - 1) / 3) + (players >= 6 ? 1 : 0));
}

interface LaneScriptParams {
  tiles: TopicTile[];
  shields: Record<string, number>;
  players: number;
  startsAt: number;
  endsAt: number;
  rand: () => number;
  level: number;
  levels: number;
  firstId: number;
}

function laneScript(p: LaneScriptParams): AttackerScript[] {
  const { tiles, rand } = p;
  const out: AttackerScript[] = [];
  if (tiles.length === 0) return out;
  const players = Math.max(1, p.players);
  const full = waveFor(players, p.level, p.endsAt - p.startsAt);
  // Big teams would mean hundreds of drones; keep the count sane and make each one tougher instead.
  const count = full.drone + full.grunt + full.brute;
  const toughness = Math.max(1, count / MAX_ENEMIES_PER_LANE);
  const wave = {
    drone: Math.round(full.drone / toughness),
    grunt: Math.round(full.grunt / toughness),
    brute: Math.round(full.brute / toughness),
  };
  let nextId = p.firstId;

  // Spread each kind evenly over the lane's topics, starting at a random topic.
  const spawns: { tile: TopicTile; at: number; kind: Exclude<AttackerKind, "boss"> }[] = [];
  for (const kind of ["drone", "grunt", "brute"] as const) {
    const spec = ENEMIES[kind];
    // Leave time to arrive and land at least one strike before the lane escapes.
    const latest = p.endsAt - spec.strikeGapMs - 3500;
    const offset = Math.floor(rand() * tiles.length);
    for (let i = 0; i < wave[kind]; i++) {
      const tile = tiles[(offset + i) % tiles.length] as TopicTile;
      spawns.push({ tile, kind, at: p.startsAt + rand() * Math.max(500, latest - p.startsAt) });
    }
  }
  spawns.sort((a, b) => a.at - b.at);

  for (const { tile, at, kind } of spawns) {
    const spec = ENEMIES[kind];
    const start = { x: 40 + rand() * (ARENA_W - 80), y: -50 };
    const mid = {
      x: Math.min(ARENA_W - 40, Math.max(40, (start.x + tile.x) / 2 + (rand() - 0.5) * 500)),
      y: tile.y * 0.45,
    };
    const hover = {
      x: tile.x + (rand() - 0.5) * tile.w * 0.6,
      y: tile.y + (rand() - 0.5) * tile.h * 0.5,
    };
    const tMid = at + travel(start, mid, spec.speed);
    const tHover = tMid + travel(mid, hover, spec.speed);
    const strikes: Strike[] = [];
    for (let s = 1; s <= spec.strikes; s++) {
      strikes.push({ topicId: tile.topicId, at: tHover + s * spec.strikeGapMs, dmg: spec.dmg * toughness });
    }
    // Attackers give up and leave when their lane escapes.
    const tDone = Math.min(tHover + spec.strikes * spec.strikeGapMs + 200, Math.max(tHover, p.endsAt));
    const exit = { x: hover.x + (rand() - 0.5) * 300, y: -80 };
    out.push({
      id: nextId++,
      kind,
      level: p.level,
      hp: Math.round(spec.hp * toughness),
      waypoints: [
        { ...start, at },
        { ...mid, at: tMid },
        { ...hover, at: tHover },
        { ...hover, at: tDone },
        { ...exit, at: tDone + travel(hover, exit, spec.speed * 1.8) },
      ],
      strikes: strikes.filter((st) => st.at < p.endsAt),
    });
  }

  // Bosses go after the most-shielded topics first, then wander.
  const byShields = [...tiles].sort((a, b) => (p.shields[b.topicId] ?? 0) - (p.shields[a.topicId] ?? 0));
  const bosses = laneBosses(p.level, p.levels, players);
  const window = p.endsAt - p.startsAt;
  for (let b = 0; b < bosses; b++) {
    const at = p.startsAt + 800 + (b * window * 0.4) / Math.max(1, bosses);
    const visits: TopicTile[] = [byShields[b % byShields.length] as TopicTile];
    for (let v = 1; v < Math.min(BOSS.visits, tiles.length + 1); v++) {
      visits.push(tiles[Math.floor(rand() * tiles.length)] as TopicTile);
    }
    let pos = { x: rand() < 0.5 ? -80 : ARENA_W + 80, y: 80 + rand() * 120 };
    let t = at;
    const waypoints: Waypoint[] = [{ ...pos, at: t }];
    const strikes: Strike[] = [];
    for (const tile of visits) {
      if (t >= p.endsAt) break;
      const hover = { x: tile.x, y: tile.y };
      t += travel(pos, hover, BOSS.speed);
      waypoints.push({ ...hover, at: t });
      for (let s = 1; s <= BOSS.strikesPerVisit; s++) {
        strikes.push({ topicId: tile.topicId, at: t + s * BOSS.strikeGapMs, dmg: BOSS.dmg });
      }
      t = Math.min(t + BOSS.strikesPerVisit * BOSS.strikeGapMs + 300, Math.max(t, p.endsAt));
      waypoints.push({ ...hover, at: t });
      pos = hover;
    }
    const exit = { x: pos.x < ARENA_W / 2 ? -140 : ARENA_W + 140, y: 60 };
    waypoints.push({ ...exit, at: t + travel(pos, exit, BOSS.speed * 2.5) });
    out.push({
      id: nextId++,
      kind: "boss",
      level: p.level,
      hp: Math.round(bossHp(players) * laneIntensity(p.level)),
      waypoints,
      // A boss still loitering when its lane escapes stops doing damage.
      strikes: strikes.filter((st) => st.at < p.endsAt),
    });
  }

  // Whole units and milliseconds are plenty, and keep the script small on the wire.
  for (const a of out) {
    a.waypoints = a.waypoints.map((w) => ({ x: Math.round(w.x), y: Math.round(w.y), at: Math.round(w.at) }));
    a.strikes = a.strikes.map((s) => ({ ...s, at: Math.round(s.at), dmg: Math.round(s.dmg * 10) / 10 }));
  }
  return out;
}

export interface BattlePlanParams {
  /** One entry per lane that has topics, in board order. */
  lanes: { laneId: string; title: string; topicIds: string[] }[];
  shields: Record<string, number>;
  players: number;
  startsAt: number;
  laneMs: number;
  rand: () => number;
}

/**
 * Lanes come in one after another: each sits at the top under attack for `laneMs`, then flies
 * down to the safe zone as the next lane moves in. Pressure rises lane by lane.
 */
export function planBattle(p: BattlePlanParams): {
  levels: BattleLevel[];
  tiles: TopicTile[];
  script: AttackerScript[];
} {
  const levels: BattleLevel[] = [];
  const tiles: TopicTile[] = [];
  const script: AttackerScript[] = [];
  let at = p.startsAt;
  p.lanes.forEach((lane, level) => {
    const laneTiles = layoutTiles(lane.topicIds, level);
    const startsAt = at;
    const endsAt = startsAt + p.laneMs;
    levels.push({ laneId: lane.laneId, title: lane.title, startsAt, endsAt });
    tiles.push(...laneTiles);
    script.push(
      ...laneScript({
        tiles: laneTiles,
        shields: p.shields,
        players: p.players,
        startsAt,
        endsAt,
        rand: p.rand,
        level,
        levels: p.lanes.length,
        firstId: script.length,
      })
    );
    at = endsAt + LANE_SWAP_MS;
  });
  return { levels, tiles, script };
}

/** The lane being fought at time t, or the one arriving during a swap. */
export function currentLevel(levels: BattleLevel[], t: number): number {
  const i = levels.findIndex((l) => t <= l.endsAt);
  return i === -1 ? levels.length - 1 : i;
}

/** Where a lane's tiles are drawn: sliding in from the top, in place, or flying down to safety. */
export function laneOffset(level: BattleLevel, t: number): number | null {
  const ease = (x: number) => 1 - (1 - x) ** 3;
  if (t < level.startsAt - LANE_SWAP_MS) return null;
  if (t < level.startsAt)
    return -(1 - ease((t - (level.startsAt - LANE_SWAP_MS)) / LANE_SWAP_MS)) * ARENA_H * 0.6;
  if (t <= level.endsAt) return 0;
  const f = (t - level.endsAt) / LANE_SWAP_MS;
  if (f >= 1) return null;
  return f * f * (SAFE_ZONE_Y - TILE_TOP);
}

// ------------------------------------------------------------------ Hit validation

export interface ShipSample {
  x: number;
  y: number;
  at: number;
}

/**
 * Server-side check that a hit claim is plausible: the attacker was on the field, the claim is
 * recent, and (for weapons that fire straight up) the ship was roughly underneath it.
 */
export function plausibleHit(
  a: AttackerScript,
  at: number,
  weapon: WeaponCode,
  ship: ShipSample[],
  now: number
): boolean {
  if (at > now + 250 || at < now - HIT_MAX_AGE_MS) return false;
  const pos = attackerPos(a, at);
  if (!pos || pos.y < -60 || pos.y > ARENA_H) return false;
  const tolerance = LINE_TOLERANCE[weapon];
  if (tolerance === Infinity) return true;
  // Compare with where the ship was around the time of the shot (bullets take a moment to land).
  const near = ship.filter((s) => s.at >= at - 900 && s.at <= at + 250);
  const samples = near.length > 0 ? near : ship.slice(-1);
  return samples.some((s) => pos.y < s.y && Math.abs(pos.x - s.x) <= tolerance + attackerRadius(a));
}
