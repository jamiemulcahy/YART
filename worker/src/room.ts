import { DurableObject } from "cloudflare:workers";
import {
  ARENA_W,
  COUNTDOWN_MS,
  DEFAULT_SETTINGS,
  DPS_BUDGET,
  directorScale,
  LANE_SWAP_MS,
  SHIPS,
  SHIP_MAX_Y,
  SHIP_MIN_Y,
  SPECIAL_COST,
  SPECIAL_GRACE_MS,
  SWARM_MISSILES,
  WEAPON_DMG,
  LANE_COLOURS,
  LIMITS,
  MAX_BATTLE_TOPICS,
  PHASES,
  buildTopics,
  cleanLine,
  cleanText,
  clientMessage,
  planBattle,
  nextColour,
  plausibleHit,
  randomName,
  rankTopics,
  scoreBattle,
  seededRandom,
  topicMaxHp,
} from "@yart/shared";
import type {
  AttackerScript,
  BattleFx,
  BattleLive,
  BattleResults,
  Card,
  ClientMessage,
  ErrorCode,
  Group,
  MoveTarget,
  Participant,
  Phase,
  Role,
  RoomPatch,
  RoomSnapshot,
  ServerMessage,
  ShieldState,
  ShipKind,
  ShipSample,
  Strike,
  TimerState,
  Topic,
  WeaponCode,
} from "@yart/shared";
import { Store } from "./store";
import type { ActionRec, CardRec, Meta, NoteRec, ParticipantRec, RoomData } from "./store";
import { Bucket, newId, newSecret, sameHash, sha256 } from "./util";
import type { Env } from "./index";

interface Attachment {
  pid: string;
  role: Role;
}

class Reject extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message);
  }
}

interface Pilot {
  /** Recent ship positions, to check shots against where the ship was when it fired. */
  samples: ShipSample[];
  /** Damage dealt in the last second, per weapon, for rate budgets. */
  dealt: { at: number; dmg: number; w: WeaponCode }[];
  charge: number;
  specialUntil: number;
  swarmLeft: number;
}

interface BattleRun {
  live: BattleLive;
  byId: Map<number, AttackerScript>;
  dead: Set<number>;
  strikes: (Strike & { attacker: number })[];
  nextStrike: number;
  kills: Map<string, { kills: number; bossKills: number }>;
  pilots: Map<string, Pilot>;
  /** participantId -> last time they sent input; idle players soften the invasion. */
  activeAt: Map<string, number>;
  players: number;
  /** Specials fired since the last tick. */
  fx: BattleFx[];
  /** Attackers hit since the last tick, and by whom. */
  hitBy: Record<number, string>;
  /** Everyone's damage over the last few seconds, for the director. */
  teamDealt: { at: number; dmg: number }[];
  interval: ReturnType<typeof setInterval>;
}

const BATTLE_TICK_MS = 100;
const SHIP_TIMEOUT_MS = 3000;
const DIRECTOR_WINDOW_MS = 10_000;
const DIRECTOR_WARMUP_MS = 5000;
const ACTIVITY_PERSIST_MS = 10 * 60_000;
const ACTIVE_WINDOW_MS = 4000;
/** Stored identities per room, online or not. Idle ones are pruned when this fills. */
const MAX_PARTICIPANT_RECORDS = 200;
const STRIKE_WINDOW_MS = 60_000;
const MIN_DAMAGE_SCALE = 0.35;

