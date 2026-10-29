import { LIMITS } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { InlineEdit } from "./InlineEdit";

export function Participants(props: { onClose: () => void }) {
  const { room, me, send } = useRoom();
  const people = [...room.participants].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)
  );
  const viewers = people.filter((p) => p.role === "viewer" && p.online);
  const members = people.filter((p) => p.role !== "viewer");

  return (
    <aside className="people-panel" id="people-panel" aria-label="People in this room">
      <div className="people-head">
        <h2>People</h2>
        <button className="icon-btn" onClick={props.onClose} aria-label="Close people panel">
          ✕
        </button>
      </div>
      <div className="me-row">
        <span className="dot" style={{ background: me.colour }} aria-hidden="true" />
        <InlineEdit
          label="Your name"
          value={me.name}
          maxLength={LIMITS.participantName}
          onSave={(name) => send({ t: "rename", name })}
        />
        <span className="you">(you)</span>
      </div>
      <ul className="people-list">
        {members
          .filter((p) => p.id !== me.id)
          .map((p) => (
            <li key={p.id} className={p.online ? "online" : "offline"}>
              <span className="dot" style={{ background: p.colour }} aria-hidden="true" />
              <span>{p.name}</span>
              {p.role === "owner" && <span className="badge">owner</span>}
              {!p.online && <span className="muted">away</span>}
            </li>
          ))}
      </ul>
      {viewers.length > 0 && <p className="muted">{viewers.length} viewer screen(s) watching</p>}
    </aside>
  );
}
