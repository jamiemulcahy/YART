import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LIMITS } from "@yart/shared";
import type { Card, Lane } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { useDrafts } from "../room/drafts";
import type { Draft } from "../room/drafts";
import { laneVar, tilt } from "../lib/style";
import { CardText, HiddenCardText, LaneHeader, PhaseIntro } from "../components/common";

const PUBLISH_TIMEOUT_MS = 6000;
const PUBLISH_GAP_MS = 80;

export function WritePhase() {
  const { room, isViewer } = useRoom();
  const hidden = room.settings.hideCards && !room.revealed;
  const mine = room.cards.filter((c) => c.mine).length;

  return (
    <div className="phase write">
      <PhaseIntro
        title="Write your thoughts"
        aside={!isViewer && <span className="stat">You've published {mine}</span>}
      >
        One idea per card. Drafts in your tray are private until you publish them.{" "}
        {hidden
          ? "Published cards stay face-down until the facilitator reveals them."
          : "Published cards are visible to everyone."}
      </PhaseIntro>
      <div className="lanes write-lanes">
        {room.lanes.map((lane) => (
          <WriteLane key={lane.id} lane={lane} cards={room.cards.filter((c) => c.laneId === lane.id)} />
        ))}
      </div>
    </div>
  );
}

export function WriteLane(props: { lane: Lane; cards: Card[]; trayOnly?: boolean }) {
  const { lane } = props;
  const { isViewer } = useRoom();
  const cards = [...props.cards].sort((a, b) => a.createdAt - b.createdAt);
  return (
    <section className="lane write-lane" aria-label={lane.title} style={laneVar(lane.colour)}>
      <LaneHeader lane={lane} count={props.trayOnly ? undefined : cards.length} />
      {!props.trayOnly && (
        <div className="lane-board">
          <ul className="postits">
            {cards.map((card) => (
              <li key={card.id} style={tilt(card.id)}>
                <WriteCard card={card} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {!isViewer && <DraftTray lane={lane} />}
    </section>
  );
}

function DraftTray(props: { lane: Lane }) {
  const { lane } = props;
  const { room, send } = useRoom();
  const { drafts, canAdd, add, update, remove, markPublishing, clearPublishing } = useDrafts(
    room.code,
    lane.id
  );
  const [text, setText] = useState("");
  const [tick, setTick] = useState(0);

  // A draft is done once our matching card shows up on the board; give up waiting after a while
  // (the server will have explained why in a toast).
  useEffect(() => {
    const now = Date.now();
    const published = room.cards.filter((c) => c.mine && c.laneId === lane.id).map((c) => c.text);
    for (const d of drafts) {
      if (!d.publishingAt) continue;
      const i = published.indexOf(d.text.trim());
      if (i !== -1) {
        published.splice(i, 1);
        remove(d.id);
      } else if (now - d.publishingAt > PUBLISH_TIMEOUT_MS + drafts.length * PUBLISH_GAP_MS) {
        clearPublishing([d.id]);
      }
    }
  }, [room.cards, drafts, lane.id, remove, clearPublishing, tick]);

  const publish = (list: Draft[]) => {
    const ready = list.filter((d) => !d.publishingAt && d.text.trim());
    if (ready.length === 0) return;
    markPublishing(ready.map((d) => d.id));
    // Stagger so "Publish all" stays well inside the server's rate limit.
    ready.forEach((d, i) =>
      setTimeout(() => send({ t: "card.add", laneId: lane.id, text: d.text.trim() }), i * PUBLISH_GAP_MS)
    );
    setTimeout(() => setTick((t) => t + 1), PUBLISH_TIMEOUT_MS + ready.length * PUBLISH_GAP_MS);
  };

  // Everything typed lands in the private tray first; publishing is always a separate step.
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    add(value);
    setText("");
  };

  return (
    <div className="tray" aria-label={`Your drafts in ${lane.title}`}>
      <div className="tray-head">
        <span className="tray-title">🔒 Your drafts</span>
        {drafts.length > 0 && (
          <button className="btn small" onClick={() => publish(drafts)}>
            Publish all ({drafts.length})
          </button>
        )}
      </div>
      {drafts.length > 0 && (
        <ul className="postits drafts">
          {drafts.map((d) => (
            <li key={d.id}>
              <DraftCard
                draft={d}
                laneTitle={lane.title}
                onSave={(t) => update(d.id, t)}
                onDelete={() => remove(d.id)}
                onPublish={() => publish([d])}
              />
            </li>
          ))}
        </ul>
      )}
      <form className="add-card" onSubmit={submit}>
        <textarea
          aria-label={`New card in ${lane.title}`}
          placeholder={canAdd ? lane.description || `Add to ${lane.title}…` : "Draft limit reached"}
          disabled={!canAdd}
          value={text}
          maxLength={LIMITS.cardText}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="add-card-foot">
          <span className="muted hint">Enter to save · Shift+Enter for a new line</span>
          {text.length > LIMITS.cardText * 0.8 && (
            <span className="muted">
              {text.length}/{LIMITS.cardText}
            </span>
          )}
          <button className="btn small" type="submit" disabled={!text.trim()}>
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}

function DraftCard(props: {
  draft: Draft;
  laneTitle: string;
  onSave: (text: string) => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const { draft } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.text);
  const save = () => {
    const value = text.trim();
    if (value) props.onSave(value);
    setEditing(false);
  };
  return (
    <article
      className={`card draft ${draft.publishingAt ? "publishing" : ""}`}
      aria-label={`Draft: ${draft.text}`}
    >
      {editing ? (
        <textarea
          aria-label="Edit draft"
          value={text}
          autoFocus
          maxLength={LIMITS.cardText}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button
          className="draft-text"
          onClick={() => {
            setText(draft.text);
            setEditing(true);
          }}
          title="Click to edit"
        >
          <CardText text={draft.text} />
        </button>
      )}
      <div className="card-actions">
        <button className="btn small" onClick={props.onPublish} disabled={!!draft.publishingAt}>
          {draft.publishingAt ? "Publishing…" : "Publish"}
        </button>
        <button
          className="btn small ghost"
          onClick={props.onDelete}
          aria-label={`Delete draft: ${draft.text}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function WriteCard(props: { card: Card }) {
  const { card } = props;
  const { send, room, isOwner } = useRoom();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text ?? "");
  const canEdit = card.mine && room.phase === "write";
  // Facilitator moderation: remove anyone's card once it's readable.
  const canModerate = isOwner && !card.mine && card.text !== null && room.phase === "write";

  if (editing) {
    const save = () => {
      const value = draft.trim();
      if (value && value !== card.text) send({ t: "card.edit", id: card.id, text: value });
      setEditing(false);
    };
    return (
      <div className="card mine editing">
        <textarea
          aria-label="Edit card"
          value={draft}
          autoFocus
          maxLength={LIMITS.cardText}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <div className="card-actions">
          <button className="btn small" onClick={save}>
            Save
          </button>
          <button className="btn small ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <article className={`card ${card.mine ? "mine" : ""} ${card.text === null ? "face-down" : ""}`}>
      {card.text === null ? <HiddenCardText /> : <CardText text={card.text} />}
      {card.mine && <span className="mine-tag">yours</span>}
      {canEdit && (
        <div className="card-actions">
          <button
            className="btn small ghost"
            onClick={() => {
              setDraft(card.text ?? "");
              setEditing(true);
            }}
          >
            Edit
          </button>
          <button className="btn small ghost" onClick={() => send({ t: "card.remove", id: card.id })}>
            Delete
          </button>
        </div>
      )}
      {canModerate && (
        <div className="card-actions moderate">
          <button
            className="btn small ghost"
            onClick={() => send({ t: "card.remove", id: card.id })}
            aria-label={`Remove card: ${card.text ?? ""}`}
          >
            Remove
          </button>
        </div>
      )}
    </article>
  );
}
