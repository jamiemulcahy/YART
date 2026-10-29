import { describe, expect, it } from "vitest";
import { FIRE_INTERVAL_MS, attackerPos, planBattle, seededRandom, topicMaxHp } from "./battle";

function simulate(players: number, efficiency: number, seed: number) {
  const lanes = Array.from({ length: 5 }, (_, l) => ({
    laneId: `l${l}`,
    title: `Lane ${l}`,
    topicIds: Array.from({ length: 5 }, (_, i) => `l${l}t${i}`),
  }));
  const shields: Record<string, number> = {};
  for (const lane of lanes) {
    shields[lane.topicIds[0]!] = 4;
    shields[lane.topicIds[1]!] = 2;
  }
  const plan = planBattle({
    lanes,
    shields,
    players,
    startsAt: 0,
    levelMs: 25_000,
    rand: seededRandom(seed),
  });
  const hp = new Map(plan.script.map((a) => [a.id, a.hp]));
  const topicHp: Record<string, number> = {};
  for (const t of plan.tiles) topicHp[t.topicId] = topicMaxHp(shields[t.topicId] ?? 0);
  const strikes = plan.script
    .flatMap((a) => a.strikes.map((s) => ({ ...s, a: a.id })))
    .sort((x, y) => x.at - y.at);
  let si = 0;
  const shotsPerTick = (players * efficiency * 100) / FIRE_INTERVAL_MS;
  let budget = 0;
  const end = plan.levels.at(-1)!.endsAt;
  for (let t = 0; t <= end; t += 100) {
    budget += shotsPerTick;
    while (budget >= 1) {
      // Shoot whatever on-field attacker will strike soonest.
      let best: number | null = null;
      let bestAt = Infinity;
      for (const a of plan.script) {
        if ((hp.get(a.id) ?? 0) <= 0 || !attackerPos(a, t)) continue;
        const next = a.strikes.find((s) => s.at >= t)?.at ?? Infinity;
        if (next < bestAt) {
          bestAt = next;
          best = a.id;
        }
      }
      if (best === null) {
        budget = 0;
        break;
      }
      hp.set(best, (hp.get(best) ?? 0) - 1);
      budget -= 1;
    }
    while (si < strikes.length && strikes[si]!.at <= t) {
      const s = strikes[si++]!;
      if ((hp.get(s.a) ?? 0) > 0 && (topicHp[s.topicId] ?? 0) > 0) topicHp[s.topicId]! -= s.dmg;
    }
  }
  return plan.levels.map((_, l) => {
    const ids = lanes[l]!.topicIds;
    const alive = ids.map((id) =>
      (topicHp[id] ?? 0) > 0 ? (shields[id] ? "S" : "s") : shields[id] ? "X" : "x"
    );
    return alive.join("");
  });
}

// A greedy simulated team (always shoots whatever will strike soonest) at a given hit rate.
// Pins the difficulty curve: lane 1 is holdable, pressure rises, and small teams take losses late.
describe("battle balance", () => {
  const fallen = (lane: string) => [...lane].filter((c) => c === "x" || c === "X").length;

  it("lets a decent team hold the first lane", () => {
    for (const seed of [1, 2, 3]) expect(fallen(simulate(3, 0.4, seed)[0]!)).toBeLessThanOrEqual(1);
  });

  it("makes later lanes harder than the first", () => {
    for (const players of [1, 3, 6]) {
      const lanes = [1, 2, 3].map((seed) => simulate(players, 0.4, seed));
      const first = lanes.reduce((n, l) => n + fallen(l[0]!), 0);
      const last = lanes.reduce((n, l) => n + fallen(l.at(-1)!), 0);
      expect(last).toBeGreaterThan(first);
    }
  });

  it("still lets shields matter for a strong solo player", () => {
    const shieldedSurvivors = [1, 2, 3]
      .flatMap((seed) => simulate(1, 0.6, seed))
      .reduce((n, lane) => n + [...lane].filter((c) => c === "S").length, 0);
    expect(shieldedSurvivors).toBeGreaterThan(10);
  });
});
