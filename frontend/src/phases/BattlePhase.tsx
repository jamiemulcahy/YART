import { useCallback } from "react";
import { rankTopics, topicMaxHp } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { PhaseIntro } from "../components/common";
import { BattleCanvas } from "../game/BattleCanvas";
import type { Hit } from "../game/BattleCanvas";
import { ShipPicker } from "../components/ShipPicker";

export function BattlePhase() {
  const { room, battle, topics, me, isOwner, isViewer, send, now } = useRoom();
  const sendInput = useCallback(
    (x: number, y: number, f: boolean, hits: Hit[]) => send({ t: "battle.input", x, y, f, hits }),
    [send]
  );
  const sendSpecial = useCallback(() => send({ t: "battle.special" }), [send]);

  if (battle) {
    return (
      <div className="phase battle live">
        <BattleCanvas
          battle={battle}
          topics={topics}
          participants={room.participants}
          meId={me.id}
          canPlay={!isViewer}
          now={now}
          sendInput={sendInput}
          sendSpecial={sendSpecial}
        />
      </div>
    );
  }

  const results = room.battle;
  if (results) {
    const fell = Object.values(results.fates).filter((f) => f === "fell").length;
    const survived = Object.values(results.fates).filter((f) => f === "survived").length;
    const ranked = rankTopics(topics, room.shields.totals ?? {}).filter((t) => results.fates[t.id]);
    return (
      <div className="phase battle results">
        <PhaseIntro
          title={
            survived + fell === 0 ? "Battle called off" : survived > fell ? "The line held!" : "Heavy losses!"
          }
        >
          {survived} {survived === 1 ? "topic" : "topics"} survived, {fell} fell. Just for fun — the retro's
          results don't change.
        </PhaseIntro>
        <div className="results-grid">
          <section className="panel">
            <h3>Fates</h3>
            <ul className="fates">
              {ranked.map((t) => (
                <li key={t.id} className={results.fates[t.id]}>
                  <span>{results.fates[t.id] === "survived" ? "⭐" : "💥"}</span>
                  <span className="fate-title">{t.title}</span>
                  <span className="muted">🛡 {room.shields.totals?.[t.id] ?? 0}</span>
                </li>
              ))}
            </ul>
          </section>
          {results.stats && results.stats.length > 0 && (
            <section className="panel">
              <h3>Top guns</h3>
              <ol className="leaderboard">
                {results.stats.slice(0, 10).map((s) => (
                  <li key={s.participantId}>
                    <span className="dot" style={{ background: s.colour }} aria-hidden="true" />
                    <span>{s.name}</span>
                    <span className="muted">
                      {s.kills} kills{s.bossKills > 0 ? ` · ${s.bossKills} boss` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    );
  }

  const ranked = rankTopics(topics, room.shields.totals ?? {});
  const players = room.participants.filter((p) => p.online && p.role !== "viewer").length;
  return (
    <div className="phase battle briefing">
      <PhaseIntro
        title="Invaders incoming!"
        aside={
          isOwner && (
            <button className="btn primary big" onClick={() => send({ t: "battle.launch" })}>
              Launch battle!
            </button>
          )
        }
      >
        Your votes have become 🛡 shields: the more votes a topic got, the tougher its armour. Lanes move in
        one at a time and come under attack; hold out until each one flies down to the safe zone. It gets
        harder as you go, and bosses need the whole team. Just for fun — the retro's results don't change.
      </PhaseIntro>
      <div className="briefing-grid">
        {!isViewer && (
          <section className="panel briefing-ship">
            <h3>Your ship</h3>
            <ShipPicker
              value={me.ship}
              colour={me.colour}
              onChange={(ship) => send({ t: "ship.set", ship })}
            />
          </section>
        )}
        <section className="panel">
          <h3>Controls</h3>
          <ul className="controls">
            <li>
              Fly with the <kbd>Mouse</kbd> or <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / arrows —
              you drift back unless you keep pushing forward
            </li>
            <li>
              <kbd>Click</kbd> or hold <kbd>Space</kbd> to fire
            </li>
            <li>
              Hits charge your special — <kbd>E</kbd>, <kbd>Shift</kbd> or right-click to unleash it
            </li>
          </ul>
          {!isOwner && <p className="muted">Waiting for the facilitator to launch…</p>}
        </section>
        <section className="panel">
          <h3>Armour</h3>
          <ul className="armour-list">
            {ranked.slice(0, 12).map((t) => {
              const shields = room.shields.totals?.[t.id] ?? 0;
              return (
                <li key={t.id}>
                  <span className="fate-title">{t.title}</span>
                  <span className="muted">{topicMaxHp(shields, players)} HP</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
