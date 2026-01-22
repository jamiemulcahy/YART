import { useState, type FormEvent } from "react";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { Card, CardGroup } from "../types";

interface ActionItemFormProps {
  onAdd: (content: string) => void;
}

function ActionItemForm({ onAdd }: ActionItemFormProps) {
  const [content, setContent] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      onAdd(content.trim());
      setContent("");
    }
  };

  return (
    <form className="action-item-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add an action item..."
        aria-label="Action item content"
      />
      <button type="submit" disabled={!content.trim()}>
        Add
      </button>
    </form>
  );
}

interface FocusCardModalProps {
  card: Card;
  groupCards?: Card[];
  columnName: string;
  totalVotes: number;
  isOwner: boolean;
  onClose: () => void;
  onAddAction: (content: string) => void;
}

function FocusCardModal({
  card,
  groupCards,
  columnName,
  totalVotes,
  isOwner,
  onClose,
  onAddAction,
}: FocusCardModalProps) {
  const isGrouped = groupCards && groupCards.length > 1;

  return (
    <div className="focus-modal-overlay" role="dialog" aria-modal="true">
      <div className="focus-modal">
        <div className="focus-modal-header">
          <span className="focus-modal-column">{columnName}</span>
          {isOwner && (
            <button
              className="focus-modal-close"
              onClick={onClose}
              aria-label="Close discussion"
            >
              Close
            </button>
          )}
        </div>

        <div className="focus-modal-content">
          {isGrouped ? (
            <div className="focus-modal-group">
              <div className="focus-modal-group-header">
                <span className="focus-modal-group-count">
                  {groupCards.length} cards grouped
                </span>
                <span className="focus-modal-votes">{totalVotes} votes</span>
              </div>
              <div className="focus-modal-group-cards">
                {groupCards.map((groupCard) => (
                  <div key={groupCard.id} className="focus-modal-group-card">
                    <p className="focus-modal-card-text">{groupCard.content}</p>
                    <span className="focus-modal-card-author">
                      - {groupCard.authorName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="focus-modal-single">
              <p className="focus-modal-card-text">{card.content}</p>
              <div className="focus-modal-meta">
                <span className="focus-modal-card-author">
                  - {card.authorName}
                </span>
                <span className="focus-modal-votes">{totalVotes} votes</span>
              </div>
            </div>
          )}
        </div>

        <div className="focus-modal-actions">
          <h3>Action Items</h3>
          {card.actionItems.length === 0 ? (
            <p className="no-actions">No action items yet.</p>
          ) : (
            <ul className="action-items-list">
              {card.actionItems.map((action) => (
                <li key={action.id}>{action.content}</li>
              ))}
            </ul>
          )}
          {isOwner && <ActionItemForm onAdd={onAddAction} />}
        </div>
      </div>
    </div>
  );
}

interface FocusItemProps {
  card: Card;
  groupCards?: Card[];
  totalVotes: number;
  isOwner: boolean;
  onClick: () => void;
}

function FocusItem({
  card,
  groupCards,
  totalVotes,
  isOwner,
  onClick,
}: FocusItemProps) {
  const isGrouped = groupCards && groupCards.length > 1;

  return (
    <div
      className={`focus-item ${isOwner ? "clickable" : ""}`}
      onClick={isOwner ? onClick : undefined}
      role={isOwner ? "button" : undefined}
      tabIndex={isOwner ? 0 : undefined}
      onKeyDown={
        isOwner
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={
        isOwner
          ? `Discuss ${isGrouped ? "group of " + groupCards.length + " cards" : "card"}: ${card.content}`
          : undefined
      }
    >
      {isGrouped ? (
        <div className="focus-item-group">
          <div className="focus-item-group-header">
            <span className="focus-item-group-count">
              {groupCards.length} cards
            </span>
          </div>
          <div className="focus-item-group-preview">
            {groupCards.slice(0, 2).map((groupCard) => (
              <p key={groupCard.id} className="focus-item-preview-text">
                {groupCard.content}
              </p>
            ))}
            {groupCards.length > 2 && (
              <p className="focus-item-more">
                +{groupCards.length - 2} more...
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="focus-item-single">
          <p className="focus-item-content">{card.content}</p>
          <span className="focus-item-author">- {card.authorName}</span>
        </div>
      )}
      <div className="focus-item-votes">{totalVotes}</div>
    </div>
  );
}

// Helper to get total votes for a group
function getGroupVotes(group: CardGroup, cards: Card[]): number {
  return group.cardIds.reduce((sum, cardId) => {
    const card = cards.find((c) => c.id === cardId);
    return sum + (card?.votes ?? 0);
  }, 0);
}

// Helper to get cards in a group
function getGroupCards(group: CardGroup, cards: Card[]): Card[] {
  return group.cardIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);
}

// Item can be either an ungrouped card or a group
interface FocusableItem {
  type: "card" | "group";
  card: Card; // Primary card (for ungrouped) or first card in group
  group?: CardGroup;
  groupCards?: Card[];
  votes: number;
}

export function FocusMode() {
  const { room, cards, groups, focusedCardId, setFocus, addAction } = useRoom();
  const { ownerKey } = useUser();

  if (!room) return null;

  const isOwner = !!ownerKey;
  const sortedColumns = [...room.columns].sort((a, b) => a.order - b.order);

  const getColumnName = (columnId: string): string => {
    const column = room.columns.find((c) => c.id === columnId);
    return column?.name || "Unknown";
  };

  // Get ungrouped cards (cards not in any group)
  const ungroupedCards = cards.filter((card) => !card.groupId);

  // Get groups for a specific column
  const getColumnGroups = (columnId: string): CardGroup[] => {
    return groups.filter((group) => {
      const firstCard = cards.find((c) => c.id === group.cardIds[0]);
      return firstCard?.columnId === columnId;
    });
  };

  // Build focusable items for a column, sorted by votes
  const getColumnItems = (columnId: string): FocusableItem[] => {
    const items: FocusableItem[] = [];

    // Add ungrouped cards
    ungroupedCards
      .filter((card) => card.columnId === columnId)
      .forEach((card) => {
        items.push({
          type: "card",
          card,
          votes: card.votes,
        });
      });

    // Add groups
    getColumnGroups(columnId).forEach((group) => {
      const groupCardsList = getGroupCards(group, cards);
      const totalVotes = getGroupVotes(group, cards);
      if (groupCardsList.length > 0) {
        items.push({
          type: "group",
          card: groupCardsList[0],
          group,
          groupCards: groupCardsList,
          votes: totalVotes,
        });
      }
    });

    // Sort by votes descending
    return items.sort((a, b) => b.votes - a.votes);
  };

  const handleItemClick = (item: FocusableItem) => {
    setFocus(item.card.id);
  };

  const handleClose = () => {
    setFocus(null);
  };

  const handleAddAction = (content: string) => {
    if (focusedCardId) {
      addAction(focusedCardId, content);
    }
  };

  // Find the focused item
  const getFocusedItem = (): FocusableItem | null => {
    if (!focusedCardId) return null;

    const focusedCard = cards.find((c) => c.id === focusedCardId);
    if (!focusedCard) return null;

    // Check if card is in a group
    if (focusedCard.groupId) {
      const group = groups.find((g) => g.id === focusedCard.groupId);
      if (group) {
        const groupCardsList = getGroupCards(group, cards);
        return {
          type: "group",
          card: focusedCard,
          group,
          groupCards: groupCardsList,
          votes: getGroupVotes(group, cards),
        };
      }
    }

    return {
      type: "card",
      card: focusedCard,
      votes: focusedCard.votes,
    };
  };

  const focusedItem = getFocusedItem();

  // No cards to discuss
  if (cards.length === 0) {
    return (
      <div className="focus-mode">
        <div className="focus-empty">
          <h2>No Cards to Discuss</h2>
          <p>There are no cards to review.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="focus-mode focus-column-view">
      <div className="focus-mode-header">
        <p>
          {isOwner
            ? "Click on a card or group to start discussing it."
            : "The facilitator will select cards to discuss."}
        </p>
      </div>

      <div className="columns-container">
        {sortedColumns.length === 0 ? (
          <div className="no-columns">
            <p>No columns have been configured.</p>
          </div>
        ) : (
          sortedColumns.map((column) => {
            const columnItems = getColumnItems(column.id);

            return (
              <div key={column.id} className="column">
                <div className="column-header">
                  <h3>{column.name}</h3>
                  <span className="card-count">{columnItems.length}</span>
                </div>
                <div className="column-cards">
                  {columnItems.length === 0 ? (
                    <p className="no-cards">No cards</p>
                  ) : (
                    columnItems.map((item) => (
                      <FocusItem
                        key={
                          item.type === "group"
                            ? `group-${item.group?.id}`
                            : item.card.id
                        }
                        card={item.card}
                        groupCards={item.groupCards}
                        totalVotes={item.votes}
                        isOwner={isOwner}
                        onClick={() => handleItemClick(item)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {focusedItem && (
        <FocusCardModal
          card={focusedItem.card}
          groupCards={focusedItem.groupCards}
          columnName={getColumnName(focusedItem.card.columnId)}
          totalVotes={focusedItem.votes}
          isOwner={isOwner}
          onClose={handleClose}
          onAddAction={handleAddAction}
        />
      )}
    </div>
  );
}
