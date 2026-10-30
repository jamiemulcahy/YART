import { describe, expect, it } from "vitest";
import {
  ARENA_H,
  ARENA_W,
  BOSS,
  ENEMIES,
  LANE_SWAP_MS,
  SAFE_ZONE_Y,
  TILE_BOTTOM,
  attackerPos,
  battleGrade,
  currentLevel,
  laneOffset,
  layoutTiles,
  planBattle,
  plausibleHit,
  scoreBattle,
  seededRandom,
  waveFor,
} from "./battle";
import type { AttackerScript } from "./battle";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

describe("layoutTiles", () => {
  it.each([1, 3, 7, 12, 25, 40])("lays out %i tiles in the top band without overlap", (n) => {
    const tiles = layoutTiles(ids(n));
    expect(tiles).toHaveLength(n);
    for (const t of tiles) {
      expect(t.x - t.w / 2).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w / 2).toBeLessThanOrEqual(ARENA_W);
      expect(t.y - t.h / 2).toBeGreaterThanOrEqual(0);
      expect(t.y + t.h / 2).toBeLessThanOrEqual(TILE_BOTTOM + 1);
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

describe("planBattle", () => {
  const plan = (seed: number, players = 4) =>
    planBattle({
      lanes: [
        { laneId: "a", title: "Mad", topicIds: ["a1", "a2", "a3"] },
        { laneId: "b", title: "Sad", topicIds: ["b1", "b2"] },
        { laneId: "c", title: "Glad", topicIds: ["c1", "c2", "c3", "c4"] },
      ],
      shields: { a2: 5, b1: 2 },
      players,
      startsAt: 10_000,
      laneMs: 18_000,
      rand: seededRandom(seed),
    });

  it("is deterministic for a seed, so every client sees the same battle", () => {
    expect(plan(42)).toEqual(plan(42));
    expect(plan(42)).not.toEqual(plan(43));
  });

  it("runs lanes back to back, overlapping only for the swap", () => {
    const { levels } = plan(1);
    expect(levels.map((l) => l.title)).toEqual(["Mad", "Sad", "Glad"]);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!.startsAt - levels[i - 1]!.endsAt).toBe(LANE_SWAP_MS);
    }
    expect(currentLevel(levels, levels[0]!.endsAt + 1)).toBe(1);
  });

  it("keeps each lane's attackers and strikes to that lane's window and tiles", () => {
    const p = plan(7);
    const ids = new Set(p.script.map((a) => a.id));
    expect(ids.size).toBe(p.script.length);
    for (const a of p.script) {
      const level = p.levels[a.level]!;
      expect(a.waypoints[0]!.at).toBeGreaterThanOrEqual(level.startsAt);
      for (const s of a.strikes) {
        expect(s.at).toBeLessThan(level.endsAt);
        expect(p.tiles.find((t) => t.topicId === s.topicId)!.level).toBe(a.level);
      }
    }
  });

  it("brings in a mix of enemies and ramps up lane by lane", () => {
    const p = plan(3, 4);
    const count = (level: number, kind: string) =>
      p.script.filter((a) => a.level === level && a.kind === kind).length;
    expect(count(0, "drone")).toBeGreaterThan(count(0, "grunt"));
    expect(count(0, "boss")).toBe(0);
    expect(count(2, "boss")).toBeGreaterThanOrEqual(1);
    expect(count(2, "brute")).toBeGreaterThan(0);
    // Later lanes trade fodder for brutes, but bring more total health.
    const health = (w: ReturnType<typeof waveFor>) =>
      w.drone * ENEMIES.drone.hp + w.grunt * ENEMIES.grunt.hp + w.brute * ENEMIES.brute.hp;
    expect(health(waveFor(4, 4))).toBeGreaterThan(health(waveFor(4, 0)) * 1.4);
    expect(waveFor(4, 4).brute).toBeGreaterThan(0);
  });

  it("sends the first boss after the most-shielded topic", () => {
    const boss = plan(3).script.find((a) => a.kind === "boss" && a.level === 1)!;
    expect(boss.strikes[0]!.topicId).toBe("b1");
  });

  it("moves attackers continuously and only while on the field", () => {
    for (const a of plan(9).script.slice(0, 30)) {
      const first = a.waypoints[0]!;
      const last = a.waypoints.at(-1)!;
      expect(attackerPos(a, first.at - 1)).toBeNull();
      expect(attackerPos(a, last.at + 1)).toBeNull();
      const speed = a.kind === "boss" ? BOSS.speed * 2.5 : ENEMIES[a.kind].speed * 1.8;
      let prev = attackerPos(a, first.at)!;
      for (let t = first.at + 50; t <= last.at; t += 50) {
        const p = attackerPos(a, t)!;
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThanOrEqual((speed * 50) / 1000 + 1);
        prev = p;
      }
    }
  });
});

describe("laneOffset", () => {
  const level = { laneId: "a", title: "Mad", startsAt: 10_000, endsAt: 28_000 };
  it("slides in, holds, then flies down into the safe zone", () => {
    expect(laneOffset(level, 10_000 - LANE_SWAP_MS - 1)).toBeNull();
    expect(laneOffset(level, 10_000 - LANE_SWAP_MS / 2)!).toBeLessThan(0);
    expect(laneOffset(level, 15_000)).toBe(0);
    expect(laneOffset(level, 28_000 + LANE_SWAP_MS / 2)!).toBeGreaterThan(0);
    expect(laneOffset(level, 28_000 + LANE_SWAP_MS - 1)!).toBeLessThanOrEqual(SAFE_ZONE_Y);
    expect(laneOffset(level, 28_000 + LANE_SWAP_MS + 1)).toBeNull();
  });
});

describe("plausibleHit", () => {
  const grunt: AttackerScript = {
    id: 1,
    level: 0,
    kind: "grunt",
    hp: 5,
    waypoints: [
      { x: 400, y: 200, at: 0 },
      { x: 400, y: 200, at: 10_000 },
    ],
    strikes: [],
  };
  const under = [{ x: 410, y: 700, at: 4900 }];
  const farAway = [{ x: 1300, y: 700, at: 4900 }];

  it("accepts blaster and laser hits from a ship underneath", () => {
    expect(plausibleHit(grunt, 5000, "b", under, 5100)).toBe(true);
    expect(plausibleHit(grunt, 5000, "l", under, 5100)).toBe(true);
  });
  it("rejects straight-line hits from the far side of the arena", () => {
    expect(plausibleHit(grunt, 5000, "b", farAway, 5100)).toBe(false);
    expect(plausibleHit(grunt, 5000, "ion", farAway, 5100)).toBe(false);
  });
  it("lets homing missiles hit anything on the field", () => {
    expect(plausibleHit(grunt, 5000, "m", farAway, 5100)).toBe(true);
  });
  it("rejects shots from in front of the target", () => {
    expect(plausibleHit(grunt, 5000, "b", [{ x: 400, y: 150, at: 4900 }], 5100)).toBe(false);
  });
  it("rejects stale, future and off-field claims", () => {
    expect(plausibleHit(grunt, 5000, "b", under, 9000)).toBe(false);
    expect(plausibleHit(grunt, 9000, "b", under, 5000)).toBe(false);
    expect(plausibleHit(grunt, 20_000, "m", under, 20_000)).toBe(false);
  });
  it("uses where the ship was when it fired, not where it is now", () => {
    const moved = [
      { x: 400, y: 700, at: 4700 },
      { x: 1400, y: 700, at: 5050 },
    ];
    expect(plausibleHit(grunt, 5000, "b", moved, 5100)).toBe(true);
  });
  it("keeps the arena sane", () => {
    expect(ARENA_H).toBeGreaterThan(SAFE_ZONE_Y);
  });
});

describe("script size", () => {
  it("stays small enough to send to every client, even for a big team", () => {
    const lanes = Array.from({ length: 8 }, (_, l) => ({
      laneId: `l${l}`,
      title: `Lane ${l}`,
      topicIds: Array.from({ length: 6 }, (_, i) => `l${l}t${i}`),
    }));
    const p = planBattle({
      lanes,
      shields: {},
      players: 30,
      startsAt: 0,
      laneMs: 30_000,
      rand: seededRandom(1),
    });
    for (let l = 0; l < lanes.length; l++) {
      expect(p.script.filter((a) => a.level === l && a.kind !== "boss").length).toBeLessThanOrEqual(115);
    }
    expect(JSON.stringify(p).length).toBeLessThan(400_000);
  });
});

describe("scoreBattle", () => {
  const enemy = (id: number, kind: AttackerScript["kind"], hp: number, entersAt = 0): AttackerScript => ({
    id,
    level: 0,
    kind,
    hp,
    waypoints: [{ x: 0, y: 0, at: entersAt }],
    strikes: [],
  });
  const script = [enemy(0, "drone", 2), enemy(1, "grunt", 5), enemy(2, "brute", 16), enemy(3, "boss", 77)];

  it("weights topics saved 60 % and enemy health destroyed 40 %", () => {
    // Half the topics saved; drone and grunt dead, brute half dead: (2 + 5 + 8) / 100 health.
    const s = scoreBattle({
      topicsSaved: 2,
      topicsFought: 4,
      completed: true,
      script,
      attackerHp: { 2: 8 },
      dead: new Set([0, 1]),
      now: 1000,
    });
    expect(s).toMatchObject({ score: 36, grade: "D", enemyHpPct: 15, topicsSaved: 2, topicsFought: 4 });
    expect(s?.destroyed).toEqual({ drone: 1, grunt: 1, brute: 0, boss: 0 });
    expect(s?.faced).toEqual({ drone: 1, grunt: 1, brute: 1, boss: 1 });
  });

  it("only counts enemies that had shown up, so ending early isn't punished", () => {
    const late = [...script, enemy(4, "brute", 1000, 5000)];
    const s = scoreBattle({
      topicsSaved: 1,
      topicsFought: 1,
      completed: false,
      script: late,
      attackerHp: {},
      dead: new Set([0, 1, 2, 3]),
      now: 1000,
    });
    expect(s).toMatchObject({ score: 100, grade: "S", enemyHpPct: 100 });
    expect(s?.faced.brute).toBe(1);
  });

  it("only gives the flawless A to a battle fought to the end", () => {
    const idle = {
      topicsSaved: 2,
      topicsFought: 2,
      script,
      attackerHp: {},
      dead: new Set<number>(),
      now: 1000,
    };
    expect(scoreBattle({ ...idle, completed: false })).toMatchObject({ score: 60, grade: "B" });
    expect(scoreBattle({ ...idle, completed: true })).toMatchObject({ score: 60, grade: "A" });
  });

  it("is null when no lane came under attack", () => {
    expect(
      scoreBattle({
        topicsSaved: 0,
        topicsFought: 0,
        completed: true,
        script,
        attackerHp: {},
        dead: new Set(),
        now: 1000,
      })
    ).toBeNull();
  });

  it.each([
    [100, false, "S"],
    [90, false, "S"],
    [89, false, "A"],
    [75, false, "A"],
    [74, false, "B"],
    [60, false, "B"],
    [59, false, "C"],
    [40, false, "C"],
    [39, false, "D"],
    [0, false, "D"],
    // Losing nothing is always worth an A, but an S still has to be earned.
    [60, true, "A"],
    [92, true, "S"],
  ] as const)("score %i (flawless: %s) is grade %s", (score, flawless, grade) => {
    expect(battleGrade(score, flawless)).toBe(grade);
  });
});
