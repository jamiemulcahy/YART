/**
 * Battle maths shared by server and clients.
 *
 * The server generates the whole battle up front as a script. Attacker
 * positions are a pure function of time, so every client draws every attacker
 * in the same place without any movement messages. Only "is it alive" and
 * "how much hp does each topic have" come from the server.
 */

export const ARENA_W = 1600;
export const ARENA_H = 900;
export const SHIP_Y = 845;
export const SHIP_HALF_W = 34;
export const BULLET_SPEED = 1500; // units/s
export const FIRE_INTERVAL_MS = 220;
export const MAX_BATTLE_TOPICS = 40;
export const COUNTDOWN_MS = 3500;

export const BASE_TOPIC_HP = 20;
export const SHIELD_HP = 15;

export const GRUNT = { hp: 3, radius: 24, speed: 210, strikes: 3, strikeGapMs: 1000, dmg: 5 } as const;
export const BOSS = {
  radius: 64,
  speed: 85,
  visits: 4,
  strikesPerVisit: 3,
  strikeGapMs: 1300,
  dmg: 8,
} as const;

/** Allowed horizontal gap between a ship and an attacker it claims to hit. */
export const HIT_TOLERANCE_X = 190;
/** How far in the past a hit may be claimed. */
export const HIT_MAX_AGE_MS = 2000;

export interface TopicTile {
  topicId: string;
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
  kind: "grunt" | "boss";
  hp: number;
  waypoints: Waypoint[];
  strikes: Strike[];
}

/** Deterministic grid of topic tiles across the top of the arena. */
export function layoutTiles(topicIds: string[]): TopicTile[] {
  const n = topicIds.length;
  if (n === 0) return [];
  const top = 40;
  const bottom = 610;
  const side = 40;
  const gap = 14;
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 2.6))));
  const rows = Math.ceil(n / cols);
  const w = Math.min(300, (ARENA_W - side * 2 - gap * (cols - 1)) / cols);
  const h = Math.min(130, (bottom - top - gap * (rows - 1)) / rows);
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
      x: rowLeft + col * (w + gap) + w / 2,
      y: top + row * (h + gap) + h / 2,
      w,
      h,
    };
  });
}

