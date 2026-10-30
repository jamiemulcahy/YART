import { useEffect, useLayoutEffect, useRef } from "react";
import {
  ARENA_H,
  ARENA_W,
  COUNTDOWN_MS,
  FLIGHT,
  SAFE_ZONE_Y,
  SHIPS,
  SHIP_MAX_Y,
  SHIP_MIN_Y,
  SPECIAL_COST,
  SWARM_MISSILES,
  attackerPos,
  attackerRadius,
  currentLevel,
  laneOffset,
} from "@yart/shared";
import type { AttackerScript, BattleLive, Participant, ShipKind, Topic, WeaponCode } from "@yart/shared";
import { sounds } from "../lib/sounds";
import { burst, drawAttacker, drawShip, roundRect, wrapText } from "./draw";
import type { Particle } from "./draw";
import { setMusicLevel, startMusic, stopMusic } from "./music";

export interface Hit {
  a: number;
  at: number;
  w: WeaponCode;
}

interface Props {
  battle: BattleLive;
  topics: Topic[];
  participants: Participant[];
  meId: string;
  canPlay: boolean;
  now: () => number;
  sendInput: (x: number, y: number, f: boolean, hits: Hit[]) => void;
  sendSpecial: () => void;
}

/** A bullet or missile. `w` is null for other players' shots, which are drawn but never claimed. */
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: WeaponCode | null;
  colour: string;
  missile: boolean;
  target: number | null;
  born: number;
}

interface Remote {
  x: number;
  y: number;
  lastShot: number;
}

const INPUT_INTERVAL_MS = 100;
const BULLET_SPEED = 1700;
const MISSILE_SPEED = 720;
const LASER_TICK_MS = 120;
const ION_TICK_MS = 100;
const ION_HALF_WIDTH = 90;
const OD_INTERVAL_MS = 70;
const OD_SPREAD = 0.2;

/**
 * The battle arena. Attacker movement comes from the shared script (a pure function of time);
 * every ship, shot and special is shared through the server, which also decides all damage.
 */
