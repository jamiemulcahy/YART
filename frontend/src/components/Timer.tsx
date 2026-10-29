import { useEffect, useRef, useState } from "react";
import { formatDuration } from "../lib/format";
import { sounds } from "../lib/sounds";
import { useRoom } from "../room/RoomContext";

/** Shared countdown everyone sees. Plays the alarm when it reaches zero. */
export function Timer() {
  const { room, now } = useRoom();
  const timer = room.timer;
  const [, setTick] = useState(0);
  const alarmedFor = useRef<number | null>(null);

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

  useEffect(() => {
    if (!finished || timer.endsAt === null || alarmedFor.current === timer.endsAt) return;
    alarmedFor.current = timer.endsAt;
    // Only ring if we were here when it ran out, not when joining a room long after.
    if (now() - timer.endsAt < 5000) sounds.alarm();
  }, [finished, timer.endsAt, now]);

  if (timer.status === "idle") return null;

  return (
    <div
      className={`timer ${finished ? "done" : timer.status}`}
      role="timer"
      aria-label={
        finished
          ? "Time's up"
          : `Time left ${formatDuration(remaining)}${timer.status === "paused" ? ", paused" : ""}`
      }
    >
      <span aria-hidden="true">⏱</span>
      <span className="timer-value">{finished ? "Time's up!" : formatDuration(remaining)}</span>
      {timer.status === "paused" && <span className="timer-state">paused</span>}
    </div>
  );
}
