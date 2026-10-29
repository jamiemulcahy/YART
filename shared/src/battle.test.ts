import { describe, expect, it } from "vitest";
import {
  ARENA_H,
  ARENA_W,
  GRUNT,
  attackerPos,
  LEVEL_GAP_MS,
  bossCount,
  currentLevel,
  generateScript,
  gruntsPerTopic,
  layoutTiles,
  planBattle,
  plausibleHit,
  seededRandom,
} from "./battle";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

describe("layoutTiles", () => {
  it.each([1, 3, 7, 12, 25, 40])("lays out %i tiles inside the arena without overlap", (n) => {
    const tiles = layoutTiles(ids(n));
    expect(tiles).toHaveLength(n);
    for (const t of tiles) {
      expect(t.x - t.w / 2).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w / 2).toBeLessThanOrEqual(ARENA_W);
      expect(t.y - t.h / 2).toBeGreaterThanOrEqual(0);
      expect(t.y + t.h / 2).toBeLessThan(ARENA_H * 0.75);
    }
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i]!;
        const b = tiles[j]!;
        const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2;
        const overlapY = Math.abs(a.y - b.y) < (a.h + b.h) / 2;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });
});

describe("generateScript", () => {
  const tiles = layoutTiles(ids(10));
  const params = (seed: number, players = 4) => ({
    tiles,
    shields: { t3: 5, t7: 2 },
    players,
    startsAt: 10_000,
    endsAt: 100_000,
    rand: seededRandom(seed),
  });

  it("is deterministic for a seed, so every client sees the same battle", () => {
    expect(generateScript(params(42))).toEqual(generateScript(params(42)));
    expect(generateScript(params(42))).not.toEqual(generateScript(params(43)));
  });

  it("scales the invasion with the number of players", () => {
    for (const players of [1, 4, 12]) {
      const script = generateScript(params(1, players));
      const grunts = script.filter((a) => a.kind === "grunt");
      const bosses = script.filter((a) => a.kind === "boss");
      expect(grunts).toHaveLength(tiles.length * gruntsPerTopic(players));
      expect(bosses).toHaveLength(bossCount(players));
    }
  });

  it("sends every grunt to strike its own topic before the battle ends", () => {
    const script = generateScript(params(7));
    for (const a of script.filter((x) => x.kind === "grunt")) {
      expect(a.strikes).toHaveLength(GRUNT.strikes);
      const topic = a.strikes[0]!.topicId;
      expect(a.strikes.every((s) => s.topicId === topic)).toBe(true);
      expect(a.waypoints[0]!.at).toBeGreaterThanOrEqual(10_000);
      expect(a.strikes.at(-1)!.at).toBeLessThan(100_000);
    }
  });

  it("sends the first boss after the most-shielded topic", () => {
    const boss = generateScript(params(3)).find((a) => a.kind === "boss")!;
    expect(boss.strikes[0]!.topicId).toBe("t3");
  });

  it("attacker positions are continuous and only defined while on the field", () => {
    const a = generateScript(params(9))[0]!;
    const first = a.waypoints[0]!;
    const last = a.waypoints.at(-1)!;
    expect(attackerPos(a, first.at - 1)).toBeNull();
    expect(attackerPos(a, last.at + 1)).toBeNull();
    let prev = attackerPos(a, first.at)!;
    for (let t = first.at + 50; t <= last.at; t += 50) {
      const p = attackerPos(a, t)!;
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(40);
      prev = p;
    }
  });
});

describe("plausibleHit", () => {
  const [a] = generateScript({
    tiles: layoutTiles(["only"]),
    shields: {},
    players: 1,
    startsAt: 0,
    endsAt: 90_000,
    rand: seededRandom(5),
  });
  const attacker = a!;
  const t = attacker.waypoints[2]!.at;
  const pos = attackerPos(attacker, t)!;

  it("accepts a hit from a ship underneath the attacker", () => {
    expect(plausibleHit(attacker, t, pos.x, t + 100)).toBe(true);
  });
  it("rejects hits from the far side of the arena", () => {
    expect(plausibleHit(attacker, t, pos.x > 800 ? 0 : ARENA_W, t + 100)).toBe(false);
  });
  it("rejects stale and future claims", () => {
    expect(plausibleHit(attacker, t, pos.x, t + 10_000)).toBe(false);
    expect(plausibleHit(attacker, t + 5_000, pos.x, t)).toBe(false);
  });
  it("rejects hits before the attacker spawns", () => {
    const before = attacker.waypoints[0]!.at - 10;
    expect(plausibleHit(attacker, before, pos.x, before)).toBe(false);
  });
});

describe("planBattle", () => {
  const plan = planBattle({
    lanes: [
      { laneId: "a", title: "Mad", topicIds: ["t1", "t2"] },
      { laneId: "b", title: "Glad", topicIds: ["t3"] },
    ],
    shields: {},
    players: 2,
    startsAt: 1000,
    levelMs: 30_000,
    rand: seededRandom(11),
  });

  it("runs one level per lane, back to back with a breather", () => {
    expect(plan.levels.map((l) => l.title)).toEqual(["Mad", "Glad"]);
    expect(plan.levels[1]!.startsAt).toBe(plan.levels[0]!.endsAt + LEVEL_GAP_MS);
    expect(currentLevel(plan.levels, plan.levels[0]!.endsAt + 1)).toBe(1);
  });

  it("keeps each level's tiles and attackers to itself", () => {
    expect(plan.tiles.filter((t) => t.level === 0).map((t) => t.topicId)).toEqual(["t1", "t2"]);
    const ids = new Set(plan.script.map((a) => a.id));
    expect(ids.size).toBe(plan.script.length);
    for (const a of plan.script) {
      const level = plan.levels[a.level]!;
      for (const s of a.strikes) {
        expect(s.at).toBeGreaterThanOrEqual(level.startsAt);
        expect(s.at).toBeLessThan(level.endsAt);
        expect(plan.tiles.find((t) => t.topicId === s.topicId)!.level).toBe(a.level);
      }
    }
  });
});