export class RoomDO extends DurableObject<Env> {
  private store: Store;
  private data: RoomData | null;
  private buckets = new Map<WebSocket, Bucket>();
  private strikes = new Map<WebSocket, { count: number; since: number }>();
  private holds = new Map<string, { pid: string; until: number }>();
  private battle: BattleRun | null = null;
  private activityPersistedAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage.sql);
    this.data = this.store.load();
    // Rooms created before the phases were reordered stored the voting phase as "defend".
    if (this.data && (this.data.meta.phase as string) === "defend") this.data.meta.phase = "vote";
  }

  // ---------------------------------------------------------------- HTTP

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      if (this.data) return Response.json({ ok: false }, { status: 409 });
      const body = (await request.json()) as {
        code: string;
        name: string;
        ownerKeyHash: string;
        lanes: { title: string; description: string }[];
      };
      const now = Date.now();
      const meta: Meta = {
        code: body.code,
        name: body.name,
        createdAt: now,
        ownerKeyHash: body.ownerKeyHash,
        phase: "setup",
        settings: { ...DEFAULT_SETTINGS },
        revealed: false,
        groupingLocked: false,
        lanes: body.lanes.map((l, i) => ({
          id: newId("l"),
          title: l.title,
          description: l.description,
          colour: LANE_COLOURS[i % LANE_COLOURS.length] as string,
        })),
        timer: { status: "idle", durationMs: 5 * 60_000, endsAt: null, remainingMs: 5 * 60_000 },
        discuss: { openTopicId: null, discussed: [] },
        battle: null,
        lastActivity: now,
      };
      this.data = {
        meta,
        participants: new Map(),
        cards: new Map(),
        groups: new Map(),
        notes: new Map(),
        actions: new Map(),
        shields: new Map(),
      };
      this.store.put("meta", "meta", meta);
      await this.ctx.storage.setAlarm(now + LIMITS.roomExpiryMs);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/info") {
      if (!this.data) return Response.json({ exists: false });
      const { meta } = this.data;
      return Response.json({
        exists: true,
        name: meta.name,
        phase: meta.phase,
        lastActivity: meta.lastActivity,
        online: this.onlineParticipants().filter((p) => p.role !== "viewer").length,
      });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      if (!this.data) return new Response("Room not found", { status: 404 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    if (!this.data) return;
    const idleFor = Date.now() - this.data.meta.lastActivity;
    if (idleFor >= LIMITS.roomExpiryMs && this.ctx.getWebSockets().length === 0) {
      await this.destroy();
      return;
    }
    await this.ctx.storage.setAlarm(this.data.meta.lastActivity + LIMITS.roomExpiryMs + 60_000);
  }

  // ----------------------------------------------------------- WebSocket

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.data) {
      ws.close(4404, "Room not found");
      return;
    }
    const att = ws.deserializeAttachment() as Attachment | null;
    const inBattle = this.battle !== null;
    let bucket = this.buckets.get(ws);
    if (!bucket) {
      bucket = inBattle
        ? new Bucket(LIMITS.ratePerSec + LIMITS.battleRatePerSec, LIMITS.rateBurst + LIMITS.battleRatePerSec)
        : new Bucket(LIMITS.ratePerSec, LIMITS.rateBurst);
      this.buckets.set(ws, bucket);
    }
    if (!bucket.take()) {
      this.strike(ws, "RATE_LIMITED", "Slow down");
      return;
    }
    if (typeof raw !== "string" || raw.length > LIMITS.messageBytes) {
      this.strike(ws, "BAD_MESSAGE", "Message too large");
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.strike(ws, "BAD_MESSAGE", "Invalid JSON");
      return;
    }
    const parsed = clientMessage.safeParse(json);
    if (!parsed.success) {
      this.strike(ws, "BAD_MESSAGE", "Invalid message");
      return;
    }
    const msg = parsed.data;
    try {
      if (msg.t === "hello") {
        if (!att) await this.hello(ws, msg);
        return;
      }
      if (!att) throw new Reject("NOT_JOINED", "Say hello first");
      if (msg.t === "ping") {
        this.send(ws, { t: "pong", c: msg.c, s: Date.now() });
        return;
      }
      this.touch();
      this.handle(att, msg);
    } catch (err) {
      if (err instanceof Reject) {
        this.send(ws, { t: "error", code: err.code, message: err.message });
      } else {
        console.error("handler failed", err);
        this.send(ws, { t: "error", code: "BAD_MESSAGE", message: "Something went wrong" });
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      // already closed
    }
    this.disconnected(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.disconnected(ws);
  }

  private disconnected(ws: WebSocket): void {
    this.buckets.delete(ws);
    this.strikes.delete(ws);
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || !this.data) return;
    if (!this.isOnline(att.pid, ws)) {
      let released = false;
      for (const [cardId, hold] of this.holds) {
        if (hold.pid === att.pid) {
          this.holds.delete(cardId);
          released = true;
        }
      }
      if (released) this.broadcastPatch({ holds: this.holdView() });
      const p = this.data.participants.get(att.pid);
      if (p) this.broadcast({ t: "participant", participant: this.participantView(p, ws) });
    }
  }

  private strike(ws: WebSocket, code: ErrorCode, message: string): void {
    const now = Date.now();
    const prev = this.strikes.get(ws);
    const fresh = !prev || now - prev.since > STRIKE_WINDOW_MS;
    const n = fresh ? 1 : prev.count + 1;
    this.strikes.set(ws, { count: n, since: fresh ? now : prev.since });
    if (n >= LIMITS.strikesBeforeClose) {
      ws.close(4008, "Too many bad messages");
      return;
    }
    // Don't echo every rejected message back to a flooding client.
    if (n <= 5 || n % 10 === 0) this.send(ws, { t: "error", code, message });
  }

  // --------------------------------------------------------------- Hello

  private async hello(ws: WebSocket, msg: Extract<ClientMessage, { t: "hello" }>): Promise<void> {
    const data = this.data as RoomData;
    const ownerValid = msg.ownerKey ? sameHash(await sha256(msg.ownerKey), data.meta.ownerKeyHash) : false;
    let participant: ParticipantRec | undefined;
    let token = "";

    if (msg.token) {
      const hash = await sha256(msg.token);
      participant = [...data.participants.values()].find((p) => sameHash(p.tokenHash, hash));
      if (participant) token = msg.token;
    }

    if (participant) {
      if (ownerValid && participant.role !== "owner") {
        participant.role = "owner";
        this.store.put("participant", participant.id, participant);
      }
      if (msg.ship && participant.role !== "viewer" && participant.ship !== msg.ship) {
        participant.ship = msg.ship;
        this.store.put("participant", participant.id, participant);
      }
    } else {
      const role: Role = ownerValid ? "owner" : msg.viewer ? "viewer" : "participant";
      const online = this.onlineParticipants();
      if (role === "viewer" && online.filter((p) => p.role === "viewer").length >= LIMITS.viewers) {
        this.send(ws, { t: "error", code: "ROOM_FULL", message: "Too many viewers in this room" });
        ws.close(4003, "Room full");
        return;
      }
      if (data.participants.size >= MAX_PARTICIPANT_RECORDS) this.pruneIdleParticipants();
      if (
        role !== "owner" &&
        ((role === "participant" &&
          online.filter((p) => p.role !== "viewer").length >= LIMITS.participants) ||
          data.participants.size >= MAX_PARTICIPANT_RECORDS)
      ) {
        this.send(ws, { t: "error", code: "ROOM_FULL", message: "This room is full" });
        ws.close(4003, "Room full");
        return;
      }
      token = newSecret();
      const all = [...data.participants.values()];
      participant = {
        id: newId("p"),
        name: randomName(new Set(all.map((p) => p.name))),
        colour: nextColour(all.filter((p) => p.role !== "viewer").map((p) => p.colour)),
        role,
        ...(msg.ship && role !== "viewer" ? { ship: msg.ship } : {}),
        tokenHash: await sha256(token),
        createdAt: Date.now(),
      };
      data.participants.set(participant.id, participant);
      this.store.put("participant", participant.id, participant);
    }

    const att: Attachment = { pid: participant.id, role: participant.role };
    ws.serializeAttachment(att);
    this.touch(true);
    this.send(ws, {
      t: "welcome",
      participantId: participant.id,
      token,
      role: participant.role,
      serverTime: Date.now(),
    });
    this.send(ws, { t: "snapshot", room: this.snapshot(att), battle: this.battle?.live ?? null });
    this.broadcast({ t: "participant", participant: this.participantView(participant) }, ws);
  }

  /** Forget offline viewers and offline participants who never contributed anything. */
  private pruneIdleParticipants(): void {
    const data = this.data as RoomData;
    const online = new Set(this.joinedSockets().map(([, att]) => att.pid));
    const contributed = new Set<string>();
    for (const c of data.cards.values()) contributed.add(c.authorId);
    for (const n of data.notes.values()) contributed.add(n.authorId);
    for (const a of data.actions.values()) contributed.add(a.authorId);
    for (const [pid, mine] of data.shields) if (Object.keys(mine).length > 0) contributed.add(pid);
    for (const p of [...data.participants.values()]) {
      if (online.has(p.id) || p.role === "owner" || contributed.has(p.id)) continue;
      data.participants.delete(p.id);
      data.shields.delete(p.id);
      this.store.delete("participant", p.id);
      this.store.delete("shields", p.id);
    }
  }

  // ------------------------------------------------------------ Dispatch

  private handle(att: Attachment, msg: ClientMessage): void {
    const data = this.data as RoomData;
    const meta = data.meta;
    // Role might have been upgraded since the socket said hello.
    const me = data.participants.get(att.pid);
    if (!me) throw new Reject("NOT_JOINED", "Unknown participant");
    const role = me.role;
    const owner = () => {
      if (role !== "owner") throw new Reject("NOT_OWNER", "Only the room owner can do that");
    };
    const contributor = () => {
      if (role === "viewer") throw new Reject("VIEWER", "Viewers can't do that");
    };
    const phase = (...phases: Phase[]) => {
      if (!phases.includes(meta.phase)) throw new Reject("WRONG_PHASE", "Not possible in this phase");
    };

    switch (msg.t) {
      case "hello":
      case "ping":
        return;

      case "rename": {
        const name = cleanLine(msg.name, LIMITS.participantName);
        if (!name) throw new Reject("INVALID_TEXT", `Names must be 1–${LIMITS.participantName} characters`);
        const lower = name.toLowerCase();
        if ([...data.participants.values()].some((p) => p.id !== me.id && p.name.toLowerCase() === lower)) {
          throw new Reject("FORBIDDEN", "Someone already has that name");
        }
        me.name = name;
        this.store.put("participant", me.id, me);
        this.broadcast({ t: "participant", participant: this.participantView(me) });
        return;
      }

      case "room.rename": {
        owner();
        const name = cleanLine(msg.name, LIMITS.roomName);
        if (!name) throw new Reject("INVALID_TEXT", `Room names must be 1–${LIMITS.roomName} characters`);
        meta.name = name;
        this.saveMeta();
        this.broadcastPatch({ name });
        return;
      }

      case "room.delete": {
        owner();
        void this.destroy();
        return;
      }

      case "lanes.set": {
        owner();
        phase("setup", "write");
        const existing = new Map(meta.lanes.map((l) => [l.id, l]));
        const keep = new Set<string>();
        const lanes = msg.lanes.map((input, i) => {
          const title = cleanLine(input.title, LIMITS.laneTitle);
          if (!title)
            throw new Reject("INVALID_TEXT", `Lane titles must be 1–${LIMITS.laneTitle} characters`);
          const description =
            input.description.trim() === "" ? "" : cleanLine(input.description, LIMITS.laneDescription);
          if (description === null)
            throw new Reject(
              "INVALID_TEXT",
              `Lane descriptions are at most ${LIMITS.laneDescription} characters`
            );
          const prev = input.id && !keep.has(input.id) ? existing.get(input.id) : undefined;
          if (prev) keep.add(prev.id);
          return {
            id: prev?.id ?? newId("l"),
            title,
            description,
            colour: input.colour?.toLowerCase() ?? prev?.colour ?? this.freeLaneColour(meta.lanes, i),
          };
        });
        for (const lane of meta.lanes) {
          if (!keep.has(lane.id) && [...data.cards.values()].some((c) => c.laneId === lane.id)) {
            throw new Reject("FORBIDDEN", `"${lane.title}" has cards in it, so it can't be removed`);
          }
        }
        if (meta.phase === "write" && lanes.length === 0) throw new Reject("LIMIT", "Keep at least one lane");
        meta.lanes = lanes;
        this.saveMeta();
        this.broadcastPatch({ lanes });
        return;
      }

      case "settings.update": {
        owner();
        const before = meta.settings;
        const next = { ...before, ...msg.settings };
        next.maxShieldsPerTopic = Math.min(next.maxShieldsPerTopic, next.shieldsPerPerson);
        meta.settings = next;
        this.saveMeta();
        if (
          next.shieldsPerPerson < before.shieldsPerPerson ||
          next.maxShieldsPerTopic < before.maxShieldsPerTopic
        ) {
          this.clampShields();
        }
        if (before.hideCards !== next.hideCards || before.showShieldTotals !== next.showShieldTotals) {
          this.sendSnapshots();
        } else {
          this.broadcastPatch({ settings: next });
        }
        return;
      }

      case "phase.set": {
        owner();
        this.setPhase(msg.phase);
        return;
      }

      case "timer.set": {
        owner();
        // Changing the length while paused keeps it paused, ready to resume from the new length.
        meta.timer = {
          status: meta.timer.status === "paused" ? "paused" : "idle",
          durationMs: msg.durationMs,
          endsAt: null,
          remainingMs: msg.durationMs,
        };
        this.saveTimer();
        return;
      }
      case "timer.start": {
        owner();
        const now = Date.now();
        meta.timer = {
          ...meta.timer,
          status: "running",
          endsAt: now + meta.timer.durationMs,
          remainingMs: meta.timer.durationMs,
        };
        this.saveTimer();
        return;
      }
      case "timer.pause": {
        owner();
        const timer = this.timerView();
        if (timer.status !== "running" || timer.endsAt === null) return;
        meta.timer = {
          ...timer,
          status: "paused",
          endsAt: null,
          remainingMs: Math.max(0, timer.endsAt - Date.now()),
        };
        this.saveTimer();
        return;
      }
      case "timer.resume": {
        owner();
        if (meta.timer.status !== "paused") return;
        meta.timer = { ...meta.timer, status: "running", endsAt: Date.now() + meta.timer.remainingMs };
        this.saveTimer();
        return;
      }
      case "timer.reset": {
        owner();
        meta.timer = { ...meta.timer, status: "idle", endsAt: null, remainingMs: meta.timer.durationMs };
        this.saveTimer();
        return;
      }

      case "card.add": {
        contributor();
        if (!(meta.phase === "write" || (meta.phase === "group" && meta.settings.allowLateCards))) {
          throw new Reject("WRONG_PHASE", "Cards can't be added right now");
        }
        if (!meta.lanes.some((l) => l.id === msg.laneId))
          throw new Reject("NOT_FOUND", "That lane no longer exists");
        const text = cleanText(msg.text, LIMITS.cardText);
        if (!text) throw new Reject("INVALID_TEXT", `Cards must be 1–${LIMITS.cardText} characters`);
        const cards = [...data.cards.values()];
        if (cards.length >= LIMITS.cardsPerRoom)
          throw new Reject("LIMIT", "This room has reached its card limit");
        if (cards.filter((c) => c.authorId === me.id).length >= LIMITS.cardsPerParticipant) {
          throw new Reject("LIMIT", `You can add at most ${LIMITS.cardsPerParticipant} cards`);
        }
        const card: CardRec = {
          id: newId("c"),
          laneId: msg.laneId,
          groupId: null,
          authorId: me.id,
          text,
          createdAt: Date.now(),
        };
        data.cards.set(card.id, card);
        this.store.put("card", card.id, card);
        this.broadcastCard(card);
        return;
      }

      case "card.edit": {
        contributor();
        phase("write");
        const card = this.ownCard(msg.id, me.id);
        const text = cleanText(msg.text, LIMITS.cardText);
        if (!text) throw new Reject("INVALID_TEXT", `Cards must be 1–${LIMITS.cardText} characters`);
        card.text = text;
        this.store.put("card", card.id, card);
        this.broadcastCard(card);
        return;
      }

      case "card.remove": {
        contributor();
        const card = data.cards.get(msg.id);
        if (!card) throw new Reject("NOT_FOUND", "That card no longer exists");
        // Only the author can remove a card, and only while writing.
        if (card.authorId !== me.id) throw new Reject("FORBIDDEN", "That's not your card");
        phase("write");
        data.cards.delete(card.id);
        this.store.delete("card", card.id);
        this.holds.delete(card.id);
        this.broadcast({ t: "card.removed", id: card.id });
        this.tidyAfterGrouping();
        return;
      }

      case "cards.reveal": {
        owner();
        phase("write");
        if (meta.revealed) return;
        meta.revealed = true;
        this.saveMeta();
        this.sendSnapshots();
        return;
      }

      case "card.hold": {
        contributor();
        phase("group");
        if (meta.groupingLocked) throw new Reject("FORBIDDEN", "Grouping is locked");
        if (!data.cards.has(msg.id)) throw new Reject("NOT_FOUND", "That card no longer exists");
        const hold = this.holds.get(msg.id);
        if (hold && hold.pid !== me.id && hold.until > Date.now()) {
          throw new Reject("FORBIDDEN", "Someone else is moving that card");
        }
        // One card at a time per person, so nobody can freeze the board.
        for (const [cardId, h] of this.holds) if (h.pid === me.id) this.holds.delete(cardId);
        this.holds.set(msg.id, { pid: me.id, until: Date.now() + LIMITS.holdMs });
        this.broadcastPatch({ holds: this.holdView() });
        return;
      }

      case "card.release": {
        const hold = this.holds.get(msg.id);
        if (hold?.pid === me.id) {
          this.holds.delete(msg.id);
          this.broadcastPatch({ holds: this.holdView() });
        }
        return;
      }

      case "card.move": {
        contributor();
        phase("group");
        if (meta.groupingLocked) throw new Reject("FORBIDDEN", "Grouping is locked");
        const card = data.cards.get(msg.id);
        if (!card) throw new Reject("NOT_FOUND", "That card no longer exists");
        this.assertNotHeld([card.id, ...(msg.target.kind === "card" ? [msg.target.id] : [])], me.id);
        this.moveCards([card], msg.target);
        if (this.holds.delete(card.id)) this.broadcastPatch({ holds: this.holdView() });
        return;
      }

      case "group.merge": {
        contributor();
        phase("group");
        if (meta.groupingLocked) throw new Reject("FORBIDDEN", "Grouping is locked");
        const group = data.groups.get(msg.id);
        if (!group) throw new Reject("NOT_FOUND", "That group no longer exists");
        const cards = [...data.cards.values()].filter((c) => c.groupId === group.id);
        this.assertNotHeld(
          [...cards.map((c) => c.id), ...(msg.into.kind === "card" ? [msg.into.id] : [])],
          me.id
        );
        if (msg.into.kind === "card") {
          const target = data.cards.get(msg.into.id);
          if (!target) throw new Reject("NOT_FOUND", "That card no longer exists");
          if (target.groupId === group.id) return;
          // Dropping a group onto a lone card pulls the card in.
          if (!target.groupId) {
            this.moveCards([target], { kind: "group", id: group.id });
            return;
          }
          this.moveCards(cards, { kind: "group", id: target.groupId });
          return;
        }
        if (msg.into.kind === "group" && msg.into.id === group.id) return;
        this.moveCards(cards, msg.into);
        return;
      }

      case "group.rename": {
        contributor();
        phase("group");
        if (meta.groupingLocked) throw new Reject("FORBIDDEN", "Grouping is locked");
        const group = data.groups.get(msg.id);
        if (!group) throw new Reject("NOT_FOUND", "That group no longer exists");
        const trimmed = msg.title.trim();
        const title = trimmed === "" ? "" : cleanLine(trimmed, LIMITS.groupTitle);
        if (title === null)
          throw new Reject("INVALID_TEXT", `Group names are at most ${LIMITS.groupTitle} characters`);
        group.title = title;
        this.store.put("group", group.id, group);
        this.broadcast({ t: "group", group });
        return;
      }

      case "grouping.lock": {
        owner();
        meta.groupingLocked = msg.locked;
        if (msg.locked) this.holds.clear();
        this.saveMeta();
        this.broadcastPatch({ groupingLocked: msg.locked, holds: this.holdView() });
        return;
      }

      case "shield.add":
      case "shield.remove": {
        contributor();
        phase("vote");
        if (!this.topicExists(msg.topicId)) throw new Reject("NOT_FOUND", "That topic no longer exists");
        const mine = { ...(data.shields.get(me.id) ?? {}) };
        const used = Object.values(mine).reduce((a, b) => a + b, 0);
        const onTopic = mine[msg.topicId] ?? 0;
        if (msg.t === "shield.add") {
          if (used >= meta.settings.shieldsPerPerson)
            throw new Reject("LIMIT", "You've used all your shields");
          if (onTopic >= meta.settings.maxShieldsPerTopic) {
            throw new Reject("LIMIT", `At most ${meta.settings.maxShieldsPerTopic} shields on one topic`);
          }
          mine[msg.topicId] = onTopic + 1;
        } else {
          if (onTopic <= 0) return;
          mine[msg.topicId] = onTopic - 1;
        }
        const kept = Object.fromEntries(Object.entries(mine).filter(([, n]) => n > 0));
        data.shields.set(me.id, kept);
        this.store.put("shields", me.id, kept);
        this.broadcastShields();
        return;
      }

      case "battle.launch": {
        owner();
        phase("battle");
        if (this.battle) return;
        this.launchBattle();
        return;
      }

      case "battle.stop": {
        owner();
        this.endBattle(true);
        return;
      }

      case "battle.input": {
        if (role === "viewer" || !this.battle) return;
        this.battleInput(me, msg);
        return;
      }

      case "battle.special": {
        if (role === "viewer" || !this.battle) return;
        this.battleSpecial(me);
        return;
      }

      case "ship.set": {
        contributor();
        me.ship = msg.ship;
        this.store.put("participant", me.id, me);
        this.broadcast({ t: "participant", participant: this.participantView(me) });
        return;
      }

      case "topic.open": {
        owner();
        phase("discuss", "wrapup");
        if (msg.topicId !== null && !this.topicExists(msg.topicId))
          throw new Reject("NOT_FOUND", "That topic no longer exists");
        meta.discuss = { ...meta.discuss, openTopicId: msg.topicId };
        this.saveMeta();
        this.broadcastPatch({ discuss: meta.discuss });
        return;
      }

      case "topic.discussed": {
        owner();
        phase("discuss", "wrapup");
        if (!this.topicExists(msg.topicId)) throw new Reject("NOT_FOUND", "That topic no longer exists");
        const discussed = new Set(meta.discuss.discussed);
        if (msg.value) discussed.add(msg.topicId);
        else discussed.delete(msg.topicId);
        meta.discuss = { ...meta.discuss, discussed: [...discussed] };
        this.saveMeta();
        this.broadcastPatch({ discuss: meta.discuss });
        return;
      }

      case "note.add": {
        contributor();
        phase("discuss", "wrapup");
        if (!this.topicExists(msg.topicId)) throw new Reject("NOT_FOUND", "That topic no longer exists");
        const text = cleanText(msg.text, LIMITS.noteText);
        if (!text) throw new Reject("INVALID_TEXT", `Notes must be 1–${LIMITS.noteText} characters`);
        if (
          [...data.notes.values()].filter((n) => n.topicId === msg.topicId).length >= LIMITS.notesPerTopic
        ) {
          throw new Reject("LIMIT", "This topic has reached its note limit");
        }
        const note: NoteRec = {
          id: newId("n"),
          topicId: msg.topicId,
          text,
          authorId: me.id,
          createdAt: Date.now(),
        };
        data.notes.set(note.id, note);
        this.store.put("note", note.id, note);
        this.broadcastNote(note);
        return;
      }

      case "note.edit": {
        contributor();
        phase("discuss", "wrapup");
        const note = data.notes.get(msg.id);
        if (!note) throw new Reject("NOT_FOUND", "That note no longer exists");
        if (note.authorId !== me.id) throw new Reject("FORBIDDEN", "That's not your note");
        const text = cleanText(msg.text, LIMITS.noteText);
        if (!text) throw new Reject("INVALID_TEXT", `Notes must be 1–${LIMITS.noteText} characters`);
        note.text = text;
        this.store.put("note", note.id, note);
        this.broadcastNote(note);
        return;
      }

      case "note.remove": {
        contributor();
        phase("discuss", "wrapup");
        const note = data.notes.get(msg.id);
        if (!note) throw new Reject("NOT_FOUND", "That note no longer exists");
        if (note.authorId !== me.id && role !== "owner")
          throw new Reject("FORBIDDEN", "That's not your note");
        data.notes.delete(note.id);
        this.store.delete("note", note.id);
        this.broadcast({ t: "note.removed", id: note.id });
        return;
      }

      case "action.add": {
        contributor();
        phase("discuss", "wrapup");
        if (msg.topicId !== null && !this.topicExists(msg.topicId))
          throw new Reject("NOT_FOUND", "That topic no longer exists");
        const text = cleanText(msg.text, LIMITS.actionText);
        if (!text) throw new Reject("INVALID_TEXT", `Actions must be 1–${LIMITS.actionText} characters`);
        const assignee = this.cleanAssignee(msg.assignee);
        if (data.actions.size >= LIMITS.actionsPerRoom)
          throw new Reject("LIMIT", "This room has reached its action limit");
        const action: ActionRec = {
          id: newId("a"),
          topicId: msg.topicId,
          text,
          assignee,
          authorId: me.id,
          createdAt: Date.now(),
        };
        data.actions.set(action.id, action);
        this.store.put("action", action.id, action);
        this.broadcastAction(action);
        return;
      }

      case "action.edit": {
        contributor();
        phase("discuss", "wrapup");
        const action = data.actions.get(msg.id);
        if (!action) throw new Reject("NOT_FOUND", "That action no longer exists");
        if (action.authorId !== me.id && role !== "owner")
          throw new Reject("FORBIDDEN", "That's not your action");
        const text = cleanText(msg.text, LIMITS.actionText);
        if (!text) throw new Reject("INVALID_TEXT", `Actions must be 1–${LIMITS.actionText} characters`);
        action.text = text;
        action.assignee = this.cleanAssignee(msg.assignee);
        this.store.put("action", action.id, action);
        this.broadcastAction(action);
        return;
      }

      case "action.remove": {
        contributor();
        phase("discuss", "wrapup");
        const action = data.actions.get(msg.id);
        if (!action) throw new Reject("NOT_FOUND", "That action no longer exists");
        if (action.authorId !== me.id && role !== "owner")
          throw new Reject("FORBIDDEN", "That's not your action");
        data.actions.delete(action.id);
        this.store.delete("action", action.id);
        this.broadcast({ t: "action.removed", id: action.id });
        return;
      }
    }
  }

  // ------------------------------------------------------------- Phases

  private setPhase(next: Phase): void {
    const meta = (this.data as RoomData).meta;
    const from = meta.phase;
    if (from === next) return;
    const a = PHASES.indexOf(from);
    const b = PHASES.indexOf(next);
    // The battle is optional: Discuss can go straight to Wrap-up and back.
    const skipBattle = (from === "discuss" && next === "wrapup") || (from === "wrapup" && next === "discuss");
    if (Math.abs(a - b) !== 1 && !skipBattle) throw new Reject("WRONG_PHASE", "Move one phase at a time");
    if (next === "write" && meta.lanes.length === 0)
      throw new Reject("FORBIDDEN", "Add at least one lane first");

    if (from === "battle") this.endBattle(false);
    // Results only make sense for the shields they were fought with.
    if (next === "battle" || next === "vote") meta.battle = null;
    if (from === "write" && b > a) meta.revealed = true;
    this.holds.clear();
    meta.phase = next;
    this.saveMeta();
    // Visibility of cards and shield totals depends on phase, so resend everything.
    this.sendSnapshots();
  }

  // ----------------------------------------------------------- Grouping

  private moveCards(cards: CardRec[], target: MoveTarget): void {
    const data = this.data as RoomData;
    // If a card's old group dissolves, its notes follow this card.
    const successors = new Map<string, string>();
    for (const card of cards) if (card.groupId) successors.set(card.groupId, card.id);
    let groupId: string | null = null;
    if (target.kind === "group") {
      if (!data.groups.has(target.id)) throw new Reject("NOT_FOUND", "That group no longer exists");
      groupId = target.id;
    } else if (target.kind === "card") {
      const other = data.cards.get(target.id);
      if (!other) throw new Reject("NOT_FOUND", "That card no longer exists");
      if (cards.some((c) => c.id === other.id)) return;
      if (other.groupId) {
        groupId = other.groupId;
      } else {
        const group: Group = { id: newId("g"), laneId: other.laneId, title: "", createdAt: Date.now() };
        data.groups.set(group.id, group);
        this.store.put("group", group.id, group);
        this.broadcast({ t: "group", group });
        other.groupId = group.id;
        this.store.put("card", other.id, other);
        this.broadcastCard(other);
        groupId = group.id;
      }
    }
    for (const card of cards) {
      if (card.groupId === groupId) continue;
      card.groupId = groupId;
      this.store.put("card", card.id, card);
      this.broadcastCard(card);
    }
    this.tidyAfterGrouping(successors);
  }

  /**
   * Dissolve groups with fewer than two cards, then move notes and actions on vanished topics to
   * wherever their cards went. Shields on vanished topics are refunded.
   */
  private tidyAfterGrouping(successors = new Map<string, string>()): void {
    const data = this.data as RoomData;
    const counts = new Map<string, CardRec[]>();
    for (const card of data.cards.values()) {
      if (card.groupId) counts.set(card.groupId, [...(counts.get(card.groupId) ?? []), card]);
    }
    for (const group of [...data.groups.values()]) {
      const cards = counts.get(group.id) ?? [];
      if (cards.length >= 2) continue;
      if (cards[0]) successors.set(group.id, cards[0].id);
      for (const card of cards) {
        card.groupId = null;
        this.store.put("card", card.id, card);
        this.broadcastCard(card);
      }
      data.groups.delete(group.id);
      this.store.delete("group", group.id);
      this.broadcast({ t: "group.removed", id: group.id });
    }

    let shieldsChanged = false;
    for (const [pid, mine] of data.shields) {
      const kept = Object.fromEntries(Object.entries(mine).filter(([topicId]) => this.topicExists(topicId)));
      if (Object.keys(kept).length !== Object.keys(mine).length) {
        data.shields.set(pid, kept);
        this.store.put("shields", pid, kept);
        shieldsChanged = true;
      }
    }
    if (shieldsChanged) this.broadcastShields();

    // Follow a vanished topic to where its cards ended up: a card that joined a group, or the
    // card left behind when a group dissolved.
    const follow = (topicId: string): string | null => {
      let id: string | undefined = topicId;
      for (let i = 0; i < 5 && id; i++) {
        if (this.topicExists(id)) return id;
        const card = data.cards.get(id);
        id = card ? (card.groupId ?? undefined) : successors.get(id);
      }
      return null;
    };
    for (const note of [...data.notes.values()]) {
      if (this.topicExists(note.topicId)) continue;
      const next = follow(note.topicId);
      if (next) {
        note.topicId = next;
        this.store.put("note", note.id, note);
        this.broadcastNote(note);
      } else {
        data.notes.delete(note.id);
        this.store.delete("note", note.id);
        this.broadcast({ t: "note.removed", id: note.id });
      }
    }
    for (const action of data.actions.values()) {
      if (action.topicId && !this.topicExists(action.topicId)) {
        action.topicId = follow(action.topicId);
        this.store.put("action", action.id, action);
        this.broadcastAction(action);
      }
    }
    const meta = data.meta;
    const discussed = meta.discuss.discussed.filter((id) => this.topicExists(id));
    const open =
      meta.discuss.openTopicId && this.topicExists(meta.discuss.openTopicId)
        ? meta.discuss.openTopicId
        : null;
    if (discussed.length !== meta.discuss.discussed.length || open !== meta.discuss.openTopicId) {
      meta.discuss = { openTopicId: open, discussed };
      this.saveMeta();
      this.broadcastPatch({ discuss: meta.discuss });
    }
  }

  private topicExists(id: string): boolean {
    const data = this.data as RoomData;
    const card = data.cards.get(id);
    if (card) return card.groupId === null;
    if (!data.groups.has(id)) return false;
    for (const c of data.cards.values()) if (c.groupId === id) return true;
    return false;
  }

  private topics(): Topic[] {
    const data = this.data as RoomData;
    const cards: Card[] = [...data.cards.values()].map((c) => ({
      id: c.id,
      laneId: c.laneId,
      groupId: c.groupId,
      mine: false,
      authorId: c.authorId,
      text: c.text,
      createdAt: c.createdAt,
    }));
    return buildTopics(data.meta.lanes, [...data.groups.values()], cards);
  }

  private shieldTotals(): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const mine of (this.data as RoomData).shields.values()) {
      for (const [topicId, n] of Object.entries(mine)) totals[topicId] = (totals[topicId] ?? 0) + n;
    }
    return totals;
  }

  // -------------------------------------------------------------- Battle

  private launchBattle(): void {
    const data = this.data as RoomData;
    const totals = this.shieldTotals();
    const ranked = rankTopics(this.topics(), totals).slice(0, MAX_BATTLE_TOPICS);
    const inBattle = new Set(ranked.map((t) => t.id));
    // Lay out in board order, not rank order, so favourites aren't all in one corner.
    const ordered = this.topics().filter((t) => inBattle.has(t.id));
    const players = Math.max(1, this.onlineParticipants().filter((p) => p.role !== "viewer").length);
    const startsAt = Date.now() + COUNTDOWN_MS;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] as number;
    // Lanes come in one after another, in board order.
    const lanes = data.meta.lanes
      .map((lane) => ({
        laneId: lane.id,
        title: lane.title,
        topicIds: ordered.filter((t) => t.laneId === lane.id).map((t) => t.id),
      }))
      .filter((l) => l.topicIds.length > 0);
    const laneSec = Math.min(
      LIMITS.battleDurationMaxSec,
      Math.max(LIMITS.battleDurationMinSec, data.meta.settings.battleDurationSec)
    );
    const { levels, tiles, script } = planBattle({
      lanes,
      shields: totals,
      players,
      startsAt,
      laneMs: laneSec * 1000,
      rand: seededRandom(seed),
    });
    const endsAt = (levels.at(-1)?.endsAt ?? startsAt) + LANE_SWAP_MS;
    const topicHp: Record<string, number> = {};
    for (const t of ordered) topicHp[t.id] = topicMaxHp(totals[t.id] ?? 0, players);
    const live: BattleLive = {
      startsAt,
      endsAt,
      levels,
      tiles,
      script,
      topicHp,
      topicMaxHp: { ...topicHp },
      attackerHp: {},
      dead: [],
      ships: {},
    };
    const strikes = script
      .flatMap((a) => a.strikes.map((s) => ({ ...s, attacker: a.id })))
      .sort((x, y) => x.at - y.at);
    this.battle = {
      live,
      byId: new Map(script.map((a) => [a.id, a])),
      dead: new Set(),
      strikes,
      nextStrike: 0,
      kills: new Map(),
      pilots: new Map(),
      activeAt: new Map(),
      players,
      fx: [],
      hitBy: {},
      teamDealt: [],
      interval: setInterval(() => this.battleTick(), BATTLE_TICK_MS),
    };
    // Sockets get a roomier rate limit for the battle.
    this.buckets.clear();
    this.broadcast({ t: "battle.start", battle: live });
  }

  private pilot(run: BattleRun, pid: string): Pilot {
    let pilot = run.pilots.get(pid);
    if (!pilot) {
      pilot = { samples: [], dealt: [], charge: 0, specialUntil: 0, swarmLeft: 0 };
      run.pilots.set(pid, pilot);
    }
    return pilot;
  }

  private battleInput(
    me: ParticipantRec,
    msg: { x: number; y: number; f: boolean; hits: { a: number; at: number; w: WeaponCode }[] }
  ): void {
    const run = this.battle as BattleRun;
    const now = Date.now();
    // Ships can fly about during the countdown; shooting counts once the battle starts.
    if (now < run.live.startsAt - COUNTDOWN_MS || now > run.live.endsAt) return;
    const kind: ShipKind = me.ship ?? "viper";
    const spec = SHIPS[kind];
    const pilot = this.pilot(run, me.id);
    const x = Math.min(ARENA_W, Math.max(0, msg.x));
    const y = Math.min(SHIP_MAX_Y, Math.max(SHIP_MIN_Y, msg.y));
    pilot.samples.push({ x, y, at: now });
    pilot.samples = pilot.samples.filter((s) => s.at > now - 2500);
    run.activeAt.set(me.id, now);

    if (now >= run.live.startsAt) {
      pilot.dealt = pilot.dealt.filter((d) => d.at > now - 1000);
      const specialLive = now <= pilot.specialUntil + SPECIAL_GRACE_MS;
      for (const hit of msg.hits) {
        const w = hit.w;
        // Only your own ship's weapons, and its special only while it's running.
        if (w !== spec.primary && !(w === spec.specialWeapon && specialLive)) continue;
        if (w === "sw" && pilot.swarmLeft <= 0) continue;
        const dmg = WEAPON_DMG[w];
        const recent = pilot.dealt.reduce((n, d) => (d.w === w ? n + d.dmg : n), 0);
        if (recent + dmg > DPS_BUDGET[w]) continue;
        const attacker = run.byId.get(hit.a);
        if (!attacker || run.dead.has(attacker.id)) continue;
        if (!plausibleHit(attacker, hit.at, w, pilot.samples, now)) continue;
        pilot.dealt.push({ at: now, dmg, w });
        run.teamDealt.push({ at: now, dmg });
        if (w === "sw") pilot.swarmLeft -= 1;
        if (w === spec.primary) pilot.charge = Math.min(SPECIAL_COST, pilot.charge + dmg);
        const hp = (run.live.attackerHp[attacker.id] ?? attacker.hp) - dmg;
        run.live.attackerHp[attacker.id] = hp;
        run.hitBy[attacker.id] = me.id;
        if (hp <= 0) {
          run.dead.add(attacker.id);
          run.live.dead.push(attacker.id);
          const k = run.kills.get(me.id) ?? { kills: 0, bossKills: 0 };
          k.kills += 1;
          if (attacker.kind === "boss") k.bossKills += 1;
          run.kills.set(me.id, k);
        }
      }
    }
    run.live.ships[me.id] = { x, y, f: msg.f, k: kind, c: Math.floor(pilot.charge), s: pilot.specialUntil };
  }

  private battleSpecial(me: ParticipantRec): void {
    const run = this.battle as BattleRun;
    const now = Date.now();
    if (now < run.live.startsAt || now > run.live.endsAt) return;
    const pilot = this.pilot(run, me.id);
    if (pilot.charge < SPECIAL_COST || now < pilot.specialUntil) return;
    const kind: ShipKind = me.ship ?? "viper";
    const spec = SHIPS[kind];
    pilot.charge = 0;
    pilot.specialUntil = now + spec.specialMs;
    pilot.swarmLeft = spec.specialWeapon === "sw" ? SWARM_MISSILES : 0;
    const last = pilot.samples.at(-1);
    run.fx.push({
      p: me.id,
      w: spec.specialWeapon,
      at: now,
      x: last?.x ?? ARENA_W / 2,
      y: last?.y ?? SHIP_MAX_Y,
    });
    const ship = run.live.ships[me.id];
    if (ship) run.live.ships[me.id] = { ...ship, c: 0, s: pilot.specialUntil };
  }

  private battleTick(): void {
    const run = this.battle;
    if (!run) return;
    const now = Date.now();
    // The script is sized for everyone online; scale damage down when people sit it out.
    const active = [...run.activeAt.values()].filter((t) => t > now - ACTIVE_WINDOW_MS).length;
    const idleScale = Math.min(1, Math.max(MIN_DAMAGE_SCALE, Math.max(1, active) / run.players));
    // The director: sharper teams feel more bite from what gets through (see directorScale).
    run.teamDealt = run.teamDealt.filter((d) => d.at > now - DIRECTOR_WINDOW_MS);
    const elapsed = now - run.live.startsAt;
    const teamDps =
      run.teamDealt.reduce((n, d) => n + d.dmg, 0) /
      (Math.min(DIRECTOR_WINDOW_MS, Math.max(1, elapsed)) / 1000);
    const dmgScale =
      idleScale * (elapsed < DIRECTOR_WARMUP_MS ? 1 : directorScale(teamDps, Math.max(1, active)));
    while (run.nextStrike < run.strikes.length) {
      const s = run.strikes[run.nextStrike] as Strike & { attacker: number };
      if (s.at > now) break;
      run.nextStrike++;
      if (run.dead.has(s.attacker)) continue;
      const hp = run.live.topicHp[s.topicId];
      if (hp === undefined || hp <= 0) continue;
      run.live.topicHp[s.topicId] = Math.max(0, hp - s.dmg * dmgScale);
    }
    // Ships that stop reporting (closed tab, lost connection) leave the field.
    for (const [pid, at] of run.activeAt) {
      if (at < now - SHIP_TIMEOUT_MS) {
        run.live.ships = Object.fromEntries(Object.entries(run.live.ships).filter(([id]) => id !== pid));
        run.activeAt.delete(pid);
      }
    }
    const allDead = run.dead.size === run.live.script.length;
    if (now >= run.live.endsAt || (allDead && now > run.live.startsAt)) {
      this.endBattle(true);
      return;
    }
    this.broadcast({
      t: "battle.tick",
      tick: {
        ships: run.live.ships,
        attackerHp: run.live.attackerHp,
        dead: run.live.dead,
        topicHp: run.live.topicHp,
        fx: run.fx,
        hitBy: run.hitBy,
      },
    });
    run.fx = [];
    run.hitBy = {};
  }

  private endBattle(announce: boolean): void {
    const run = this.battle;
    if (!run) return;
    clearInterval(run.interval);
    this.battle = null;
    this.buckets.clear();
    const data = this.data as RoomData;
    const fates: BattleResults["fates"] = {};
    // Only topics whose lane actually came under attack have a fate.
    const now = Date.now();
    const fought = new Set(run.live.levels.flatMap((l, i) => (l.startsAt <= now ? [i] : [])));
    for (const tile of run.live.tiles) {
      const hp = run.live.topicHp[tile.topicId] ?? 0;
      if (fought.has(tile.level) && this.topicExists(tile.topicId)) {
        fates[tile.topicId] = hp > 0 ? "survived" : "fell";
      }
    }
    const stats = data.meta.settings.showBattleStats
      ? [...run.kills.entries()]
          .map(([pid, k]) => {
            const p = data.participants.get(pid);
            return { participantId: pid, name: p?.name ?? "?", colour: p?.colour ?? "#888", ...k };
          })
          .sort((a, b) => b.bossKills - a.bossKills || b.kills - a.kills)
      : null;
    const fateList = Object.values(fates);
    const score = scoreBattle({
      topicsSaved: fateList.filter((f) => f === "survived").length,
      topicsFought: fateList.length,
      completed: now >= run.live.endsAt || run.dead.size === run.live.script.length,
      script: run.live.script,
      attackerHp: run.live.attackerHp,
      dead: run.dead,
      now,
    });
    const results: BattleResults = { fates, stats, ...(score ? { score } : {}) };
    data.meta.battle = results;
    this.saveMeta();
    if (announce) this.broadcast({ t: "battle.end", results });
  }

  // --------------------------------------------------------------- Views

  private participantView(p: ParticipantRec, excluding?: WebSocket): Participant {
    return {
      id: p.id,
      name: p.name,
      colour: p.colour,
      role: p.role,
      online: this.isOnline(p.id, excluding),
      ...(p.ship ? { ship: p.ship } : {}),
    };
  }

  private cardView(c: CardRec, viewer: string): Card {
    const meta = (this.data as RoomData).meta;
    const hidden = meta.settings.hideCards && !meta.revealed && c.authorId !== viewer;
    return {
      id: c.id,
      laneId: c.laneId,
      groupId: c.groupId,
      mine: c.authorId === viewer,
      authorId: c.authorId,
      text: hidden ? null : c.text,
      createdAt: c.createdAt,
    };
  }

  private shieldView(att: Attachment): ShieldState {
    const data = this.data as RoomData;
    const meta = data.meta;
    const visible =
      att.role === "owner" ||
      meta.settings.showShieldTotals ||
      !["setup", "write", "group", "vote"].includes(meta.phase);
    return { mine: { ...(data.shields.get(att.pid) ?? {}) }, totals: visible ? this.shieldTotals() : null };
  }

  private timerView(): TimerState {
    const timer = (this.data as RoomData).meta.timer;
    if (timer.status === "running" && timer.endsAt !== null && timer.endsAt <= Date.now()) {
      return { ...timer, status: "done", remainingMs: 0 };
    }
    return timer;
  }

  private holdView(): Record<string, string> {
    const now = Date.now();
    const out: Record<string, string> = {};
    for (const [cardId, hold] of this.holds) if (hold.until > now) out[cardId] = hold.pid;
    return out;
  }

  private snapshot(att: Attachment): RoomSnapshot {
    const data = this.data as RoomData;
    const meta = data.meta;
    return {
      code: meta.code,
      name: meta.name,
      createdAt: meta.createdAt,
      phase: meta.phase,
      settings: meta.settings,
      revealed: meta.revealed,
      groupingLocked: meta.groupingLocked,
      lanes: meta.lanes,
      participants: [...data.participants.values()].map((p) => this.participantView(p)),
      cards: [...data.cards.values()].map((c) => this.cardView(c, att.pid)),
      groups: [...data.groups.values()],
      shields: this.shieldView(att),
      timer: this.timerView(),
      discuss: meta.discuss,
      notes: [...data.notes.values()].map((n) => ({
        id: n.id,
        topicId: n.topicId,
        text: n.text,
        mine: n.authorId === att.pid,
        createdAt: n.createdAt,
      })),
      actions: [...data.actions.values()].map((a) => this.actionView(a, att.pid)),
      holds: this.holdView(),
      battle: meta.battle,
    };
  }

  private actionView(a: ActionRec, viewer: string) {
    return {
      id: a.id,
      topicId: a.topicId,
      text: a.text,
      assignee: a.assignee,
      mine: a.authorId === viewer,
      createdAt: a.createdAt,
    };
  }

  // ------------------------------------------------------------ Sending

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket closing
    }
  }

  private joinedSockets(): [WebSocket, Attachment][] {
    const out: [WebSocket, Attachment][] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) out.push([ws, att]);
    }
    return out;
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    const text = JSON.stringify(msg);
    for (const [ws] of this.joinedSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        // socket closing
      }
    }
  }

  private broadcastPatch(patch: RoomPatch): void {
    this.broadcast({ t: "patch", patch });
  }

  private broadcastCard(card: CardRec): void {
    for (const [ws, att] of this.joinedSockets())
      this.send(ws, { t: "card", card: this.cardView(card, att.pid) });
  }

  private broadcastNote(note: NoteRec): void {
    for (const [ws, att] of this.joinedSockets()) {
      this.send(ws, {
        t: "note",
        note: {
          id: note.id,
          topicId: note.topicId,
          text: note.text,
          mine: note.authorId === att.pid,
          createdAt: note.createdAt,
        },
      });
    }
  }

  private broadcastAction(action: ActionRec): void {
    for (const [ws, att] of this.joinedSockets())
      this.send(ws, { t: "action", action: this.actionView(action, att.pid) });
  }

  private broadcastShields(): void {
    for (const [ws, att] of this.joinedSockets())
      this.send(ws, { t: "patch", patch: { shields: this.shieldView(att) } });
  }

  private sendSnapshots(): void {
    for (const [ws, att] of this.joinedSockets()) {
      this.send(ws, { t: "snapshot", room: this.snapshot(att), battle: this.battle?.live ?? null });
    }
  }

  // ------------------------------------------------------------ Helpers

  private isOnline(pid: string, excluding?: WebSocket): boolean {
    return this.joinedSockets().some(([ws, att]) => att.pid === pid && ws !== excluding);
  }

  private onlineParticipants(): ParticipantRec[] {
    const data = this.data as RoomData;
    const ids = new Set(this.joinedSockets().map(([, att]) => att.pid));
    return [...ids].map((id) => data.participants.get(id)).filter((p): p is ParticipantRec => !!p);
  }

  private ownCard(id: string, pid: string): CardRec {
    const card = (this.data as RoomData).cards.get(id);
    if (!card) throw new Reject("NOT_FOUND", "That card no longer exists");
    if (card.authorId !== pid) throw new Reject("FORBIDDEN", "That's not your card");
    return card;
  }

  private assertNotHeld(cardIds: string[], me: string): void {
    const now = Date.now();
    for (const id of cardIds) {
      const hold = this.holds.get(id);
      if (hold && hold.pid !== me && hold.until > now) {
        throw new Reject("FORBIDDEN", "Someone else is moving that card");
      }
    }
  }

  /** Bring everyone's shields within the current budget, trimming the most-stacked topics first. */
  private clampShields(): void {
    const data = this.data as RoomData;
    const { shieldsPerPerson, maxShieldsPerTopic } = data.meta.settings;
    let changed = false;
    for (const [pid, mine] of data.shields) {
      const next: Record<string, number> = {};
      for (const [topicId, n] of Object.entries(mine)) next[topicId] = Math.min(n, maxShieldsPerTopic);
      let total = Object.values(next).reduce((a, b) => a + b, 0);
      while (total > shieldsPerPerson) {
        const [top] = Object.entries(next).sort((x, y) => y[1] - x[1]);
        if (!top) break;
        next[top[0]] = top[1] - 1;
        total--;
      }
      const kept = Object.fromEntries(Object.entries(next).filter(([, n]) => n > 0));
      if (JSON.stringify(kept) !== JSON.stringify(mine)) {
        data.shields.set(pid, kept);
        this.store.put("shields", pid, kept);
        changed = true;
      }
    }
    if (changed) this.broadcastShields();
  }

  private cleanAssignee(input: string): string {
    if (input.trim() === "") return "";
    const assignee = cleanLine(input, LIMITS.actionAssignee);
    if (assignee === null)
      throw new Reject("INVALID_TEXT", `Assignee is at most ${LIMITS.actionAssignee} characters`);
    return assignee;
  }

  private freeLaneColour(lanes: { colour: string }[], index: number): string {
    const used = new Set(lanes.map((l) => l.colour));
    return LANE_COLOURS.find((c) => !used.has(c)) ?? (LANE_COLOURS[index % LANE_COLOURS.length] as string);
  }

  private saveMeta(): void {
    const meta = (this.data as RoomData).meta;
    meta.lastActivity = Date.now();
    this.activityPersistedAt = meta.lastActivity;
    this.store.put("meta", "meta", meta);
  }

  private saveTimer(): void {
    this.saveMeta();
    this.broadcastPatch({ timer: this.timerView() });
  }

  private touch(force = false): void {
    const meta = (this.data as RoomData).meta;
    meta.lastActivity = Date.now();
    if (force || meta.lastActivity - this.activityPersistedAt > ACTIVITY_PERSIST_MS) this.saveMeta();
  }

  private async destroy(): Promise<void> {
    if (this.battle) clearInterval(this.battle.interval);
    this.battle = null;
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { t: "room.deleted" });
      try {
        ws.close(4404, "Room deleted");
      } catch {
        // already closed
      }
    }
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.store = new Store(this.ctx.storage.sql);
  }
}
