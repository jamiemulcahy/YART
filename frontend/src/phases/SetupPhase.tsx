import { LANE_TEMPLATES, LIMITS } from "@yart/shared";
import type { Lane } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { InlineEdit } from "../components/InlineEdit";
import { LaneHeader, PhaseIntro } from "../components/common";

type LaneInput = { id?: string; title: string; description: string };

export function SetupPhase() {
  const { room, isOwner } = useRoom();
  const people = room.participants.filter((p) => p.online && p.role !== "viewer");

  return (
    <div className="phase setup">
      {isOwner ? (
        <PhaseIntro title="Set up your lanes">
          Pick the lanes people will write into, then share the invite link. Press{" "}
          <strong>Next: Write</strong> when everyone's here.
        </PhaseIntro>
      ) : (
        <PhaseIntro title="Waiting for the facilitator">
          You're in! The retro starts when the facilitator moves to <strong>Write</strong>.
        </PhaseIntro>
      )}
      {isOwner ? <LaneEditor /> : <LanePreview lanes={room.lanes} />}
      <section className="lobby" aria-label="Who's here">
        <h3>Who's here ({people.length})</h3>
        <ul className="lobby-list">
          {people.map((p) => (
            <li key={p.id} style={{ borderColor: p.colour }}>
              <span className="dot" style={{ background: p.colour }} aria-hidden="true" />
              {p.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function LanePreview(props: { lanes: Lane[] }) {
  if (props.lanes.length === 0) return <p className="muted">No lanes yet.</p>;
  return (
    <div className="lanes preview">
      {props.lanes.map((lane) => (
        <section key={lane.id} className="lane">
          <LaneHeader lane={lane} />
        </section>
      ))}
    </div>
  );
}

function LaneEditor() {
  const { room, send } = useRoom();
  const lanes = room.lanes;
  const toInput = (l: Lane): LaneInput => ({ id: l.id, title: l.title, description: l.description });
  const save = (next: LaneInput[]) => send({ t: "lanes.set", lanes: next });

  const update = (index: number, patch: Partial<LaneInput>) =>
    save(lanes.map((l, i) => (i === index ? { ...toInput(l), ...patch } : toInput(l))));
  const move = (index: number, delta: number) => {
    const next = lanes.map(toInput);
    const [lane] = next.splice(index, 1);
    if (lane) next.splice(index + delta, 0, lane);
    save(next);
  };

  return (
    <section className="lane-editor" aria-label="Lanes">
      <div className="template-row">
        <span className="muted">Quick start:</span>
        {LANE_TEMPLATES.filter((t) => t.lanes.length > 0).map((t) => (
          <button key={t.id} className="chip" onClick={() => save(t.lanes)}>
            {t.name}
          </button>
        ))}
      </div>
      <ol className="lane-edit-list">
        {lanes.map((lane, i) => (
          <li key={lane.id} className="lane-edit" style={{ borderColor: lane.colour }}>
            <span className="lane-swatch" style={{ background: lane.colour }} aria-hidden="true" />
            <div className="lane-edit-fields">
              <InlineEdit
                label={`Lane ${i + 1} title`}
                value={lane.title}
                maxLength={LIMITS.laneTitle}
                className="lane-edit-title"
                onSave={(title) => update(i, { title })}
              />
              <InlineEdit
                label={`Lane ${i + 1} description`}
                value={lane.description}
                placeholder="Add a short prompt (optional)"
                maxLength={LIMITS.laneDescription}
                allowEmpty
                className="lane-edit-desc"
                onSave={(description) => update(i, { description })}
              />
            </div>
            <div className="lane-edit-actions">
              <button
                className="icon-btn"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move ${lane.title} up`}
              >
                ↑
              </button>
              <button
                className="icon-btn"
                disabled={i === lanes.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${lane.title} down`}
              >
                ↓
              </button>
              <button
                className="icon-btn"
                onClick={() => save(lanes.filter((_, j) => j !== i).map(toInput))}
                aria-label={`Remove ${lane.title}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>
      {lanes.length < LIMITS.lanes && (
        <button
          className="btn"
          onClick={() =>
            save([...lanes.map(toInput), { title: `Lane ${lanes.length + 1}`, description: "" }])
          }
        >
          + Add lane
        </button>
      )}
    </section>
  );
}
