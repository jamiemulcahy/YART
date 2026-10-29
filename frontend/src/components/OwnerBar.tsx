import { useState } from "react";
import { LIMITS, PHASES, PHASE_LABELS } from "@yart/shared";
import type { Phase, SettingsPatch } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { formatDuration } from "../lib/format";

const TIMER_PRESETS = [1, 2, 3, 5, 10, 15];

export function OwnerBar() {
  const { room, send, battle } = useRoom();
  const [showSettings, setShowSettings] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
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

          <button className="btn ghost" onClick={() => setShowTimer((s) => !s)} aria-expanded={showTimer}>
            ⏱ Timer
          </button>
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
      {showTimer && <TimerControls />}
      {showSettings && <SettingsPanel />}
    </section>
  );
}

function TimerControls() {
  const { room, send, now } = useRoom();
  const timer = room.timer;
  const finished = timer.status === "done" || (timer.status === "running" && (timer.endsAt ?? 0) <= now());
  const [custom, setCustom] = useState(String(Math.round(timer.durationMs / 60_000)));

  const setMinutes = (minutes: number) => {
    const ms = Math.round(minutes * 60_000);
    if (ms < LIMITS.timerMinMs || ms > LIMITS.timerMaxMs) return;
    send({ t: "timer.set", durationMs: ms });
  };

  return (
    <div className="owner-panel" aria-label="Timer controls">
      <div className="timer-presets" role="group" aria-label="Timer length">
        {TIMER_PRESETS.map((m) => (
          <button
            key={m}
            className={`chip ${timer.durationMs === m * 60_000 ? "selected" : ""}`}
            onClick={() => setMinutes(m)}
          >
            {m} min
          </button>
        ))}
        <label className="inline-field">
          <span>Custom (min)</span>
          <input
            type="number"
            min={0.5}
            max={60}
            step={0.5}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={() => setMinutes(Number(custom))}
            onKeyDown={(e) => e.key === "Enter" && setMinutes(Number(custom))}
          />
        </label>
      </div>
      <div className="timer-buttons">
        <span className="muted">Length {formatDuration(timer.durationMs)}</span>
        {(timer.status === "idle" || finished) && (
          <button className="btn primary" onClick={() => send({ t: "timer.start" })}>
            Start timer
          </button>
        )}
        {timer.status === "running" && !finished && (
          <>
            <button className="btn" onClick={() => send({ t: "timer.pause" })}>
              Pause
            </button>
            <button className="btn ghost" onClick={() => send({ t: "timer.start" })}>
              Restart
            </button>
          </>
        )}
        {timer.status === "paused" && (
          <button className="btn primary" onClick={() => send({ t: "timer.resume" })}>
            Resume
          </button>
        )}
        {timer.status !== "idle" && (
          <button className="btn ghost" onClick={() => send({ t: "timer.reset" })}>
            Stop &amp; hide
          </button>
        )}
      </div>
    </div>
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
        <span>Hide card text until revealed</span>
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
        <span>Battle length</span>
        <select
          value={s.battleDurationSec}
          onChange={(e) => update({ battleDurationSec: Number(e.target.value) })}
        >
          {[60, 90, 120, 180].map((n) => (
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
