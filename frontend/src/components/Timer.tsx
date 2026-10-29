import { useEffect, useRef, useState } from "react";
import { LIMITS } from "@yart/shared";
import { formatDuration, parseDuration } from "../lib/format";
import { sounds } from "../lib/sounds";
import { useRoom } from "../room/RoomContext";

/**
 * Shared countdown in the header. Everyone sees it while it's in use; the owner also gets
 * play/pause and reset, and clicks the time to change the length.
 */
export function Timer() {
  const { room, now, isOwner, send, toast } = useRoom();
  const timer = room.timer;
  const [, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const alarmedFor = useRef<number | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (timer.status !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [timer.status]);

  const remaining =
    timer.status === "running" && timer.endsAt !== null
      ? timer.endsAt - now()
      : timer.status === "done"
        ? 0
        : timer.remainingMs;
  const finished = timer.status === "done" || (timer.status === "running" && remaining <= 0);
  const running = timer.status === "running" && !finished;

  useEffect(() => {
    if (!finished || timer.endsAt === null || alarmedFor.current === timer.endsAt) return;
    alarmedFor.current = timer.endsAt;
    // Only ring if we were here when it ran out, not when joining a room long after.
    if (now() - timer.endsAt < 5000) sounds.alarm();
  }, [finished, timer.endsAt, now]);

  if (timer.status === "idle" && !isOwner) return null;

  const label = finished
    ? "Time's up"
    : `Time left ${formatDuration(remaining)}${timer.status === "paused" ? ", paused" : ""}`;

  const commit = () => {
    setEditing(false);
    if (cancelled.current) return;
    if (draft.trim() === formatDuration(timer.durationMs)) return;
    const ms = parseDuration(draft);
    if (ms === null) {
      toast("Use minutes and seconds like 1:30, or 45s");
    } else if (ms < LIMITS.timerMinMs || ms > LIMITS.timerMaxMs) {
      toast("Timers can be 5 seconds to 60 minutes");
    } else {
      send({ t: "timer.set", durationMs: ms });
    }
  };

  return (
    <div className={`timer ${finished ? "done" : timer.status}`}>
      {editing ? (
        <input
          className="timer-input"
          aria-label="Timer length (m:ss)"
          value={draft}
          autoFocus
          // Select the current value so typing replaces it rather than appending.
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
        />
      ) : isOwner && !running ? (
        <button
          className="timer-value editable"
          role="timer"
          aria-label={`${label}. Click to change length`}
          title="Click to change length"
          onClick={() => {
            cancelled.current = false;
            setDraft(formatDuration(timer.durationMs));
            setEditing(true);
          }}
        >
          {finished ? "Time's up!" : formatDuration(remaining)}
        </button>
      ) : (
        <span className="timer-value" role="timer" aria-label={label}>
          {finished ? "Time's up!" : formatDuration(remaining)}
        </span>
      )}
      {isOwner && !editing && (
        <>
          {running ? (
            <button className="timer-btn" aria-label="Pause timer" onClick={() => send({ t: "timer.pause" })}>
              ⏸
            </button>
          ) : (
            <button
              className="timer-btn play"
              aria-label={timer.status === "paused" ? "Resume timer" : "Start timer"}
              onClick={() => send({ t: timer.status === "paused" ? "timer.resume" : "timer.start" })}
            >
              ▶
            </button>
          )}
          {timer.status !== "idle" && (
            <button className="timer-btn" aria-label="Reset timer" onClick={() => send({ t: "timer.reset" })}>
              ↺
            </button>
          )}
        </>
      )}
    </div>
  );
}
