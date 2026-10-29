import { useCallback } from "react";
import { BASE_TOPIC_HP, SHIELD_HP, rankTopics, topicMaxHp } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { PhaseIntro } from "../components/common";
import { BattleCanvas } from "../game/BattleCanvas";

export function BattlePhase() {
  const { room, battle, topics, me, isOwner, isViewer, send, now } = useRoom();
  const sendInput = useCallback(
    (x: number, hits: { a: number; at: number }[]) => send({ t: "battle.input", x, hits }),
    [send]
  );

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
        <PhaseIntro title={survived > fell ? "The line held!" : "Heavy losses!"}>
          {survived} topics survived, {fell} fell. Don't worry — the battle doesn't change anything: topics
          are still discussed in shield order.
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
        Your shields became armour: every topic starts with {BASE_TOPIC_HP} HP plus {SHIELD_HP} per shield.
        Work together to shoot down the invaders before they wreck the board. Bosses need the whole team. This
        is just for fun — it won't change the discussion order.
      </PhaseIntro>
      <div className="briefing-grid">
        <section className="panel">
          <h3>Controls</h3>
          <ul className="controls">
            <li>
              <kbd>Mouse</kbd> or <kbd>←</kbd> <kbd>→</kbd> / <kbd>A</kbd> <kbd>D</kbd> to move
            </li>
            <li>
              <kbd>Click</kbd> or hold <kbd>Space</kbd> to fire
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
                  <span className="muted">{topicMaxHp(shields)} HP</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
