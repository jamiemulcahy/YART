import { useEffect, useLayoutEffect, useRef } from "react";
import {
  ARENA_H,
  ARENA_W,
  BULLET_SPEED,
  FIRE_INTERVAL_MS,
  SHIP_Y,
  attackerPos,
  attackerRadius,
} from "@yart/shared";
import type { BattleLive, Participant, Topic } from "@yart/shared";
import { sounds } from "../lib/sounds";
import { burst, drawBoss, drawGrunt, drawShip, wrapText } from "./draw";
import type { Particle } from "./draw";

const INPUT_INTERVAL_MS = 200;
const SHIP_SPEED = 950; // units/s with keys

interface Props {
  battle: BattleLive;
  topics: Topic[];
  participants: Participant[];
  meId: string;
  canPlay: boolean;
  now: () => number;
  sendInput: (x: number, hits: { a: number; at: number }[]) => void;
}

interface Bullet {
  x: number;
  y: number;
}

interface Beam {
  from: { x: number; y: number };
  to: { x: number; y: number };
  until: number;
  boss: boolean;
}

/**
 * The battle arena. Attacker movement comes from the shared script (a pure
 * function of time); the server decides deaths and topic damage.
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

    let myX = ARENA_W / 2;
    let firing = false;
    const keys = new Set<string>();
    let bullets: Bullet[] = [];
    const pendingHits: { a: number; at: number }[] = [];
    const flashUntil = new Map<number, number>();
    const localDamage = new Map<number, number>();
    let particles: Particle[] = [];
    let beams: Beam[] = [];
    let shake = 0;
    let lastFire = 0;
    let lastSend = 0;
    let lastFrame = performance.now();
    let lastT = latest.current.now();
    let lastCountdown = -1;
    let seenDead = new Set<number>(latest.current.battle.dead);
    const seenFallen = new Set(
      Object.entries(latest.current.battle.topicHp)
        .filter(([, hp]) => hp <= 0)
        .map(([id]) => id)
    );
    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * ARENA_W,
      y: Math.random() * ARENA_H,
      s: Math.random() * 1.8 + 0.4,
      v: Math.random() * 20 + 8,
    }));
    let frame = 0;

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

    const toArenaX = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      return Math.min(ARENA_W, Math.max(0, ((clientX - rect.left) / rect.width) * ARENA_W));
    };
    const onPointerMove = (e: PointerEvent) => {
      myX = toArenaX(e.clientX);
    };
    const onPointerDown = (e: PointerEvent) => {
      myX = toArenaX(e.clientX);
      firing = true;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerUp = () => {
      firing = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "a", "d", "A", "D", " "].includes(e.key)) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        if (e.key === " ") firing = true;
        else keys.add(e.key.toLowerCase());
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") firing = false;
      keys.delete(e.key.toLowerCase());
    };
    if (latest.current.canPlay) {
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    }

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
      const dead = new Set(battle.dead);
      const byId = new Map(battle.script.map((a) => [a.id, a]));

      // --- server-confirmed events
      for (const id of dead) {
        if (seenDead.has(id)) continue;
        const a = byId.get(id);
        const pos = a && attackerPos(a, t);
        if (a && pos) {
          burst(
            particles,
            pos.x,
            pos.y,
            a.kind === "boss" ? "#ff4fd8" : "#7CFF6B",
            a.kind === "boss" ? 80 : 22
          );
          if (a.kind === "boss") shake = 0.6;
        }
        sounds.explode();
      }
      seenDead = dead;
      for (const [topicId, hp] of Object.entries(battle.topicHp)) {
        if (hp <= 0 && !seenFallen.has(topicId)) {
          seenFallen.add(topicId);
          const tile = battle.tiles.find((x) => x.topicId === topicId);
          if (tile) burst(particles, tile.x, tile.y, "#ff6b4a", 60);
          shake = Math.max(shake, 0.4);
          sounds.topicFell();
        }
      }

      // --- countdown
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

      // --- input & bullets
      if (p.canPlay && live) {
        if (keys.has("arrowleft") || keys.has("a")) myX -= SHIP_SPEED * dt;
        if (keys.has("arrowright") || keys.has("d")) myX += SHIP_SPEED * dt;
        myX = Math.min(ARENA_W - 20, Math.max(20, myX));
        if (firing && t - lastFire >= FIRE_INTERVAL_MS) {
          lastFire = t;
          bullets.push({ x: myX, y: SHIP_Y - 30 });
          sounds.shoot();
        }
      }
      const alive = battle.script.filter((a) => !dead.has(a.id));
      bullets = bullets.filter((b) => {
        b.y -= BULLET_SPEED * dt;
        if (b.y < -40) return false;
        for (const a of alive) {
          const pos = attackerPos(a, t);
          if (!pos) continue;
          const r = attackerRadius(a);
          if (Math.abs(pos.x - b.x) <= r && Math.abs(pos.y - b.y) <= r) {
            pendingHits.push({ a: a.id, at: Math.round(t) });
            flashUntil.set(a.id, t + 90);
            localDamage.set(a.id, (localDamage.get(a.id) ?? 0) + 1);
            sounds.hit();
            burst(particles, b.x, b.y, "#fff4a3", 5);
            return false;
          }
        }
        return true;
      });
      if (p.canPlay && live && t - lastSend >= INPUT_INTERVAL_MS) {
        lastSend = t;
        p.sendInput(Math.round(myX), pendingHits.splice(0, 20));
      }

      // --- strike beams (cosmetic; damage comes from the server)
      for (const a of alive) {
        for (const s of a.strikes) {
          if (s.at > lastT && s.at <= t && (battle.topicHp[s.topicId] ?? 0) > 0) {
            const pos = attackerPos(a, t);
            const tile = battle.tiles.find((x) => x.topicId === s.topicId);
            if (pos && tile)
              beams.push({
                from: pos,
                to: { x: tile.x, y: tile.y },
                until: t + 160,
                boss: a.kind === "boss",
              });
          }
        }
      }
      lastT = t;

      // --- draw
      const scale = canvas.width / ARENA_W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#050816";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sx = shake > 0 ? (Math.random() - 0.5) * 16 * shake : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * 16 * shake : 0;
      shake = Math.max(0, shake - dt);
      ctx.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);

      for (const s of stars) {
        s.y = (s.y + s.v * dt) % ARENA_H;
        ctx.fillStyle = `rgba(255,255,255,${0.3 + s.s / 3})`;
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }

      // Topic tiles
      const topicById = new Map(p.topics.map((x) => [x.id, x]));
      ctx.textBaseline = "top";
      for (const tile of battle.tiles) {
        const hp = battle.topicHp[tile.topicId] ?? 0;
        const max = battle.topicMaxHp[tile.topicId] ?? 1;
        const ratio = Math.max(0, hp / max);
        const fell = hp <= 0;
        const x = tile.x - tile.w / 2;
        const y = tile.y - tile.h / 2;
        ctx.globalAlpha = fell ? 0.35 : 1;
        const shieldGlow = Math.min(1, (max - 20) / 75);
        if (!fell && shieldGlow > 0) {
          ctx.shadowColor = "#38bdf8";
          ctx.shadowBlur = 8 + shieldGlow * 24;
        }
        ctx.fillStyle = fell ? "#2a1a1a" : "#141b3a";
        ctx.strokeStyle = fell ? "#7a2a2a" : `rgba(56,189,248,${0.35 + shieldGlow * 0.65})`;
        ctx.lineWidth = 2 + shieldGlow * 3;
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
        // HP bar
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(x + 8, y + tile.h - 14, tile.w - 16, 6);
        ctx.fillStyle = ratio > 0.5 ? "#4ade80" : ratio > 0.25 ? "#facc15" : "#f87171";
        ctx.fillRect(x + 8, y + tile.h - 14, (tile.w - 16) * ratio, 6);
        if (fell) {
          ctx.globalAlpha = 1;
          ctx.font = `700 ${fontSize + 4}px "Space Grotesk", system-ui, sans-serif`;
          ctx.fillStyle = "#ff6b4a";
          ctx.textAlign = "center";
          ctx.fillText("DESTROYED", tile.x, tile.y - fontSize / 2);
          ctx.textAlign = "left";
        }
        ctx.globalAlpha = 1;
      }

      // Beams
      beams = beams.filter((b) => b.until > t);
      for (const b of beams) {
        ctx.strokeStyle = b.boss ? "rgba(255,79,216,0.9)" : "rgba(124,255,107,0.8)";
        ctx.lineWidth = b.boss ? 6 : 3;
        ctx.beginPath();
        ctx.moveTo(b.from.x, b.from.y);
        ctx.lineTo(b.to.x, b.to.y);
        ctx.stroke();
      }

      // Attackers
      for (const a of alive) {
        const pos = attackerPos(a, t);
        if (!pos) continue;
        const flash = (flashUntil.get(a.id) ?? 0) > t;
        if (a.kind === "boss") {
          const hp = battle.attackerHp[a.id] ?? a.hp;
          drawBoss(ctx, pos.x, pos.y, hp / a.hp, flash);
        } else {
          drawGrunt(ctx, pos.x, pos.y, t, flash);
        }
      }

      // Ships
      const colours = new Map(p.participants.map((x) => [x.id, x]));
      ctx.font = `500 14px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      for (const [pid, x] of Object.entries(battle.ships)) {
        if (pid === p.meId) continue;
        const who = colours.get(pid);
        drawShip(ctx, x, SHIP_Y, who?.colour ?? "#999", false);
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText(who?.name ?? "", x, SHIP_Y + 28);
      }
      if (p.canPlay) {
        const me = colours.get(p.meId);
        drawShip(ctx, myX, SHIP_Y, me?.colour ?? "#fff", true);
        ctx.fillStyle = "#ffffff";
        ctx.fillText("you", myX, SHIP_Y + 28);
      }
      ctx.textAlign = "left";

      // Bullets
      ctx.fillStyle = "#fff4a3";
      for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 10, 4, 16);

      // Particles
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

      // HUD
      ctx.textAlign = "center";
      ctx.fillStyle = "#e8ecff";
      if (!started) {
        const secs = Math.ceil((battle.startsAt - t) / 1000);
        ctx.font = `700 120px "Space Grotesk", system-ui, sans-serif`;
        ctx.fillText(secs > 0 ? String(secs) : "GO!", ARENA_W / 2, 330);
        ctx.font = `500 26px Inter, system-ui, sans-serif`;
        ctx.fillText(
          p.canPlay ? "Move: mouse or ← →   ·   Fire: click / hold Space" : "Watching the battle",
          ARENA_W / 2,
          480
        );
      } else {
        const left = Math.max(0, battle.endsAt - t);
        ctx.font = `700 30px "Space Grotesk", system-ui, sans-serif`;
        ctx.fillText(`${Math.ceil(left / 1000)}s`, ARENA_W / 2, 640);
      }
      ctx.textAlign = "left";
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // The loop reads everything else through `latest`; restart only for a new battle.
  }, [props.battle.startsAt]);

  return (
    <canvas
      ref={canvasRef}
      className="battle-canvas"
      aria-label="Battle arena. Move your ship with the mouse or arrow keys and fire with click or Space."
      role="img"
    />
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
