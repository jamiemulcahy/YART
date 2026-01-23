import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRoom } from "../contexts/RoomContext";
import type { Card, CardGroup } from "../types";

interface DroppableCardProps {
  card: Card;
  isOver: boolean;
}

function DroppableCard({ card, isOver }: DroppableCardProps) {
  const { setNodeRef: setDropRef } = useDroppable({
    id: `drop-${card.id}`,
    data: { type: "card", cardId: card.id, columnId: card.columnId },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: card.id,
    data: { type: "card", card },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={(node) => {
        setDropRef(node);
        setDragRef(node);
      }}
      style={style}
      className={`group-card draggable ${isOver ? "drop-target" : ""}`}
      {...listeners}
      {...attributes}
    >
      <div className="group-card-content">{card.content}</div>
      <div className="group-card-author">- {card.authorName}</div>
    </div>
  );
}

function CardOverlay({ card }: { card: Card }) {
  return (
    <div className="group-card dragging">
      <div className="group-card-content">{card.content}</div>
      <div className="group-card-author">- {card.authorName}</div>
    </div>
  );
}

interface GroupStackProps {
  group: CardGroup;
  cards: Card[];
  onUngroup: (cardId: string) => void;
  isOver: boolean;
}

function GroupStack({ group, cards, onUngroup, isOver }: GroupStackProps) {
  const groupCards = group.cardIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);

  const { setNodeRef } = useDroppable({
    id: `group-${group.id}`,
    data: { type: "group", groupId: group.id },
  });

  if (groupCards.length === 0) return null;

  return (
    <div
      ref={setNodeRef}
      className={`group-stack ${isOver ? "drop-target" : ""}`}
    >
      <div className="group-stack-header">
        <span className="group-stack-count">{groupCards.length} cards</span>
      </div>
      <div className="group-stack-cards">
        {groupCards.map((card) => (
          <div key={card.id} className="grouped-card">
            <div className="grouped-card-content">{card.content}</div>
            <button
              className="ungroup-btn"
              onClick={() => onUngroup(card.id)}
              aria-label={`Remove ${card.content} from group`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroupMode() {
  const { room, cards, groups, groupCards, ungroupCard } = useRoom();
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [overDropId, setOverDropId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  if (!room) return null;

  const sortedColumns = [...room.columns].sort((a, b) => a.order - b.order);

  // Get ungrouped cards (cards not in any group)
  const ungroupedCards = cards.filter((card) => !card.groupId);

  const handleDragStart = (event: DragStartEvent) => {
    const card = event.active.data.current?.card as Card | undefined;
    if (card) {
      setActiveCard(card);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Only show drop target if hovering over same column
    const draggedCard = event.active.data.current?.card as Card | undefined;
    const overData = event.over?.data.current as
      | { columnId?: string; type?: string }
      | undefined;

    if (!draggedCard || !event.over) {
      setOverDropId(null);
      return;
    }

    // For cards, check column match
    if (
      overData?.type === "card" &&
      overData?.columnId !== draggedCard.columnId
    ) {
      setOverDropId(null);
      return;
    }

    // For groups, check column match
    if (overData?.type === "group") {
      const groupId = event.over.id.toString().replace("group-", "");
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        const firstCardInGroup = cards.find((c) => c.id === group.cardIds[0]);
        if (
          firstCardInGroup &&
          firstCardInGroup.columnId !== draggedCard.columnId
        ) {
          setOverDropId(null);
          return;
        }
      }
    }

    setOverDropId(event.over?.id?.toString() || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    setOverDropId(null);

    if (!over) return;

    const draggedCardId = active.id as string;
    const draggedCard = cards.find((c) => c.id === draggedCardId);
    const overData = over.data.current;

    if (!overData || !draggedCard) return;

    // Dropping on another card
    if (overData.type === "card") {
      const targetCardId = overData.cardId as string;
      if (draggedCardId !== targetCardId) {
        const targetCard = cards.find((c) => c.id === targetCardId);

        // Only allow grouping cards from the same column
        if (!targetCard || targetCard.columnId !== draggedCard.columnId) {
          return;
        }

        if (targetCard.groupId) {
          // Add to existing group
          const group = groups.find((g) => g.id === targetCard.groupId);
          if (group) {
            groupCards([...group.cardIds, draggedCardId]);
          }
        } else {
          // Create new group with both cards
          groupCards([targetCardId, draggedCardId]);
        }
      }
    }

    // Dropping on an existing group
    if (overData.type === "group") {
      const groupId = overData.groupId as string;
      const group = groups.find((g) => g.id === groupId);
      if (group && !group.cardIds.includes(draggedCardId)) {
        // Get the column of cards in this group
        const firstCardInGroup = cards.find((c) => c.id === group.cardIds[0]);
        // Only allow adding to group if from the same column
        if (
          firstCardInGroup &&
          firstCardInGroup.columnId === draggedCard.columnId
        ) {
          groupCards([...group.cardIds, draggedCardId]);
        }
      }
    }
  };

  // Get groups for a specific column
  const getColumnGroups = (columnId: string): CardGroup[] => {
    return groups.filter((group) => {
      const firstCard = cards.find((c) => c.id === group.cardIds[0]);
      return firstCard?.columnId === columnId;
    });
  };

  // Count total items (ungrouped cards + groups) for a column
  const getColumnItemCount = (columnId: string): number => {
    const columnUngroupedCards = ungroupedCards.filter(
      (card) => card.columnId === columnId
    );
    const columnGroups = getColumnGroups(columnId);
    return columnUngroupedCards.length + columnGroups.length;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="group-mode">
        <div className="group-mode-header">
          <p>
            Drag cards onto each other to group related items within each
            column.
          </p>
        </div>

        {/* Cards and groups by column */}
        <div className="columns-container">
          {sortedColumns.length === 0 ? (
            <div className="no-columns">
              <p>No columns have been configured.</p>
            </div>
          ) : (
            sortedColumns.map((column) => {
              const columnCards = ungroupedCards.filter(
                (card) => card.columnId === column.id
              );
              const columnGroups = getColumnGroups(column.id);
              const itemCount = getColumnItemCount(column.id);

              return (
                <div key={column.id} className="column">
                  <div className="column-header">
                    <h3>{column.name}</h3>
                    <span className="card-count">{itemCount}</span>
                  </div>
                  <div className="column-cards">
                    {itemCount === 0 ? (
                      <p className="no-cards">No cards</p>
                    ) : (
                      <>
                        {/* Groups in this column */}
                        {columnGroups.map((group) => (
                          <GroupStack
                            key={group.id}
                            group={group}
                            cards={cards}
                            onUngroup={ungroupCard}
                            isOver={overDropId === `group-${group.id}`}
                          />
                        ))}
                        {/* Ungrouped cards in this column */}
                        {columnCards.map((card) => (
                          <DroppableCard
                            key={card.id}
                            card={card}
                            isOver={overDropId === `drop-${card.id}`}
                          />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <DragOverlay>
        {activeCard && <CardOverlay card={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}
