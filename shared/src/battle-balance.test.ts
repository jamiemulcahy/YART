import { describe, expect, it } from "vitest";
import { attackerPos, planBattle, seededRandom, topicMaxHp } from "./battle";

/**
 * A greedy simulated team (always shoots whatever will strike soonest) dealing `dps` damage per
 * player per second. A real player's ship deals ~9 dps flat out; 4–6 is a decent human who also
 * dodges about and misses, and specials push the top end higher.
 */
function simulate(players: number, dps: number, seed: number) {
  const lanes = Array.from({ length: 5 }, (_, l) => ({
    laneId: `l${l}`,
    title: `Lane ${l}`,
    topicIds: Array.from({ length: 5 }, (_, i) => `l${l}t${i}`),
  }));
  const shields: Record<string, number> = {};
  // Shields grow with the team: the favourite gets about one per person, the runner-up half that.
  for (const lane of lanes) {
    shields[lane.topicIds[0]!] = Math.ceil(players * 1.2);
    shields[lane.topicIds[1]!] = Math.ceil(players * 0.6);
  }
  const plan = planBattle({ lanes, shields, players, startsAt: 0, laneMs: 18_000, rand: seededRandom(seed) });
  const hp = new Map(plan.script.map((a) => [a.id, a.hp]));
  const topicHp: Record<string, number> = {};
  for (const t of plan.tiles) topicHp[t.topicId] = topicMaxHp(shields[t.topicId] ?? 0, players);
  const strikes = plan.script
    .flatMap((a) => a.strikes.map((s) => ({ ...s, a: a.id })))
    .sort((x, y) => x.at - y.at);
  let si = 0;
  const perTick = (players * dps) / 10;
  let budget = 0;
  const end = plan.levels.at(-1)!.endsAt;
  for (let t = 0; t <= end; t += 100) {
    budget += perTick;
    while (budget >= 1) {
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
  // Per lane: S/s = shielded/unshielded survived, X/x = fell.
  return lanes.map((lane) =>
    lane.topicIds
      .map((id) => ((topicHp[id] ?? 0) > 0 ? (shields[id] ? "S" : "s") : shields[id] ? "X" : "x"))
      .join("")
  );
}

const fallen = (lane: string) => [...lane].filter((c) => c === "x" || c === "X").length;
const runs = (players: number, dps: number) => [1, 2, 3].map((seed) => simulate(players, dps, seed));

describe("battle balance", () => {
  it("prints the difficulty table", () => {
    for (const [players, dps] of [
      [1, 3],
      [1, 5],
      [3, 4],
      [6, 4],
      [10, 4],
    ] as const) {
      // eslint-disable-next-line no-console -- the table is the point of this test when tuning
      console.log(
        `players=${players} dps=${dps}: ${runs(players, dps)
          .map((r) => r.join(" "))
          .join(" | ")}`
      );
    }
  });

  it("lets a decent team hold the first lane", () => {
    for (const r of runs(3, 4)) expect(fallen(r[0]!)).toBeLessThanOrEqual(1);
  });

  it("makes later lanes harder than the first", () => {
    for (const players of [1, 3, 6]) {
      const all = runs(players, 4);
      const first = all.reduce((n, r) => n + fallen(r[0]!), 0);
      const last = all.reduce((n, r) => n + fallen(r.at(-1)!), 0);
      expect(last).toBeGreaterThan(first);
    }
  });

  it("has real jeopardy: an average small team loses something", () => {
    const lost = runs(3, 4)
      .flat()
      .reduce((n, lane) => n + fallen(lane), 0);
    expect(lost).toBeGreaterThan(3);
  });

  it("still lets shields matter", () => {
    for (const players of [1, 3, 6]) {
      const lanes = runs(players, 4).flat();
      const shieldedSurvived = lanes.reduce((n, l) => n + [...l].filter((c) => c === "S").length, 0);
      const unshieldedSurvived = lanes.reduce((n, l) => n + [...l].filter((c) => c === "s").length, 0);
      // Two of five topics per lane are shielded: they should survive at a clearly higher rate.
      expect(shieldedSurvived / 2).toBeGreaterThan(unshieldedSurvived / 3);
    }
  });
});
