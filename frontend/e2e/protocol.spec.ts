import { expect, test } from "@playwright/test";
import { apiCreateRoom, rawSocket, WORKER_URL } from "./helpers";

// Protocol-level tests: what a developer poking at the WebSocket by hand can and can't do.

type Msg = Record<string, unknown>;
const isError = (code: string) => (m: Msg) => m.t === "error" && m.code === code;

test("a participant can't do owner things", async () => {
  const { code } = await apiCreateRoom();
  const p = await rawSocket(code);
  p.send({ t: "phase.set", phase: "write" });
  await p.next(isError("NOT_OWNER"));
  p.send({ t: "room.delete" });
  await p.next(
    (m) => m.t === "error" && m.code === "NOT_OWNER" && p.messages.filter(isError("NOT_OWNER")).length === 2
  );
  p.ws.close();
});

test("hidden card text never reaches other participants", async () => {
  const { code, ownerKey } = await apiCreateRoom();
  const owner = await rawSocket(code, { ownerKey });
  const author = await rawSocket(code);
  const other = await rawSocket(code);
  owner.send({ t: "phase.set", phase: "write" });
  await other.next((m) => m.t === "snapshot" && (m.room as Msg).phase === "write");
  const lanes = (
    (await owner.next((m) => m.t === "snapshot" && (m.room as Msg).phase === "write")).room as Msg
  ).lanes as { id: string }[];

  author.send({ t: "card.add", laneId: lanes[0]?.id, text: "top secret opinion" });
  const seen = await other.next((m) => m.t === "card");
  expect((seen.card as Msg).text).toBeNull();
  const mine = await author.next((m) => m.t === "card");
  expect((mine.card as Msg).text).toBe("top secret opinion");
  expect(JSON.stringify(other.messages)).not.toContain("top secret");
  // Authorship isn't exposed either.
  expect(JSON.stringify(seen)).not.toContain(String(author.welcome.participantId));

  owner.send({ t: "cards.reveal" });
  const revealed = await other.next(
    (m) => m.t === "snapshot" && ((m.room as Msg).cards as Msg[]).some((c) => c.text === "top secret opinion")
  );
  expect(revealed).toBeTruthy();
  for (const s of [owner, author, other]) s.ws.close();
});

test("a participant id can't be used to impersonate someone", async () => {
  const { code } = await apiCreateRoom();
  const alice = await rawSocket(code);
  const alicesToken = String(alice.welcome.token);
  const mallory = await rawSocket(code, { token: alice.welcome.participantId });
  expect(mallory.welcome.participantId).not.toBe(alice.welcome.participantId);
  // The real token does restore the same identity, even while the first socket is still open.
  const aliceAgain = await rawSocket(code, { token: alicesToken });
  expect(aliceAgain.welcome.participantId).toBe(alice.welcome.participantId);
  for (const s of [alice, mallory, aliceAgain]) s.ws.close();
});

test("server enforces text, card and shield limits", async () => {
  const { code, ownerKey } = await apiCreateRoom([{ title: "Only", description: "" }]);
  const owner = await rawSocket(code, { ownerKey });
  const p = await rawSocket(code);
  const laneId = (
    ((owner.messages.find((m) => m.t === "snapshot") as Msg).room as Msg).lanes as { id: string }[]
  )[0]?.id;

  p.send({ t: "card.add", laneId, text: "too early" });
  await p.next(isError("WRONG_PHASE"));

  owner.send({ t: "phase.set", phase: "write" });
  await p.next((m) => m.t === "snapshot" && (m.room as Msg).phase === "write");

  p.send({ t: "card.add", laneId, text: "x".repeat(501) });
  await p.next(isError("INVALID_TEXT"));
  p.send({ t: "card.add", laneId, text: " ​\u0000 " });
  await p.next(
    (m) =>
      m.t === "error" && m.code === "INVALID_TEXT" && p.messages.filter(isError("INVALID_TEXT")).length === 2
  );
  p.send({ t: "card.add", laneId: "l_nope", text: "hello" });
  await p.next(isError("NOT_FOUND"));

  // Can't edit someone else's card.
  owner.send({ t: "card.add", laneId, text: "owner card" });
  const ownerCard = (await owner.next((m) => m.t === "card")).card as Msg;
  p.send({ t: "card.edit", id: ownerCard.id, text: "pwned" });
  await p.next(isError("FORBIDDEN"));

  // Shield budget.
  owner.send({ t: "phase.set", phase: "group" });
  owner.send({ t: "phase.set", phase: "defend" });
  await p.next((m) => m.t === "snapshot" && (m.room as Msg).phase === "defend");
  for (let i = 0; i < 4; i++) p.send({ t: "shield.add", topicId: ownerCard.id });
  await p.next(isError("LIMIT"));
  const shields = await p.next(
    (m) =>
      m.t === "patch" &&
      ((m.patch as Msg).shields as Msg | undefined)?.mine !== undefined &&
      ((((m.patch as Msg).shields as Msg).mine as Record<string, number>)[String(ownerCard.id)] ?? 0) === 3
  );
  expect(shields).toBeTruthy();
  owner.ws.close();
  p.ws.close();
});

