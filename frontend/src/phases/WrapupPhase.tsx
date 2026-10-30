import { useMemo, useState } from "react";
import { exportMarkdown, rankTopics } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { PhaseIntro } from "../components/common";
import { ActionList } from "./DiscussPhase";

export function WrapupPhase() {
  const { room, topics } = useRoom();
  const markdown = useMemo(() => exportMarkdown(room), [room]);
  const totals = room.shields.totals ?? {};
  const ranked = rankTopics(topics, totals)
    .filter((t) => (totals[t.id] ?? 0) > 0)
    .slice(0, 5);
  const [copied, setCopied] = useState(false);
  const people = room.participants.filter((p) => p.role !== "viewer").length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "retro"}-${room.code}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="phase wrapup">
      <PhaseIntro
        title="That's a wrap!"
        aside={
          <div className="export-buttons">
            <button className="btn primary" onClick={copy}>
              {copied ? "Copied!" : "Copy markdown"}
            </button>
            <button className="btn" onClick={download}>
              Download .md
            </button>
          </div>
        }
      >
        {people} people · {room.cards.length} cards · {topics.length} topics · {room.actions.length} actions
        {room.battle?.score && (
          <>
            {" "}
            · Battle grade {room.battle.score.grade} ({room.battle.score.score}/100)
          </>
        )}
      </PhaseIntro>
      <div className="wrapup-grid">
        <section className="panel">
          <h3>Actions</h3>
          <ActionList actions={room.actions} />
        </section>
        <section className="panel">
          <h3>Top topics</h3>
          <ol className="top-topics">
            {ranked.map((t) => {
              const votes = room.shields.totals?.[t.id] ?? 0;
              return (
                <li key={t.id}>
                  <span>{t.title}</span>
                  <span className="muted">
                    {" "}
                    · {votes} {votes === 1 ? "vote" : "votes"}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="panel export-preview">
          <h3>Export preview</h3>
          <pre aria-label="Markdown export">{markdown}</pre>
        </section>
      </div>
    </div>
  );
}
