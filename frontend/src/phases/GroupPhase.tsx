// dnd-kit's hook results carry ref setters, which the React Compiler lint rule misreads as ref reads.
/* eslint-disable react-hooks/refs */
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { LIMITS, truncate } from "@yart/shared";
import type { Card, Lane, Topic } from "@yart/shared";
import { useRoom } from "../room/RoomContext";
import { laneVar } from "../lib/style";
import { CardText, LaneHeader, PhaseIntro } from "../components/common";
import { InlineEdit } from "../components/InlineEdit";
import { CardAuthor } from "../components/CardAuthor";
import { WriteLane } from "./WritePhase";

// Drag/drop ids: "card:<id>", "group:<id>", "lane:<id>"
type DropKind = "card" | "group" | "lane";
function parseId(id: string | number): { kind: DropKind; id: string } {
  const [kind, ...rest] = String(id).split(":");
  return { kind: kind as DropKind, id: rest.join(":") };
}

export function GroupPhase() {
  const { room, topics, send, isViewer, me } = useRoom();
  const [dragging, setDragging] = useState<string | null>(null);
  const locked = room.groupingLocked;
  const canDrag = !isViewer && !locked;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = (e: DragStartEvent) => {
    const { kind, id } = parseId(e.active.id);
    if (kind === "card") send({ t: "card.hold", id });
    setDragging(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const from = parseId(e.active.id);
    const to = e.over ? parseId(e.over.id) : null;
    if (from.kind === "card") {
      const card = room.cards.find((c) => c.id === from.id);
      if (!card) return;
      if (!to || to.id === card.id) {
        send({ t: "card.release", id: card.id });
        return;
      }
      if (to.kind === "card") send({ t: "card.move", id: card.id, target: { kind: "card", id: to.id } });
      else if (to.kind === "group") {
        if (card.groupId === to.id) send({ t: "card.release", id: card.id });
        else send({ t: "card.move", id: card.id, target: { kind: "group", id: to.id } });
      } else if (card.groupId) send({ t: "card.move", id: card.id, target: { kind: "none" } });
      else send({ t: "card.release", id: card.id });
    } else if (from.kind === "group" && to && to.id !== from.id) {
      if (to.kind === "card") send({ t: "group.merge", id: from.id, into: { kind: "card", id: to.id } });
      if (to.kind === "group") send({ t: "group.merge", id: from.id, into: { kind: "group", id: to.id } });
    }
  };

  const draggingCard = dragging?.startsWith("card:")
    ? room.cards.find((c) => `card:${c.id}` === dragging)
    : null;
  const draggingGroup = dragging?.startsWith("group:")
    ? topics.find((t) => `group:${t.id}` === dragging)
    : null;
  const grouped = topics.filter((t) => t.kind === "group").length;

  return (
    <div className="phase group">
      <PhaseIntro title="Group similar thoughts" aside={<span className="stat">{grouped} groups</span>}>
        {locked
          ? "Grouping is locked by the facilitator."
          : "Drag a card onto another card to group them, or use the ⋯ menu. Anyone can group, name and split groups."}
      </PhaseIntro>
      {room.settings.allowLateCards && !isViewer && (
        <details className="late-cards">
          <summary>Forgot something? Add a late card</summary>
          <div className="lanes compact">
            {room.lanes.map((lane) => (
              <WriteLane key={lane.id} lane={lane} cards={[]} trayOnly />
            ))}
          </div>
        </details>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          if (draggingCard) send({ t: "card.release", id: draggingCard.id });
          setDragging(null);
        }}
      >
        <div className="lanes">
          {room.lanes.map((lane) => (
            <GroupLane
              key={lane.id}
              lane={lane}
              topics={topics.filter((t) => t.laneId === lane.id)}
              canDrag={canDrag}
              allTopics={topics}
              meId={me.id}
            />
          ))}
        </div>
        <DragOverlay>
          {draggingCard && (
            <div className="card dragging">
              <CardText text={draggingCard.text ?? ""} />
            </div>
          )}
          {draggingGroup && (
            <div className="group-box dragging">
              <strong>{draggingGroup.title}</strong>
              <span className="muted"> · {draggingGroup.cards.length} cards</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function GroupLane(props: {
  lane: Lane;
  topics: Topic[];
  canDrag: boolean;
  allTopics: Topic[];
  meId: string;
}) {
  const { lane, topics } = props;
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane.id}` });
  const count = topics.reduce((n, t) => n + t.cards.length, 0);
  const groups = topics.filter((t) => t.kind === "group");
  const loose = topics.filter((t) => t.kind === "card");
  return (
    <section ref={setNodeRef} className={`lane ${isOver ? "drop-over" : ""}`} aria-label={lane.title}>
      <LaneHeader lane={lane} count={count} />
      {/* Groups span the lane so their cards can sit side by side; loose cards flow below. */}
      {groups.length > 0 && (
        <ul className="group-list">
          {groups.map((topic) => (
            <li key={topic.id}>
              <GroupBox topic={topic} canDrag={props.canDrag} allTopics={props.allTopics} meId={props.meId} />
            </li>
          ))}
        </ul>
      )}
      <ul className="postits">
        {loose.map((topic) => (
          <li key={topic.id}>
            <DraggableCard
              card={topic.cards[0] as Card}
              canDrag={props.canDrag}
              allTopics={props.allTopics}
              meId={props.meId}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function GroupBox(props: { topic: Topic; canDrag: boolean; allTopics: Topic[]; meId: string }) {
  const { topic } = props;
  const { room, send } = useRoom();
  const group = room.groups.find((g) => g.id === topic.id);
  const drop = useDroppable({ id: `group:${topic.id}` });
  const drag = useDraggable({ id: `group:${topic.id}`, disabled: !props.canDrag });
  return (
    <div
      ref={drop.setNodeRef}
      className={`group-box ${drop.isOver ? "drop-over" : ""} ${drag.isDragging ? "is-dragging" : ""}`}
      aria-label={`Group: ${topic.title}`}
      role="group"
    >
      <div className="group-head">
        {props.canDrag && (
          <button
            ref={drag.setNodeRef}
            className="drag-handle"
            aria-label={`Drag group ${topic.title}`}
            {...drag.listeners}
            {...drag.attributes}
          >
            ⠿
          </button>
        )}
        {props.canDrag ? (
          <InlineEdit
            label="Group name"
            value={group?.title ?? ""}
            placeholder={topic.title}
            maxLength={LIMITS.groupTitle}
            allowEmpty
            className="group-title"
            onSave={(title) => send({ t: "group.rename", id: topic.id, title })}
          />
        ) : (
          <strong className="group-title">{topic.title}</strong>
        )}
        <span className="group-count">{topic.cards.length}</span>
        {props.canDrag && (
          <button
            className="btn small ghost"
            onClick={() => send({ t: "group.merge", id: topic.id, into: { kind: "none" } })}
          >
            Ungroup
          </button>
        )}
      </div>
      <ul className="postits group-cards">
        {topic.cards.map((card) => (
          <li key={card.id}>
            <DraggableCard
              card={card}
              canDrag={props.canDrag}
              allTopics={props.allTopics}
              meId={props.meId}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraggableCard(props: { card: Card; canDrag: boolean; allTopics: Topic[]; meId: string }) {
  const { card } = props;
  const { room, send } = useRoom();
  const heldBy = room.holds[card.id];
  const heldByOther = heldBy && heldBy !== props.meId ? room.participants.find((p) => p.id === heldBy) : null;
  const drag = useDraggable({ id: `card:${card.id}`, disabled: !props.canDrag || !!heldByOther });
  const drop = useDroppable({ id: `card:${card.id}` });
  const lane = room.lanes.find((l) => l.id === card.laneId);
  const text = card.text ?? "";

  const targets = props.allTopics.filter((t) => t.id !== card.id && t.id !== card.groupId);

  return (
    <div ref={drop.setNodeRef} className={`card-drop ${drop.isOver && !drag.isDragging ? "drop-over" : ""}`}>
      <article
        ref={drag.setNodeRef}
        className={`card draggable ${card.mine ? "mine" : ""} ${drag.isDragging ? "is-dragging" : ""} ${heldByOther ? "held" : ""}`}
        style={laneVar(lane?.colour)}
        aria-label={text}
        {...(props.canDrag ? drag.listeners : {})}
        {...(props.canDrag ? drag.attributes : {})}
        role="article"
      >
        <CardText text={text} />
        <CardAuthor card={card} />
        {heldByOther && <span className="held-by">{heldByOther.name} is moving this</span>}
        {props.canDrag && (
          <select
            className="card-menu"
            aria-label={`Move card: ${truncate(text, 40)}`}
            value=""
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "none") send({ t: "card.move", id: card.id, target: { kind: "none" } });
              else if (value.startsWith("g:"))
                send({ t: "card.move", id: card.id, target: { kind: "group", id: value.slice(2) } });
              else if (value.startsWith("c:"))
                send({ t: "card.move", id: card.id, target: { kind: "card", id: value.slice(2) } });
            }}
          >
            <option value="" disabled>
              ⋯
            </option>
            {card.groupId && <option value="none">Remove from group</option>}
            <optgroup label="Group with…">
              {targets.map((t) => (
                <option key={t.id} value={t.kind === "group" ? `g:${t.id}` : `c:${t.id}`}>
                  {truncate(t.title, 50)}
                  {t.kind === "group" ? ` (group of ${t.cards.length})` : ""}
                </option>
              ))}
            </optgroup>
          </select>
        )}
      </article>
    </div>
  );
}
