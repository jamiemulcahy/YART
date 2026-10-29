import { useState } from "react";
import { LIMITS, PHASES, PHASE_LABELS } from "@yart/shared";
import type { Phase, SettingsPatch } from "@yart/shared";
import { useRoom } from "../room/RoomContext";

export function OwnerBar() {
  const { room, send, battle } = useRoom();
  const [showSettings, setShowSettings] = useState(false);
  const index = PHASES.indexOf(room.phase);
  const prev: Phase | undefined = room.phase === "discuss" ? "defend" : PHASES[index - 1];
  const next: Phase | undefined = PHASES[index + 1];
  const setPhase = (phase: Phase) => send({ t: "phase.set", phase });

  const nextDisabledReason =
    room.phase === "setup" && room.lanes.length === 0 ? "Add at least one lane" : null;

  return (
    <section className="owner-bar" aria-label="Facilitator controls">
      <div className="owner-row">
        <span className="owner-tag">Facilitator</span>
        <div className="owner-actions">
          {prev && (
            <button className="btn ghost" onClick={() => setPhase(prev)}>
              ← Back to {PHASE_LABELS[prev]}
            </button>
          )}

          {room.phase === "write" && room.settings.hideCards && !room.revealed && (
            <button className="btn" onClick={() => send({ t: "cards.reveal" })}>
              Reveal cards
            </button>
          )}
          {room.phase === "group" && (
            <button
              className="btn"
              onClick={() => send({ t: "grouping.lock", locked: !room.groupingLocked })}
            >
              {room.groupingLocked ? "Unlock grouping" : "Lock grouping"}
            </button>
          )}
          {room.phase === "battle" && !battle && room.battle && (
            <button className="btn" onClick={() => send({ t: "battle.launch" })}>
              Play again
            </button>
          )}
          {room.phase === "battle" && battle && (
            <button className="btn" onClick={() => send({ t: "battle.stop" })}>
              End battle now
            </button>
          )}
          {room.phase === "defend" && (
            <button className="btn ghost" onClick={() => setPhase("discuss")}>
              Skip battle → Discuss
            </button>
          )}

          <button
            className="btn ghost"
            onClick={() => setShowSettings((s) => !s)}
            aria-expanded={showSettings}
          >
            ⚙ Settings
          </button>

          {next && (
            <button
              className="btn primary"
              onClick={() => setPhase(next)}
              disabled={!!nextDisabledReason}
              title={nextDisabledReason ?? undefined}
            >
              Next: {PHASE_LABELS[next]} →
            </button>
          )}
        </div>
      </div>
      {showSettings && <SettingsPanel />}
    </section>
  );
}

function SettingsPanel() {
  const { room, send } = useRoom();
  const s = room.settings;
  const update = (settings: SettingsPatch) => send({ t: "settings.update", settings });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="owner-panel settings" aria-label="Room settings">
      <label className="toggle">
        <input
          type="checkbox"
          checked={s.hideCards}
          onChange={(e) => update({ hideCards: e.target.checked })}
        />
        <span>Keep published cards face-down until revealed</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={s.allowLateCards}
          onChange={(e) => update({ allowLateCards: e.target.checked })}
        />
        <span>Allow adding cards while grouping</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={s.showShieldTotals}
          onChange={(e) => update({ showShieldTotals: e.target.checked })}
        />
        <span>Show shield totals while defending</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={s.showBattleStats}
          onChange={(e) => update({ showBattleStats: e.target.checked })}
        />
        <span>Show battle leaderboard</span>
      </label>
      <label className="inline-field">
        <span>Shields per person</span>
        <input
          type="number"
          min={LIMITS.shieldsPerPersonMin}
          max={LIMITS.shieldsPerPersonMax}
          value={s.shieldsPerPerson}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= LIMITS.shieldsPerPersonMin && n <= LIMITS.shieldsPerPersonMax)
              update({ shieldsPerPerson: n });
          }}
        />
      </label>
      <label className="inline-field">
        <span>Max shields on one topic</span>
        <input
          type="number"
          min={1}
          max={s.shieldsPerPerson}
          value={s.maxShieldsPerTopic}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 1 && n <= s.shieldsPerPerson) update({ maxShieldsPerTopic: n });
          }}
        />
      </label>
      <label className="inline-field">
        <span>Battle time per lane</span>
        <select
          value={s.battleDurationSec}
          onChange={(e) => update({ battleDurationSec: Number(e.target.value) })}
        >
          {[15, 20, 25, 30, 45].map((n) => (
            <option key={n} value={n}>
              {n}s
            </option>
          ))}
        </select>
      </label>
      <div className="danger-zone">
        {confirmDelete ? (
          <>
            <span>Delete this room for everyone? This can't be undone.</span>
            <button className="btn danger" onClick={() => send({ t: "room.delete" })}>
              Yes, delete room
            </button>
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
            Delete room…
          </button>
        )}
      </div>
    </div>
  );
}