export function BattleCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ------------------------------------------------------------ state
    const me = { x: ARENA_W / 2, y: SHIP_MAX_Y, vx: 0, vy: 0, thrusting: false };
    const keys = new Set<string>();
    const pointer = { x: 0, y: 0, inside: false, down: false };
    let specialKey = false;
    // A quick tap can start and end between frames, so remember it until the loop has seen it.
    let specialTapped = false;
    let shots: Shot[] = [];
    const pending: Hit[] = [];
    let particles: Particle[] = [];
    let strikeBeams: { x1: number; y1: number; x2: number; y2: number; until: number; heavy: boolean }[] = [];
    const flashes = new Map<number, { until: number; colour: string }>();
    const remotes = new Map<string, Remote>();
    let seenDead = new Set<number>(latest.current.battle.dead);
    const seenFallen = new Set<string>();
    const seenFx = new Set<string>();
    let lastHitBy: unknown = null;
    let lastShot = 0;
    let laserNext = 0;
    let ionNext = 0;
    let swarmFor = 0;
    let swarmLeft = 0;
    let swarmNext = 0;
    let lastSpecialAsk = 0;
    let lastSend = 0;
    let lastFrame = performance.now();
    let lastT = latest.current.now();
    let lastCountdown = -1;
    let lastLevel = -1;
    let shake = 0;
    let musicOn = false;
    const stats = { sentHits: 0, specials: 0 };
    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * ARENA_W,
      y: Math.random() * ARENA_H,
      s: Math.random() * 1.8 + 0.4,
      v: Math.random() * 40 + 20,
    }));
    let frame = 0;

    // ------------------------------------------------------------ sizing
    // Fit the 16:9 arena inside whatever space is left below the header.
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const top = parent.getBoundingClientRect().top;
      const availW = parent.clientWidth;
      const availH = Math.max(240, window.innerHeight - top - 8);
      const w = Math.min(availW, (availH * ARENA_W) / ARENA_H);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${(w * ARENA_H) / ARENA_W}px`;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(((w * ARENA_H) / ARENA_W) * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", resize);

    // ------------------------------------------------------------ input
    const toArena = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * ARENA_W,
        y: ((e.clientY - rect.top) / rect.height) * ARENA_H,
      };
    };
    const onPointerMove = (e: PointerEvent) => {
      Object.assign(pointer, toArena(e), { inside: true });
    };
    const onPointerDown = (e: PointerEvent) => {
      Object.assign(pointer, toArena(e), { inside: true });
      if (e.button === 2) specialKey = specialTapped = true;
      else pointer.down = true;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2) specialKey = false;
      else pointer.down = false;
    };
    const onPointerLeave = () => {
      pointer.inside = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const GAME_KEYS = [
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
      "a",
      "d",
      "w",
      "s",
      " ",
      "e",
      "shift",
    ];
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!GAME_KEYS.includes(k)) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (k === "e" || k === "shift") specialKey = specialTapped = true;
      else keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "e" || k === "shift") specialKey = false;
      keys.delete(k);
    };
    const onBlur = () => {
      keys.clear();
      pointer.down = false;
      specialKey = false;
    };
    if (latest.current.canPlay) {
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("pointerleave", onPointerLeave);
      canvas.addEventListener("contextmenu", onContextMenu);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
    }

    // ------------------------------------------------------------ helpers
    const participant = (id: string) => latest.current.participants.find((x) => x.id === id);
    const shipKind = (id: string): ShipKind => participant(id)?.ship ?? "viper";

    /** Attackers that can be hit right now: alive, on the field, in the current or escaping lane. */
    const targets = (battle: BattleLive, t: number, level: number) => {
      const out: { a: AttackerScript; x: number; y: number; r: number }[] = [];
      const dead = new Set(battle.dead);
      for (const a of battle.script) {
        if (a.level !== level && a.level !== level - 1) continue;
        if (dead.has(a.id)) continue;
        const pos = attackerPos(a, t);
        if (!pos) continue;
        out.push({ a, x: pos.x, y: pos.y, r: attackerRadius(a) });
      }
      return out;
    };

    const nearestAhead = (list: ReturnType<typeof targets>, x: number, y: number, skip?: Set<number>) => {
      let best: ReturnType<typeof targets>[number] | null = null;
      let bestD = Infinity;
      for (const tg of list) {
        if (tg.y > y || skip?.has(tg.a.id)) continue;
        const d = Math.hypot(tg.x - x, (tg.y - y) * 0.7);
        if (d < bestD) {
          bestD = d;
          best = tg;
        }
      }
      return best;
    };

    const claim = (a: number, at: number, w: WeaponCode) => {
      pending.push({ a, at: Math.round(at), w });
      stats.sentHits++;
    };

    const fireMissile = (
      x: number,
      y: number,
      w: WeaponCode | null,
      colour: string,
      t: number,
      list: ReturnType<typeof targets>
    ) => {
      const target = nearestAhead(list, x, y);
      const spread = (Math.random() - 0.5) * 1.2;
      shots.push({
        x,
        y: y - 20,
        vx: Math.sin(spread) * MISSILE_SPEED * 0.6,
        vy: -MISSILE_SPEED * 0.6,
        w,
        colour,
        missile: true,
        target: target?.a.id ?? null,
        born: t,
      });
    };

    const fireBullets = (
      x: number,
      y: number,
      w: WeaponCode | null,
      colour: string,
      spread: boolean,
      t: number
    ) => {
      for (const angle of spread ? [-OD_SPREAD, 0, OD_SPREAD] : [0]) {
        shots.push({
          x,
          y: y - 30,
          vx: Math.sin(angle) * BULLET_SPEED,
          vy: -Math.cos(angle) * BULLET_SPEED,
          w,
          colour,
          missile: false,
          target: null,
          born: t,
        });
      }
    };

    /** First attacker in a ship's column, for laser beams. */
    const beamTarget = (list: ReturnType<typeof targets>, x: number, y: number) => {
      let best: ReturnType<typeof targets>[number] | null = null;
      for (const tg of list) {
        if (tg.y >= y || Math.abs(tg.x - x) > tg.r + 10) continue;
        if (!best || tg.y > best.y) best = tg;
      }
      return best;
    };

    // ------------------------------------------------------------ loop
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const p = latest.current;
      const battle = p.battle;
      const t = p.now();
      const perf = performance.now();
      const dt = Math.min(0.05, (perf - lastFrame) / 1000);
      lastFrame = perf;
      const started = t >= battle.startsAt;
      const live = started && t <= battle.endsAt;
      const level = currentLevel(battle.levels, t);
      const list = targets(battle, t, level);
      const byId = new Map(battle.script.map((a) => [a.id, a]));
      const myState = battle.ships[p.meId];
      const myKind = shipKind(p.meId);
      const mySpec = SHIPS[myKind];
      const mySpecialOn = !!myState && myState.s > t;

      // Music follows the battle and speeds up lane by lane.
      if (!musicOn && t >= battle.startsAt - COUNTDOWN_MS) {
        musicOn = true;
        startMusic();
      }
      if (level !== lastLevel) {
        if (lastLevel >= 0) sounds.go();
        lastLevel = level;
        setMusicLevel(level);
      }

      // ---------------- server-confirmed events
      const dead = new Set(battle.dead);
      for (const id of dead) {
        if (seenDead.has(id)) continue;
        const a = byId.get(id);
        const pos = a && attackerPos(a, t);
        if (a && pos) {
          const big = a.kind === "boss" ? 90 : a.kind === "brute" ? 40 : 16;
          burst(
            particles,
            pos.x,
            pos.y,
            a.kind === "boss" ? "#ff4fd8" : a.kind === "brute" ? "#fb923c" : "#7CFF6B",
            big
          );
          if (a.kind === "boss") shake = 0.7;
        }
        sounds.explode();
      }
      seenDead = dead;
      if (battle.hitBy !== lastHitBy) {
        lastHitBy = battle.hitBy;
        for (const [id, pid] of Object.entries(battle.hitBy ?? {})) {
          flashes.set(Number(id), { until: t + 110, colour: participant(pid)?.colour ?? "#ffffff" });
        }
      }
      for (const fx of battle.fx ?? []) {
        const key = `${fx.p}:${fx.at}`;
        if (seenFx.has(key)) continue;
        seenFx.add(key);
        if (fx.p !== p.meId && fx.w === "sw") {
          const colour = SHIPS.hornet.colour;
          for (let i = 0; i < SWARM_MISSILES; i++) {
            setTimeout(() => fireMissile(fx.x, fx.y, null, colour, latest.current.now(), list), i * 100);
          }
        }
        sounds.special();
        if (fx.p === p.meId) stats.specials++;
      }
      for (const [topicId, hp] of Object.entries(battle.topicHp)) {
        if (hp <= 0 && !seenFallen.has(topicId)) {
          seenFallen.add(topicId);
          const tile = battle.tiles.find((x) => x.topicId === topicId);
          if (tile) burst(particles, tile.x, tile.y, "#ff6b4a", 50);
          shake = Math.max(shake, 0.35);
          sounds.topicFell();
        }
      }

      // ---------------- countdown
      if (!started) {
        const secs = Math.ceil((battle.startsAt - t) / 1000);
        if (secs !== lastCountdown) {
          lastCountdown = secs;
          if (secs <= 3 && secs > 0) sounds.countdown();
        }
      } else if (lastCountdown > 0) {
        lastCountdown = 0;
        sounds.go();
      }

      // ---------------- flight
      const canFly = p.canPlay && t >= battle.startsAt - COUNTDOWN_MS && t <= battle.endsAt;
      if (canFly) {
        let ax = 0;
        let ay = 0;
        if (keys.has("arrowleft") || keys.has("a")) ax -= 1;
        if (keys.has("arrowright") || keys.has("d")) ax += 1;
        if (keys.has("arrowup") || keys.has("w")) ay -= 1;
        if (keys.has("arrowdown") || keys.has("s")) ay += 1;
        if (ax === 0 && ay === 0 && pointer.inside) {
          // Fly towards the pointer; stop pushing when you're there and you drift back.
          const dx = pointer.x - me.x;
          const dy = pointer.y - me.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 6) {
            const strength = Math.min(1, dist / 90);
            ax = (dx / dist) * strength;
            ay = (dy / dist) * strength;
          }
        }
        const len = Math.hypot(ax, ay);
        if (len > 1) {
          ax /= len;
          ay /= len;
        }
        me.vx += ax * FLIGHT.thrust * dt;
        me.vy += ay * FLIGHT.thrust * dt + FLIGHT.pushBack * dt;
        const damp = Math.exp(-FLIGHT.damping * dt);
        me.vx *= damp;
        me.vy *= damp;
        const speed = Math.hypot(me.vx, me.vy);
        if (speed > FLIGHT.maxSpeed) {
          me.vx *= FLIGHT.maxSpeed / speed;
          me.vy *= FLIGHT.maxSpeed / speed;
        }
        me.x = Math.min(ARENA_W - 30, Math.max(30, me.x + me.vx * dt));
        me.y = Math.min(SHIP_MAX_Y, Math.max(SHIP_MIN_Y, me.y + me.vy * dt));
        if (me.y === SHIP_MAX_Y || me.y === SHIP_MIN_Y) me.vy = 0;
        me.thrusting = ay < -0.2;
      }

      // ---------------- my weapons
      const firing = p.canPlay && live && (keys.has(" ") || pointer.down);
      if (p.canPlay && live) {
        if (myKind === "viper") {
          const interval = mySpecialOn ? OD_INTERVAL_MS : mySpec.fireMs;
          if (firing && t - lastShot >= interval) {
            lastShot = t;
            fireBullets(me.x, me.y, mySpecialOn ? "od" : "b", mySpec.colour, mySpecialOn, t);
            sounds.shoot();
          }
        } else if (myKind === "lancer") {
          if (mySpecialOn) {
            if (t >= ionNext) {
              ionNext = t + ION_TICK_MS;
              for (const tg of list) {
                if (tg.y < me.y && Math.abs(tg.x - me.x) <= ION_HALF_WIDTH + tg.r) {
                  claim(tg.a.id, t, "ion");
                  flashes.set(tg.a.id, { until: t + 80, colour: "#a5f3fc" });
                }
              }
            }
          } else if (firing && t >= laserNext) {
            laserNext = t + LASER_TICK_MS;
            const tg = beamTarget(list, me.x, me.y);
            if (tg) {
              claim(tg.a.id, t, "l");
              flashes.set(tg.a.id, { until: t + 80, colour: "#ffffff" });
            }
          }
        } else {
          if (firing && t - lastShot >= mySpec.fireMs) {
            lastShot = t;
            fireMissile(me.x, me.y, "m", mySpec.colour, t, list);
            sounds.shoot();
          }
          // Swarm: when the server confirms the special, launch the salvo.
          if (mySpecialOn && myState && swarmFor !== myState.s) {
            swarmFor = myState.s;
            swarmLeft = SWARM_MISSILES;
            swarmNext = t;
          }
          if (swarmLeft > 0 && t >= swarmNext) {
            swarmLeft--;
            swarmNext = t + 90;
            fireMissile(me.x, me.y, "sw", "#fde047", t, list);
          }
        }
        // Special on E / Shift / right click once charged.
        const wantsSpecial = specialKey || specialTapped;
        specialTapped = false;
        if (
          wantsSpecial &&
          myState &&
          myState.c >= SPECIAL_COST &&
          !mySpecialOn &&
          t - lastSpecialAsk > 600
        ) {
          lastSpecialAsk = t;
          p.sendSpecial();
        }
      }

      // ---------------- other players
      for (const [pid, ship] of Object.entries(battle.ships)) {
        if (pid === p.meId) continue;
        let r = remotes.get(pid);
        if (!r) {
          r = { x: ship.x, y: ship.y, lastShot: 0 };
          remotes.set(pid, r);
        }
        const k = Math.min(1, dt * 12);
        r.x += (ship.x - r.x) * k;
        r.y += (ship.y - r.y) * k;
        const spec = SHIPS[ship.k];
        const special = ship.s > t;
        if (ship.f && live) {
          if (ship.k === "viper") {
            const interval = special ? OD_INTERVAL_MS : spec.fireMs;
            if (t - r.lastShot >= interval) {
              r.lastShot = t;
              fireBullets(r.x, r.y, null, spec.colour, special, t);
            }
          } else if (ship.k === "hornet" && t - r.lastShot >= spec.fireMs) {
            r.lastShot = t;
            fireMissile(r.x, r.y, null, spec.colour, t, list);
          }
        }
      }
      for (const pid of remotes.keys()) if (!battle.ships[pid]) remotes.delete(pid);

      // ---------------- projectiles
      const hitAlready = new Set<number>();
      shots = shots.filter((s) => {
        if (s.missile) {
          let tg = s.target === null ? undefined : list.find((x) => x.a.id === s.target);
          if (!tg) {
            const next = nearestAhead(list, s.x, s.y + 200);
            s.target = next?.a.id ?? null;
            tg = next ?? undefined;
          }
          const speed = s.w === "sw" ? MISSILE_SPEED * 1.15 : MISSILE_SPEED;
          if (tg) {
            const dx = tg.x - s.x;
            const dy = tg.y - s.y;
            const d = Math.hypot(dx, dy) || 1;
            const steer = Math.min(1, dt * 7);
            s.vx += ((dx / d) * speed - s.vx) * steer;
            s.vy += ((dy / d) * speed - s.vy) * steer;
            if (d < tg.r + 10) {
              if (s.w) claim(tg.a.id, t, s.w);
              flashes.set(tg.a.id, { until: t + 90, colour: "#fff4a3" });
              burst(particles, s.x, s.y, s.colour, 8);
              return false;
            }
          } else {
            s.vy -= 600 * dt;
          }
          // Smoke trail.
          if (Math.random() < 0.5)
            particles.push({ x: s.x, y: s.y, vx: 0, vy: 30, life: 0.3, colour: "rgba(200,200,220,0.5)" });
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.y < -60 || s.y > ARENA_H + 60 || s.x < -60 || s.x > ARENA_W + 60 || t - s.born > 4000)
          return false;
        if (!s.missile) {
          for (const tg of list) {
            if (hitAlready.has(tg.a.id) && !s.w) continue;
            if (Math.abs(tg.x - s.x) <= tg.r && Math.abs(tg.y - s.y) <= tg.r) {
              if (s.w) claim(tg.a.id, t, s.w);
              flashes.set(tg.a.id, { until: t + 70, colour: "#fff4a3" });
              hitAlready.add(tg.a.id);
              burst(particles, s.x, s.y, "#fff4a3", 3);
              if (s.w) sounds.hit();
              return false;
            }
          }
        }
        return true;
      });

      if (
        p.canPlay &&
        t - lastSend >= INPUT_INTERVAL_MS &&
        t >= battle.startsAt - COUNTDOWN_MS &&
        t <= battle.endsAt
      ) {
        lastSend = t;
        p.sendInput(Math.round(me.x), Math.round(me.y), firing, pending.splice(0, 40));
      }

      // ---------------- strike beams (cosmetic; damage comes from the server)
      for (const tg of list) {
        for (const s of tg.a.strikes) {
          if (s.at > lastT && s.at <= t && (battle.topicHp[s.topicId] ?? 0) > 0) {
            const tile = battle.tiles.find((x) => x.topicId === s.topicId);
            const lv = battle.levels[tile?.level ?? 0];
            const dy = lv ? (laneOffset(lv, t) ?? 0) : 0;
            if (tile) {
              strikeBeams.push({
                x1: tg.x,
                y1: tg.y,
                x2: tile.x,
                y2: tile.y + dy,
                until: t + 140,
                heavy: tg.a.kind === "boss" || tg.a.kind === "brute",
              });
            }
          }
        }
      }
      lastT = t;

      // ================================================================ draw
      const scale = canvas.width / ARENA_W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#050816";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sx = shake > 0 ? (Math.random() - 0.5) * 16 * shake : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * 16 * shake : 0;
      shake = Math.max(0, shake - dt);
      ctx.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);

      // Stars stream past: we're moving through space.
      for (const s of stars) {
        s.y = (s.y + s.v * dt) % ARENA_H;
        ctx.fillStyle = `rgba(255,255,255,${0.3 + s.s / 3})`;
        ctx.fillRect(s.x, s.y, s.s, s.s * 2);
      }

      // Safe zone.
      const grad = ctx.createLinearGradient(0, SAFE_ZONE_Y - 20, 0, ARENA_H);
      grad.addColorStop(0, "rgba(74,222,128,0)");
      grad.addColorStop(1, "rgba(74,222,128,0.28)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, SAFE_ZONE_Y - 20, ARENA_W, ARENA_H - SAFE_ZONE_Y + 20);
      ctx.strokeStyle = "rgba(74,222,128,0.6)";
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, SAFE_ZONE_Y);
      ctx.lineTo(ARENA_W, SAFE_ZONE_Y);
      ctx.stroke();
      ctx.setLineDash([]);
      let saved = 0;
      let lost = 0;
      for (const tile of battle.tiles) {
        const lv = battle.levels[tile.level];
        if (!lv || t < lv.endsAt) continue;
        if ((battle.topicHp[tile.topicId] ?? 0) > 0) saved++;
        else lost++;
      }
      ctx.font = `700 16px "Space Grotesk", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(187,247,208,0.9)";
      ctx.textAlign = "left";
      ctx.fillText(`SAFE ZONE  ·  ${saved} saved  ·  ${lost} lost`, 24, SAFE_ZONE_Y + 16);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // Lanes: arriving, under attack, or flying down to safety.
      const topicById = new Map(p.topics.map((x) => [x.id, x]));
      battle.levels.forEach((lv, li) => {
        const dy = laneOffset(lv, t);
        if (dy === null) return;
        const escaping = t > lv.endsAt;
        ctx.save();
        ctx.translate(0, dy);
        const laneTiles = battle.tiles.filter((x) => x.level === li);
        const top = Math.min(...laneTiles.map((x) => x.y - x.h / 2));
        ctx.font = `700 14px "Space Grotesk", system-ui, sans-serif`;
        ctx.fillStyle = "rgba(163,172,214,0.85)";
        ctx.fillText(wrapText(ctx, lv.title.toUpperCase(), 600, 1)[0] ?? "", 40, Math.max(6, top - 24));
        for (const tile of laneTiles) {
          const hp = battle.topicHp[tile.topicId] ?? 0;
          const max = battle.topicMaxHp[tile.topicId] ?? 1;
          const ratio = Math.max(0, hp / max);
          const fell = hp <= 0;
          const x = tile.x - tile.w / 2;
          const y = tile.y - tile.h / 2;
          ctx.globalAlpha = fell ? 0.35 : 1;
          const armour = Math.min(1, (max - 60) / 150);
          if (!fell && armour > 0) {
            ctx.shadowColor = "#38bdf8";
            ctx.shadowBlur = 8 + armour * 24;
          }
          ctx.fillStyle = fell ? "#2a1a1a" : "#141b3a";
          ctx.strokeStyle = fell ? "#7a2a2a" : `rgba(56,189,248,${0.35 + armour * 0.65})`;
          ctx.lineWidth = 2 + armour * 3;
          roundRect(ctx, x, y, tile.w, tile.h, 10);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          const fontSize = Math.max(12, Math.min(18, tile.h / 5));
          ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = "#e8ecff";
          const title = topicById.get(tile.topicId)?.title ?? "";
          const maxLines = Math.max(1, Math.floor((tile.h - 26) / (fontSize * 1.2)));
          wrapText(ctx, title, tile.w - 16, maxLines).forEach((line, i) => {
            ctx.fillText(line, x + 8, y + 8 + i * fontSize * 1.2);
          });
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fillRect(x + 8, y + tile.h - 14, tile.w - 16, 6);
          ctx.fillStyle = ratio > 0.5 ? "#4ade80" : ratio > 0.25 ? "#facc15" : "#f87171";
          ctx.fillRect(x + 8, y + tile.h - 14, (tile.w - 16) * ratio, 6);
          if (fell || escaping) {
            ctx.globalAlpha = 1;
            ctx.font = `700 ${fontSize + 4}px "Space Grotesk", system-ui, sans-serif`;
            ctx.fillStyle = fell ? "#ff6b4a" : "#4ade80";
            ctx.textAlign = "center";
            ctx.fillText(fell ? "DESTROYED" : "SAFE ✓", tile.x, tile.y - fontSize / 2);
            ctx.textAlign = "left";
          }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      });

      // Strike beams.
      strikeBeams = strikeBeams.filter((b) => b.until > t);
      for (const b of strikeBeams) {
        ctx.strokeStyle = b.heavy ? "rgba(255,79,216,0.9)" : "rgba(124,255,107,0.8)";
        ctx.lineWidth = b.heavy ? 6 : 3;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
      }

      // Attackers (escaping lanes' attackers peel away too).
      for (const tg of list) {
        const flash = flashes.get(tg.a.id);
        const hp = battle.attackerHp[tg.a.id] ?? tg.a.hp;
        drawAttacker(
          ctx,
          tg.a.kind,
          tg.x,
          tg.y,
          t,
          flash && flash.until > t ? flash.colour : null,
          hp / tg.a.hp
        );
      }

      // Lasers and ion cannons, mine and everyone else's.
      const beams: { x: number; y: number; ion: boolean; colour: string }[] = [];
      if (p.canPlay && live && myKind === "lancer" && (mySpecialOn || firing)) {
        beams.push({ x: me.x, y: me.y, ion: mySpecialOn, colour: participant(p.meId)?.colour ?? "#fff" });
      }
      for (const [pid, ship] of Object.entries(battle.ships)) {
        if (pid === p.meId || ship.k !== "lancer" || !live) continue;
        const r = remotes.get(pid);
        if (r && (ship.f || ship.s > t)) {
          beams.push({ x: r.x, y: r.y, ion: ship.s > t, colour: participant(pid)?.colour ?? "#fff" });
        }
      }
      for (const b of beams) {
        if (b.ion) {
          const pulse = 0.75 + Math.sin(t / 40) * 0.25;
          const g = ctx.createLinearGradient(b.x - ION_HALF_WIDTH, 0, b.x + ION_HALF_WIDTH, 0);
          g.addColorStop(0, "rgba(34,211,238,0)");
          g.addColorStop(0.5, `rgba(165,243,252,${0.85 * pulse})`);
          g.addColorStop(1, "rgba(34,211,238,0)");
          ctx.fillStyle = g;
          ctx.fillRect(b.x - ION_HALF_WIDTH, 0, ION_HALF_WIDTH * 2, b.y - 20);
          ctx.fillStyle = `rgba(255,255,255,${0.9 * pulse})`;
          ctx.fillRect(b.x - 6, 0, 12, b.y - 20);
        } else {
          const tg = beamTarget(list, b.x, b.y);
          const endY = tg ? tg.y : 0;
          ctx.strokeStyle = "rgba(34,211,238,0.9)";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y - 36);
          ctx.lineTo(b.x, endY);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 2;
          ctx.stroke();
          if (tg && Math.random() < 0.5) burst(particles, b.x, endY, "#a5f3fc", 1);
        }
      }

      // Bullets and missiles.
      for (const s of shots) {
        ctx.fillStyle = s.colour;
        if (s.missile) {
          const a = Math.atan2(s.vy, s.vx);
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(a);
          ctx.fillRect(-9, -3, 18, 6);
          ctx.fillStyle = "#fde68a";
          ctx.fillRect(-14, -2, 5, 4);
          ctx.restore();
        } else {
          ctx.globalAlpha = s.w ? 1 : 0.75;
          ctx.fillRect(s.x - 2, s.y - 10, 4, 16);
          ctx.globalAlpha = 1;
        }
      }

      // Ships: everyone else, then mine on top.
      ctx.font = `500 14px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      for (const [pid, ship] of Object.entries(battle.ships)) {
        if (pid === p.meId) continue;
        const r = remotes.get(pid);
        if (!r) continue;
        const who = participant(pid);
        drawShip(ctx, ship.k, r.x, r.y, who?.colour ?? "#999", SHIPS[ship.k].colour, {
          me: false,
          thrust: false,
          t,
        });
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(who?.name ?? "", r.x, r.y + 36);
      }
      if (p.canPlay) {
        const who = participant(p.meId);
        drawShip(ctx, myKind, me.x, me.y, who?.colour ?? "#fff", mySpec.colour, {
          me: true,
          thrust: me.thrusting,
          t,
        });
        // Special charge bar.
        const charge = Math.min(SPECIAL_COST, myState?.c ?? 0) / SPECIAL_COST;
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(me.x - 34, me.y + 30, 68, 6);
        ctx.fillStyle = mySpecialOn ? "#ffffff" : mySpec.colour;
        ctx.fillRect(me.x - 34, me.y + 30, 68 * (mySpecialOn ? 1 : charge), 6);
        ctx.fillStyle = "#ffffff";
        // Your own ship is the glowing one; only the special prompt needs words.
        if (charge >= 1 && !mySpecialOn && live) {
          ctx.globalAlpha = 0.6 + Math.sin(t / 120) * 0.4;
          ctx.font = `700 16px "Space Grotesk", system-ui, sans-serif`;
          ctx.fillText(`${mySpec.special.toUpperCase()} READY · E`, me.x, me.y - 52);
          ctx.globalAlpha = 1;
        }
      }
      ctx.textAlign = "left";

      // Particles.
      particles = particles.filter((pt) => {
        pt.life -= dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 300 * dt;
        if (pt.life <= 0) return false;
        ctx.globalAlpha = Math.min(1, pt.life * 2);
        ctx.fillStyle = pt.colour;
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        return true;
      });
      ctx.globalAlpha = 1;

      // Countdown.
      if (!started) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#e8ecff";
        const secs = Math.ceil((battle.startsAt - t) / 1000);
        ctx.font = `700 120px "Space Grotesk", system-ui, sans-serif`;
        ctx.fillText(secs > 0 ? String(secs) : "GO!", ARENA_W / 2, 470);
        ctx.font = `500 24px Inter, system-ui, sans-serif`;
        ctx.fillText(
          p.canPlay
            ? "Fly: mouse or WASD / arrows  ·  Fire: click / Space  ·  Special: E or right-click"
            : "Watching the battle",
          ARENA_W / 2,
          620
        );
        ctx.textAlign = "left";
      }

      if (import.meta.env.DEV) {
        (window as unknown as { __yartBattle?: unknown }).__yartBattle = {
          me: { x: Math.round(me.x), y: Math.round(me.y) },
          remotes: [...remotes.keys()],
          shots: shots.length,
          ...stats,
          charge: myState?.c ?? 0,
          special: mySpecialOn,
          level,
        };
      }
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      stopMusic();
      ro.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // The loop reads everything else through `latest`; restart only for a new battle.
  }, [props.battle.startsAt]);

  return (
    <canvas
      ref={canvasRef}
      className="battle-canvas"
      aria-label="Battle arena. Fly with the mouse or WASD, fire with click or Space, special with E."
      role="img"
      tabIndex={0}
    />
  );
}