test("garbage and floods are rejected, then the socket is closed", async () => {
  const { code } = await apiCreateRoom();
  const p = await rawSocket(code);
  p.send("not json");
  await p.next(isError("BAD_MESSAGE"));
  p.send({ t: "card.add", laneId: 42 });
  p.send({ t: "nope" });
  p.send("x".repeat(5000));
  for (let i = 0; i < 300; i++) p.send({ t: "rename", name: `spam ${i}` });
  expect(await p.closed).toBe(4008);
});

test("unknown rooms 404 and room codes are case/dash insensitive", async () => {
  const missing = await fetch(`${WORKER_URL}/api/rooms/ZZZ-ZZZ`);
  expect(missing.status).toBe(404);
  const { code } = await apiCreateRoom();
  const dashed = `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase();
  const found = await fetch(`${WORKER_URL}/api/rooms/${dashed}`);
  expect(found.status).toBe(200);
  const bad = await fetch(`${WORKER_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "" }),
  });
  expect(bad.status).toBe(400);
});

test("battle: plausible hits kill attackers, implausible ones are ignored", async () => {
  const { code, ownerKey } = await apiCreateRoom([{ title: "Only", description: "" }]);
  const owner = await rawSocket(code, { ownerKey });
  const laneId = (
    ((owner.messages.find((m) => m.t === "snapshot") as Msg).room as Msg).lanes as { id: string }[]
  )[0]?.id;
  for (const phase of ["write"]) owner.send({ t: "phase.set", phase });
  owner.send({ t: "card.add", laneId, text: "defend me" });
  await owner.next((m) => m.t === "card");
  for (const phase of ["group", "defend", "battle"]) owner.send({ t: "phase.set", phase });
  owner.send({ t: "battle.launch" });
  const start = (await owner.next((m) => m.t === "battle.start")).battle as {
    startsAt: number;
    script: { id: number; hp: number; kind: string; waypoints: { x: number; y: number; at: number }[] }[];
  };
  const offset = Number(owner.welcome.serverTime) - Date.now();
  const serverNow = () => Date.now() + offset;
  // Pick the first grunt and wait until it's on the field.
  const grunt = start.script
    .filter((a) => a.kind === "grunt")
    .sort((a, b) => a.waypoints[0]!.at - b.waypoints[0]!.at)[0]!;
  const mid = grunt.waypoints[1]!;
  await new Promise((r) => setTimeout(r, Math.max(0, mid.at - serverNow() + 50)));
  const at = Math.round(serverNow());
  // Wrong side of the arena: ignored.
  owner.send({ t: "battle.input", x: mid.x > 800 ? 50 : 1550, hits: [{ a: grunt.id, at }] });
  // Right underneath it: counted.
  await new Promise((r) => setTimeout(r, 300));
  const hits = Array.from({ length: grunt.hp }, (_, i) => ({ a: grunt.id, at: at + i }));
  owner.send({ t: "battle.input", x: Math.round(mid.x), hits });
  const tick = await owner.next(
    (m) => m.t === "battle.tick" && ((m.tick as Msg).dead as number[]).includes(grunt.id)
  );
  expect(((tick.tick as Msg).dead as number[]).length).toBe(1);
  owner.send({ t: "battle.stop" });
  const end = await owner.next((m) => m.t === "battle.end");
  const stats = (end.results as Msg).stats as { kills: number }[];
  expect(stats[0]?.kills).toBe(1);
  owner.ws.close();
});
