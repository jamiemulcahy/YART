import { useState } from "react";
import type { FormEvent } from "react";
import { LIMITS } from "@yart/shared";
import type { Card, Lane } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { CardText, HiddenCardText, LaneHeader, PhaseIntro } from "../components/common";

export function WritePhase() {
  const { room, isViewer } = useRoom();
  const hidden = room.settings.hideCards && !room.revealed;
  const mine = room.cards.filter((c) => c.mine).length;

  return (
    <div className="phase write">
      <PhaseIntro
        title="Write your thoughts"
        aside={!isViewer && <span className="stat">You've written {mine}</span>}
      >
        One idea per card.{" "}
        {hidden
          ? "Nobody can read your cards until the facilitator reveals them."
          : "Everyone can see cards as they're added."}{" "}
        {!isViewer && "Press Enter to add, Shift+Enter for a new line."}
      </PhaseIntro>
      <div className="lanes">
        {room.lanes.map((lane) => (
          <WriteLane key={lane.id} lane={lane} cards={room.cards.filter((c) => c.laneId === lane.id)} />
        ))}
      </div>
    </div>
  );
}

export function WriteLane(props: { lane: Lane; cards: Card[] }) {
  const { lane } = props;
  const { isViewer } = useRoom();
  const cards = [...props.cards].sort((a, b) => a.createdAt - b.createdAt);
  return (
    <section className="lane" aria-label={lane.title}>
      <LaneHeader lane={lane} count={cards.length} />
      {!isViewer && <AddCard lane={lane} />}
      <ul className="card-list">
        {cards.map((card) => (
          <li key={card.id}>
            <WriteCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddCard(props: { lane: Lane }) {
  const { send } = useRoom();
  const [text, setText] = useState("");
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    send({ t: "card.add", laneId: props.lane.id, text: value });
    setText("");
  };
  return (
    <form className="add-card" onSubmit={submit}>
      <textarea
        aria-label={`New card in ${props.lane.title}`}
        placeholder={props.lane.description || `Add to ${props.lane.title}…`}
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
        {text.length > LIMITS.cardText * 0.8 && (
          <span className="muted">
            {text.length}/{LIMITS.cardText}
          </span>
        )}
        <button className="btn small" type="submit" disabled={!text.trim()}>
          Add
        </button>
      </div>
    </form>
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
        <div className="card-actions">
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
