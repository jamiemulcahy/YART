import { useState } from "react";
import type { FormEvent } from "react";
import { LIMITS, rankTopics } from "@yart/shared";
import type { ActionItem, Topic } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { laneVar } from "../lib/style";
import { CardText, PhaseIntro } from "../components/common";

export function DiscussPhase() {
  const { room, topics, isOwner, send } = useRoom();
  const ranked = rankTopics(topics, room.shields.totals ?? {});
  const open = ranked.find((t) => t.id === room.discuss.openTopicId) ?? null;
  const openIndex = open ? ranked.indexOf(open) : -1;
  const nextTopic = ranked[openIndex + 1];

  return (
    <div className="phase discuss">
      <PhaseIntro
        title="Discuss"
        aside={
          isOwner &&
          nextTopic && (
            <button className="btn primary" onClick={() => send({ t: "topic.open", topicId: nextTopic.id })}>
              {open ? "Next topic →" : "Open top topic →"}
            </button>
          )
        }
      >
        {isOwner
          ? "Open topics in order. Everyone sees the topic you open and can add notes and actions."
          : "The facilitator opens each topic for everyone. Add notes and actions as you talk."}
      </PhaseIntro>
      <div className="discuss-layout">
        <nav className="topic-rank" aria-label="Topics by shields">
          <ol>
            {ranked.map((t, i) => {
              const shields = room.shields.totals?.[t.id] ?? 0;
              const fate = room.battle?.fates[t.id];
              const discussed = room.discuss.discussed.includes(t.id);
              const notes = room.notes.filter((n) => n.topicId === t.id).length;
              const content = (
                <>
                  <span className="rank">{i + 1}</span>
                  <span className="rank-title">{t.title}</span>
                  <span className="rank-meta">
                    🛡 {shields}
                    {fate === "fell" && <span title="Fell in battle"> 💥</span>}
                    {fate === "survived" && <span title="Survived the battle"> ⭐</span>}
                    {notes > 0 && <span title={`${notes} notes`}> 📝{notes}</span>}
                    {discussed && <span title="Discussed"> ✅</span>}
                  </span>
                </>
              );
              return (
                <li
                  key={t.id}
                  className={`${t.id === open?.id ? "open" : ""} ${discussed ? "discussed" : ""}`}
                >
                  {isOwner ? (
                    <button
                      className="rank-row"
                      onClick={() => send({ t: "topic.open", topicId: t.id })}
                      aria-current={t.id === open?.id ? "true" : undefined}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="rank-row" aria-current={t.id === open?.id ? "true" : undefined}>
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <section className="topic-detail" aria-live="polite">
          {open ? (
            <OpenTopic topic={open} rank={openIndex + 1} />
          ) : (
            <div className="empty-state">
              <p>
                {isOwner
                  ? "Pick a topic on the left, or open the top one."
                  : "Waiting for the facilitator to open a topic…"}
              </p>
            </div>
          )}
          <GeneralActions />
        </section>
      </div>
    </div>
  );
}

function OpenTopic(props: { topic: Topic; rank: number }) {
  const { topic } = props;
  const { room, isOwner, isViewer, send } = useRoom();
  const lanes = new Map(room.lanes.map((l) => [l.id, l]));
  const notes = room.notes.filter((n) => n.topicId === topic.id).sort((a, b) => a.createdAt - b.createdAt);
  const actions = room.actions.filter((a) => a.topicId === topic.id);
  const discussed = room.discuss.discussed.includes(topic.id);
  const shields = room.shields.totals?.[topic.id] ?? 0;

  return (
    <article className="open-topic" aria-label={`Open topic: ${topic.title}`}>
      <header className="open-topic-head">
        <span className="rank big">#{props.rank}</span>
        <h3>{topic.title}</h3>
        <span className="shield-total">🛡 {shields}</span>
        {isOwner && (
          <button
            className={`btn small ${discussed ? "" : "ghost"}`}
            onClick={() => send({ t: "topic.discussed", topicId: topic.id, value: !discussed })}
            aria-pressed={discussed}
          >
            {discussed ? "✅ Discussed" : "Mark discussed"}
          </button>
        )}
      </header>
      <ul className="open-cards">
        {topic.cards.map((c) => {
          const lane = lanes.get(c.laneId);
          return (
            <li key={c.id} className="card" style={laneVar(lane?.colour)}>
              <span className="lane-tag" style={{ color: lane?.colour }}>
                {lane?.title}
              </span>
              <CardText text={c.text ?? ""} />
            </li>
          );
        })}
      </ul>

      <div className="notes-actions">
        <section aria-label="Notes">
          <h4>Notes</h4>
          {notes.length === 0 && <p className="muted">No notes yet.</p>}
          <ul className="notes">
            {notes.map((n) => (
              <li key={n.id} className="note">
                <CardText text={n.text} />
                {(n.mine || isOwner) && (
                  <button
                    className="icon-btn"
                    aria-label="Delete note"
                    onClick={() => send({ t: "note.remove", id: n.id })}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!isViewer && (
            <AddLine
              label="Add a note"
              placeholder="What was said…"
              max={LIMITS.noteText}
              onAdd={(text) => send({ t: "note.add", topicId: topic.id, text })}
            />
          )}
        </section>
        <section aria-label="Actions for this topic">
          <h4>Actions</h4>
          <ActionList actions={actions} />
          {!isViewer && <AddAction topicId={topic.id} />}
        </section>
      </div>
    </article>
  );
}

function GeneralActions() {
  const { room, isViewer } = useRoom();
  const actions = room.actions.filter((a) => a.topicId === null);
  return (
    <details className="general-actions">
      <summary>Other actions ({actions.length})</summary>
      <ActionList actions={actions} />
      {!isViewer && <AddAction topicId={null} />}
    </details>
  );
}

export function ActionList(props: { actions: ActionItem[] }) {
  const { isOwner, send } = useRoom();
  if (props.actions.length === 0) return <p className="muted">No actions yet.</p>;
  return (
    <ul className="actions">
      {props.actions.map((a) => (
        <li key={a.id} className="action">
          <span className="action-check" aria-hidden="true">
            ☐
          </span>
          <span className="action-text">{a.text}</span>
          {a.assignee && <span className="assignee">→ {a.assignee}</span>}
          {(a.mine || isOwner) && (
            <button
              className="icon-btn"
              aria-label="Delete action"
              onClick={() => send({ t: "action.remove", id: a.id })}
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function AddAction(props: { topicId: string | null }) {
  const { send } = useRoom();
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    send({ t: "action.add", topicId: props.topicId, text: text.trim(), assignee: assignee.trim() });
    setText("");
    setAssignee("");
  };
  return (
    <form className="add-line action-form" onSubmit={submit}>
      <input
        aria-label="New action"
        placeholder="Action to take…"
        value={text}
        maxLength={LIMITS.actionText}
        onChange={(e) => setText(e.target.value)}
      />
      <input
        aria-label="Who owns it (optional)"
        placeholder="Who? (optional)"
        value={assignee}
        maxLength={LIMITS.actionAssignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="assignee-input"
      />
      <button className="btn small" type="submit" disabled={!text.trim()}>
        Add action
      </button>
    </form>
  );
}

function AddLine(props: { label: string; placeholder: string; max: number; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    props.onAdd(text.trim());
    setText("");
  };
  return (
    <form className="add-line" onSubmit={submit}>
      <input
        aria-label={props.label}
        placeholder={props.placeholder}
        value={text}
        maxLength={props.max}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn small" type="submit" disabled={!text.trim()}>
        Add
      </button>
    </form>
  );
}
