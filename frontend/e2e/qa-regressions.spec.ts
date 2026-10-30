import { expect, test } from "@playwright/test";
import { apiCreateRoom, createRoom, joinRoom, rawSocket } from "./helpers";

// Regressions for issues found by adversarial QA of the protocol.

type Msg = Record<string, unknown>;
type Sock = Awaited<ReturnType<typeof rawSocket>>;
const isError = (code: string) => (m: Msg) => m.t === "error" && m.code === code;
const lanesOf = (s: Sock) =>
  ((s.messages.find((m) => m.t === "snapshot") as Msg).room as Msg).lanes as { id: string }[];

async function toPhase(owner: Sock, others: Sock[], phases: string[]) {
  const all = [owner, ...others];
  for (const phase of phases) {
    const marks = all.map((s) => s.messages.length);
    owner.send({ t: "phase.set", phase });
    await Promise.all(
      all.map((s, i) =>
        s.next(
          (m) => m.t === "snapshot" && (m.room as Msg).phase === phase && s.messages.indexOf(m) >= marks[i]!
        )
      )
    );
  }
}

async function addCard(s: Sock, laneId: string, text: string): Promise<string> {
  s.send({ t: "card.add", laneId, text });
  const msg = await s.next((m) => m.t === "card" && (m.card as Msg).text === text);
  return String((msg.card as Msg).id);
}

test("churning viewers and drive-by joins can't lock a room", async () => {
  test.setTimeout(60_000);
  const { code } = await apiCreateRoom();
  for (let i = 0; i < 220; i++) {
    const v = await rawSocket(code, { viewer: i % 2 === 0 });
    v.ws.close();
    await v.closed;
  }
  const late = await rawSocket(code);
  expect(late.welcome.role).toBe("participant");
  late.ws.close();
});

test("notes follow their cards when a group dissolves", async () => {
  const { code, ownerKey } = await apiCreateRoom();
  const owner = await rawSocket(code, { ownerKey });
  const laneId = lanesOf(owner)[0]!.id;
  await toPhase(owner, [], ["write"]);
  const a = await addCard(owner, laneId, "first");
  const b = await addCard(owner, laneId, "second");
  await toPhase(owner, [], ["group"]);
  owner.send({ t: "card.move", id: b, target: { kind: "card", id: a } });
  const group = (await owner.next((m) => m.t === "group")).group as { id: string };
  await toPhase(owner, [], ["vote", "discuss"]);
  owner.send({ t: "note.add", topicId: group.id, text: "keep me" });
  await owner.next((m) => m.t === "note");
  await toPhase(owner, [], ["vote", "group"]);
  owner.send({ t: "card.move", id: b, target: { kind: "none" } });
  const moved = await owner.next((m) => m.t === "note" && (m.note as Msg).topicId !== group.id);
  expect((moved.note as Msg).text).toBe("keep me");
  expect([a, b]).toContain((moved.note as Msg).topicId);
  expect(owner.messages.some((m) => m.t === "note.removed")).toBe(false);
  owner.ws.close();
});

test("holds: one per person, and they protect grouped cards and targets", async () => {
  const { code, ownerKey } = await apiCreateRoom();
  const owner = await rawSocket(code, { ownerKey });
  const p = await rawSocket(code);
  const laneId = lanesOf(owner)[0]!.id;
  await toPhase(owner, [p], ["write"]);
  const a = await addCard(owner, laneId, "a");
  const b = await addCard(owner, laneId, "b");
  const c = await addCard(owner, laneId, "c");
  await toPhase(owner, [p], ["group"]);
  owner.send({ t: "card.move", id: b, target: { kind: "card", id: a } });
  const group = (await owner.next((m) => m.t === "group")).group as { id: string };

  owner.send({ t: "card.hold", id: a });
  await p.next((m) => m.t === "patch" && ((m.patch as Msg).holds as Msg | undefined)?.[a] !== undefined);
  // Ungrouping a group containing a held card is refused…
  p.send({ t: "group.merge", id: group.id, into: { kind: "none" } });
  await p.next(isError("FORBIDDEN"));
  // …as is dropping a card onto a held card.
  p.send({ t: "card.move", id: c, target: { kind: "card", id: a } });
  await p.next((m) => m.t === "error" && p.messages.filter(isError("FORBIDDEN")).length === 2);

  // Holding a second card releases the first.
  owner.send({ t: "card.hold", id: c });
  const holds = await p.next(
    (m) => m.t === "patch" && ((m.patch as Msg).holds as Msg | undefined)?.[c] !== undefined
  );
  expect(Object.keys((holds.patch as Msg).holds as Msg)).toEqual([c]);
  owner.ws.close();
  p.ws.close();
});

test("phase and settings rules found by QA", async () => {
  const { code, ownerKey } = await apiCreateRoom();
  const owner = await rawSocket(code, { ownerKey });
  const p = await rawSocket(code);
  const laneId = lanesOf(owner)[0]!.id;

  // Can't pre-reveal in Setup to defeat hidden mode.
  owner.send({ t: "cards.reveal" });
  await owner.next(isError("WRONG_PHASE"));

  // Can't take someone else's name.
  const ownerName = String(
    (((owner.messages.find((m) => m.t === "snapshot") as Msg).room as Msg).participants as Msg[]).find(
      (x) => x.id === owner.welcome.participantId
    )?.name
  );
  p.send({ t: "rename", name: ownerName.toUpperCase() });
  await p.next(isError("FORBIDDEN"));

  await toPhase(owner, [p], ["write"]);
  const a = await addCard(owner, laneId, "a");
  const b = await addCard(owner, laneId, "b");
  await toPhase(owner, [p], ["group", "vote"]);

  // Lowering the budget mid-Vote trims existing shields.
  for (let i = 0; i < 3; i++) p.send({ t: "shield.add", topicId: a });
  p.send({ t: "shield.add", topicId: b });
  await p.next(
    (m) =>
      m.t === "patch" &&
      Object.values(((m.patch as Msg).shields as Msg | undefined)?.mine ?? {}).reduce(
        (x: number, y) => x + Number(y),
        0
      ) === 4
  );
  owner.send({ t: "settings.update", settings: { shieldsPerPerson: 2, maxShieldsPerTopic: 1 } });
  const trimmed = await p.next(
    (m) =>
      m.t === "patch" &&
      JSON.stringify(((m.patch as Msg).shields as Msg | undefined)?.mine) ===
        JSON.stringify({ [a]: 1, [b]: 1 })
  );
  expect(trimmed).toBeTruthy();

  // Group names freeze once grouping is over.
  p.send({ t: "group.rename", id: "g_whatever", title: "x" });
  await p.next(isError("WRONG_PHASE"));
  owner.ws.close();
  p.ws.close();
});

test("a viewer can switch to being a participant", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const viewer = await joinRoom(browser, code, { viewer: true });
  await viewer.getByRole("button", { name: "Join as participant" }).click();
  await viewer.getByRole("button", { name: "Join retro" }).click();
  await expect(owner.locator(".people-count")).toHaveText("👥 2");
  await expect(viewer.getByRole("button", { name: "Join as participant" })).toHaveCount(0);
});
