import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LANE_TEMPLATES, LIMITS } from "@yart/shared";
import { createRoom, normaliseCode } from "../lib/api";
import { storage } from "../lib/storage";

export function Landing() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(LANE_TEMPLATES[0]?.id ?? "blank");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const template = LANE_TEMPLATES.find((t) => t.id === templateId);
      const room = await createRoom(name.trim() || "Team retro", template?.lanes ?? []);
      storage.setOwnerKey(room.code, room.ownerKey);
      navigate(`/r/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the room");
      setCreating(false);
    }
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    const normalised = normaliseCode(code);
    if (normalised.length === 6) navigate(`/r/${normalised}`);
    else setError("Room codes are 6 characters, like K7M-QX2");
  };

  return (
    <div className="landing">
      <div className="stars" aria-hidden="true" />
      <header className="landing-hero">
        <h1 className="logo">
          YART<span className="logo-dot">.</span>
        </h1>
        <p className="tagline">Retros your team actually shows up for.</p>
        <p className="sub">
          Write, group, defend the topics that matter — then hold the line against an alien invasion.
          Anonymous, real-time, no sign-up.
        </p>
      </header>

      <main className="landing-panels">
        <form className="panel" onSubmit={onCreate} aria-labelledby="create-heading">
          <h2 id="create-heading">Start a retro</h2>
          <label className="field">
            <span>Retro name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sprint 42 retro"
              maxLength={LIMITS.roomName}
            />
          </label>
          <fieldset className="templates">
            <legend>Lanes</legend>
            {LANE_TEMPLATES.map((t) => (
              <label key={t.id} className={`template ${templateId === t.id ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="template"
                  value={t.id}
                  checked={templateId === t.id}
                  onChange={() => setTemplateId(t.id)}
                />
                <span className="template-name">{t.name}</span>
                <span className="template-lanes">
                  {t.lanes.length ? t.lanes.map((l) => l.title).join(" · ") : "Make your own lanes"}
                </span>
              </label>
            ))}
          </fieldset>
          <button className="btn primary big" type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create room"}
          </button>
        </form>

        <form className="panel" onSubmit={onJoin} aria-labelledby="join-heading">
          <h2 id="join-heading">Join a retro</h2>
          <label className="field">
            <span>Room code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="K7M-QX2"
              autoCapitalize="characters"
              autoComplete="off"
              className="code-input"
              maxLength={12}
            />
          </label>
          <button className="btn big" type="submit">
            Join room
          </button>
          <ol className="how">
            <li>
              <strong>Write</strong> your thoughts into lanes
            </li>
            <li>
              <strong>Group</strong> the similar ones together
            </li>
            <li>
              <strong>Defend</strong> what matters with your shields
            </li>
            <li>
              <strong>Battle</strong> the invaders (just for fun)
            </li>
            <li>
              <strong>Discuss</strong> the top topics and agree actions
            </li>
          </ol>
        </form>
      </main>
      {error && (
        <p className="landing-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