export function topicMaxHp(shields: number): number {
  return BASE_TOPIC_HP + SHIELD_HP * shields;
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

export function attackerRadius(a: AttackerScript): number {
  return a.kind === "boss" ? BOSS.radius : GRUNT.radius;
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

export interface ScriptParams {
  tiles: TopicTile[];
  /** topicId -> shields, used to make bosses go after favourites. */
  shields: Record<string, number>;
  players: number;
  startsAt: number;
  endsAt: number;
  rand: () => number;
}

function travel(from: { x: number; y: number }, to: { x: number; y: number }, speed: number): number {
  return (Math.hypot(to.x - from.x, to.y - from.y) / speed) * 1000;
}

export function gruntsPerTopic(players: number): number {
  return 3 + Math.max(1, players);
}

export function bossCount(players: number): number {
  return Math.min(3, 1 + Math.floor(players / 4));
}

export function bossHp(players: number): number {
  return 20 + 18 * Math.max(1, players);
}

export function generateScript(p: ScriptParams): AttackerScript[] {
  const { tiles, rand } = p;
  const out: AttackerScript[] = [];
  if (tiles.length === 0) return out;
  const players = Math.max(1, p.players);
  const perTopic = gruntsPerTopic(players);
  const firstSpawn = p.startsAt + 1000;
  // Leave time for the last grunts to arrive and strike before the end.
  const lastSpawn = Math.max(firstSpawn + 1000, p.endsAt - 9000);
  let nextId = 0;

  const spawns: { tile: TopicTile; at: number }[] = [];
  for (const tile of tiles) {
    for (let i = 0; i < perTopic; i++) {
      spawns.push({ tile, at: firstSpawn + rand() * (lastSpawn - firstSpawn) });
    }
  }
  spawns.sort((a, b) => a.at - b.at);

  for (const { tile, at } of spawns) {
    const start = { x: 40 + rand() * (ARENA_W - 80), y: -40 };
    const mid = {
      x: Math.min(ARENA_W - 40, Math.max(40, (start.x + tile.x) / 2 + (rand() - 0.5) * 500)),
      y: tile.y * 0.45,
    };
    const hover = {
      x: tile.x + (rand() - 0.5) * tile.w * 0.6,
      y: tile.y + (rand() - 0.5) * tile.h * 0.4,
    };
    const tMid = at + travel(start, mid, GRUNT.speed);
    const tHover = tMid + travel(mid, hover, GRUNT.speed);
    const strikes: Strike[] = [];
    for (let s = 1; s <= GRUNT.strikes; s++) {
      strikes.push({ topicId: tile.topicId, at: tHover + s * GRUNT.strikeGapMs, dmg: GRUNT.dmg });
    }
    const tDone = tHover + GRUNT.strikes * GRUNT.strikeGapMs + 200;
    const exit = { x: hover.x + (rand() - 0.5) * 300, y: -60 };
    out.push({
      id: nextId++,
      kind: "grunt",
      hp: GRUNT.hp,
      waypoints: [
        { ...start, at },
        { ...mid, at: tMid },
        { ...hover, at: tHover },
        { ...hover, at: tDone },
        { ...exit, at: tDone + travel(hover, exit, GRUNT.speed * 1.6) },
      ],
      strikes,
    });
  }

  // Bosses go after the most-shielded topics first, then wander.
  const byShields = [...tiles].sort((a, b) => (p.shields[b.topicId] ?? 0) - (p.shields[a.topicId] ?? 0));
  const bosses = bossCount(players);
  const window = p.endsAt - p.startsAt;
  for (let b = 0; b < bosses; b++) {
    const at = p.startsAt + 4000 + (b * window * 0.7) / bosses;
    const visits: TopicTile[] = [];
    const favourite = byShields[b % byShields.length] as TopicTile;
    visits.push(favourite);
    for (let v = 1; v < BOSS.visits; v++) {
      visits.push(tiles[Math.floor(rand() * tiles.length)] as TopicTile);
    }
    let pos = { x: rand() < 0.5 ? -80 : ARENA_W + 80, y: 80 + rand() * 120 };
    let t = at;
    const waypoints: Waypoint[] = [{ ...pos, at: t }];
    const strikes: Strike[] = [];
    for (const tile of visits) {
      const hover = { x: tile.x, y: tile.y };
      t += travel(pos, hover, BOSS.speed);
      waypoints.push({ ...hover, at: t });
      for (let s = 1; s <= BOSS.strikesPerVisit; s++) {
        strikes.push({ topicId: tile.topicId, at: t + s * BOSS.strikeGapMs, dmg: BOSS.dmg });
      }
      t += BOSS.strikesPerVisit * BOSS.strikeGapMs + 300;
      waypoints.push({ ...hover, at: t });
      pos = hover;
    }
    const exit = { x: pos.x < ARENA_W / 2 ? -120 : ARENA_W + 120, y: 60 };
    waypoints.push({ ...exit, at: t + travel(pos, exit, BOSS.speed * 2) });
    out.push({ id: nextId++, kind: "boss", hp: bossHp(players), waypoints, strikes });
  }

  return out;
}

/** Server-side check that a hit claim is plausible. */
export function plausibleHit(a: AttackerScript, at: number, shipX: number, now: number): boolean {
  if (at > now + 250 || at < now - HIT_MAX_AGE_MS) return false;
  const pos = attackerPos(a, at);
  if (!pos) return false;
  if (pos.y < -30 || pos.y > SHIP_Y) return false;
  return Math.abs(pos.x - shipX) <= HIT_TOLERANCE_X + attackerRadius(a);
}
