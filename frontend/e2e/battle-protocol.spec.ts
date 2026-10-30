import { expect, test } from "@playwright/test";
import { SPECIAL_COST } from "@yart/shared";
import { apiCreateRoom, rawSocket } from "./helpers";

// The multiplayer battle at protocol level: what every player sees, and what the server allows.

type Msg = Record<string, unknown>;
type Sock = Awaited<ReturnType<typeof rawSocket>>;
interface Attacker {
  id: number;
  kind: string;
  hp: number;
  level: number;
  waypoints: { x: number; y: number; at: number }[];
}
interface Live {
  startsAt: number;
  endsAt: number;
  script: Attacker[];
}

function pos(a: Attacker, t: number) {
  const w = a.waypoints;
  if (t < w[0]!.at || t > w.at(-1)!.at) return null;
  for (let i = 1; i < w.length; i++) {
    const p = w[i - 1]!;
    const q = w[i]!;
    if (t <= q.at) {
      const f = q.at === p.at ? 1 : (t - p.at) / (q.at - p.at);
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A room with one lane of cards in the Battle phase, launched, with two pilots. */
async function battleRoom(ships: [string, string]) {
  const { code, ownerKey } = await apiCreateRoom([{ title: "Only", description: "" }]);
  const owner = await rawSocket(code, { ownerKey, ship: "viper" });
  const a = await rawSocket(code, { ship: ships[0] });
  const b = await rawSocket(code, { ship: ships[1] });
  const laneId = (
    ((owner.messages.find((m) => m.t === "snapshot") as Msg).room as Msg).lanes as { id: string }[]
  )[0]?.id;
  owner.send({ t: "phase.set", phase: "write" });
  await a.next((m) => m.t === "snapshot" && (m.room as Msg).phase === "write");
  for (let i = 0; i < 4; i++) a.send({ t: "card.add", laneId, text: `topic ${i}` });
  await owner.next((m) => m.t === "card" && (m.card as Msg).text === "topic 3");
  for (const phase of ["group", "vote", "discuss", "battle"]) owner.send({ t: "phase.set", phase });
  await a.next((m) => m.t === "snapshot" && (m.room as Msg).phase === "battle");
  owner.send({ t: "battle.launch" });
  const live = (await a.next((m) => m.t === "battle.start")).battle as Live;
  await b.next((m) => m.t === "battle.start");
  const offset = Number(a.welcome.serverTime) - Date.now();
  const serverNow = () => Date.now() + offset;
  await sleep(Math.max(0, live.startsAt - serverNow() + 100));
  return { owner, a, b, live, serverNow };
}

/** Wait until some attacker is on the field and return it with its position. */
async function onField(live: Live, serverNow: () => number, kind?: string) {
  for (let i = 0; i < 200; i++) {
    const t = serverNow();
    for (const at of live.script) {
      if (kind && at.kind !== kind) continue;
      const p = pos(at, t);
      if (p && p.y > 0 && p.y < 400) return { attacker: at, p, t };
    }
    await sleep(100);
  }
  throw new Error("no attacker on the field");
}

const close = (...socks: Sock[]) => socks.forEach((s) => s.ws.close());

test("players see each other's ships, positions and firing", async () => {
  test.setTimeout(45_000);
  const { owner, a, b } = await battleRoom(["lancer", "hornet"]);
  a.send({ t: "battle.input", x: 321, y: 600, f: true, hits: [] });
  const tick = await b.next((m) => {
    if (m.t !== "battle.tick") return false;
    const ship = ((m.tick as Msg).ships as Record<string, Msg>)[String(a.welcome.participantId)];
    return !!ship && ship.x === 321;
  });
  const ship = ((tick.tick as Msg).ships as Record<string, Msg>)[String(a.welcome.participantId)]!;
  expect(ship).toMatchObject({ x: 321, y: 600, f: true, k: "lancer" });
  // Positions are kept inside the flying area.
  a.send({ t: "battle.input", x: -50, y: 50, f: false, hits: [] });
  const clamped = await b.next((m) => {
    if (m.t !== "battle.tick") return false;
    const s = ((m.tick as Msg).ships as Record<string, Msg>)[String(a.welcome.participantId)];
    return !!s && s.x === 0;
  });
  expect(
    ((clamped.tick as Msg).ships as Record<string, Msg>)[String(a.welcome.participantId)]!.y
  ).toBeGreaterThan(400);
  close(owner, a, b);
});

test("hits land for everyone, but only with your own ship's weapon and from a plausible spot", async () => {
  test.setTimeout(60_000);
  const { owner, a, b, live, serverNow } = await battleRoom(["viper", "hornet"]);
  const { attacker, p } = await onField(live, serverNow);
  const aid = String(a.welcome.participantId);

  // A Viper can't fire missiles.
  a.send({
    t: "battle.input",
    x: Math.round(p.x),
    y: 700,
    f: true,
    hits: [{ a: attacker.id, at: serverNow(), w: "m" }],
  });
  // A blaster shot from the far side of the arena doesn't count.
  const far = p.x > 800 ? 40 : 1560;
  a.send({ t: "battle.input", x: far, y: 700, f: true, hits: [{ a: attacker.id, at: serverNow(), w: "b" }] });
  await sleep(400);
  // From underneath, it does — and the other player sees it, with credit to the shooter.
  const now = serverNow();
  const p2 = pos(attacker, now) ?? p;
  a.send({
    t: "battle.input",
    x: Math.round(p2.x),
    y: 700,
    f: true,
    hits: [{ a: attacker.id, at: now, w: "b" }],
  });
  const tick = await b.next(
    (m) => m.t === "battle.tick" && ((m.tick as Msg).hitBy as Msg)[attacker.id] === aid
  );
  expect(((tick.tick as Msg).attackerHp as Record<number, number>)[attacker.id]).toBe(attacker.hp - 1);
  close(owner, a, b);
});

test("specials need a full charge, are shared with everyone, and are capped", async () => {
  test.setTimeout(90_000);
  const { owner, a, b, live, serverNow } = await battleRoom(["hornet", "viper"]);
  const aid = String(a.welcome.participantId);

  // No charge yet: the special is refused (no effect broadcast).
  a.send({ t: "battle.special" });
  // Swarm hits without an active special are ignored.
  const first = await onField(live, serverNow);
  a.send({
    t: "battle.input",
    x: 800,
    y: 700,
    f: true,
    hits: [{ a: first.attacker.id, at: serverNow(), w: "sw" }],
  });
  await sleep(300);
  expect(b.messages.some((m) => m.t === "battle.tick" && ((m.tick as Msg).fx as unknown[]).length > 0)).toBe(
    false
  );

  // Charge up with missiles (5 damage each, within the missile rate budget).
  let charge = 0;
  for (let i = 0; i < 120 && charge < SPECIAL_COST; i++) {
    const t = serverNow();
    const lastTick = [...a.messages].reverse().find((m) => m.t === "battle.tick");
    const dead = new Set(((lastTick?.tick as Msg)?.dead as number[] | undefined) ?? []);
    const target = live.script.find((x) => {
      const q = pos(x, t);
      return q && q.y > 0 && !dead.has(x.id);
    });
    const hits = target ? [{ a: target.id, at: t, w: "m" }] : [];
    a.send({ t: "battle.input", x: 800, y: 700, f: true, hits });
    await sleep(250);
    const last = [...a.messages].reverse().find((m) => m.t === "battle.tick");
    charge = Number(
      (((last?.tick as Msg)?.ships as Record<string, Msg>)?.[aid]?.c as number | undefined) ?? 0
    );
  }
  expect(charge).toBeGreaterThanOrEqual(SPECIAL_COST);

  // Wait for a crowd so there's more to hit than the swarm can.
  const crowd = () => {
    const t = serverNow();
    const lastTick = [...a.messages].reverse().find((m) => m.t === "battle.tick");
    const dead = new Set(((lastTick?.tick as Msg)?.dead as number[] | undefined) ?? []);
    return live.script.filter((x) => pos(x, t) && !dead.has(x.id));
  };
  for (let i = 0; i < 80 && crowd().length < 20; i++) {
    a.send({ t: "battle.input", x: 800, y: 700, f: false, hits: [] });
    await sleep(100);
  }

  a.send({ t: "battle.special" });
  const fx = await b.next(
    (m) => m.t === "battle.tick" && ((m.tick as Msg).fx as Msg[]).some((f) => f.p === aid)
  );
  expect(((fx.tick as Msg).fx as Msg[])[0]).toMatchObject({ p: aid, w: "sw" });

  // The swarm is capped at 16 missiles: send 30 claims and count how many land.
  const mark = b.messages.length;
  const t = serverNow();
  const victims = crowd().slice(0, 30);
  expect(victims.length).toBeGreaterThan(16);
  const claims = victims.map((v) => ({ a: v.id, at: t, w: "sw" }));
  a.send({ t: "battle.input", x: 800, y: 700, f: true, hits: claims });
  await sleep(500);
  const landed = new Set<number>();
  for (const m of b.messages.slice(mark)) {
    if (m.t !== "battle.tick") continue;
    for (const [id, who] of Object.entries((m.tick as Msg).hitBy as Msg)) {
      if (who === aid && claims.some((c) => c.a === Number(id))) landed.add(Number(id));
    }
  }
  expect(landed.size).toBe(16);
  close(owner, a, b);
});

test("blaster fire is rate-limited however many hits a client claims", async () => {
  test.setTimeout(60_000);
  const { owner, a, b, live, serverNow } = await battleRoom(["viper", "viper"]);
  const { attacker } = await onField(live, serverNow);
  const t = serverNow();
  const p = pos(attacker, t)!;
  const spam = Array.from({ length: 40 }, () => ({ a: attacker.id, at: t, w: "b" }));
  a.send({ t: "battle.input", x: Math.round(p.x), y: 700, f: true, hits: spam });
  await sleep(400);
  const last = [...b.messages].reverse().find((m) => m.t === "battle.tick")!;
  const hp = ((last.tick as Msg).attackerHp as Record<number, number>)[attacker.id];
  // At most the per-second blaster budget (14) lands, not 40.
  if (hp !== undefined) expect(attacker.hp - hp).toBeLessThanOrEqual(14);
  close(owner, a, b);
});

test("ship choice is saved and shared; viewers can't pick one", async () => {
  const { code } = await apiCreateRoom();
  const a = await rawSocket(code, { ship: "lancer" });
  const other = await rawSocket(code);
  const snap = (other.messages.find((m) => m.t === "snapshot") as Msg).room as Msg;
  const aView = (snap.participants as Msg[]).find((p) => p.id === a.welcome.participantId)!;
  expect(aView.ship).toBe("lancer");
  a.send({ t: "ship.set", ship: "hornet" });
  await other.next((m) => m.t === "participant" && (m.participant as Msg).ship === "hornet");
  const viewer = await rawSocket(code, { viewer: true, ship: "viper" });
  viewer.send({ t: "ship.set", ship: "viper" });
  await viewer.next((m) => m.t === "error" && m.code === "VIEWER");
  close(a, other, viewer);
});
