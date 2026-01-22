import { useState, type FormEvent } from "react";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { Card } from "../types";

interface FocusCardProps {
  card: Card;
  columnName: string;
}

function FocusCard({ card, columnName }: FocusCardProps) {
  return (
    <div className="focus-card">
      <div className="focus-card-column">{columnName}</div>
      <div className="focus-card-content">{card.content}</div>
      <div className="focus-card-meta">
        <span className="focus-card-author">- {card.authorName}</span>
        <span className="focus-card-votes">{card.votes} votes</span>
      </div>
    </div>
  );
}

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
      />
      <button type="submit" disabled={!content.trim()}>
        Add
      </button>
    </form>
  );
}

export function FocusMode() {
  const { room, cards, focusedCardId, setFocus, addAction } = useRoom();
  const { user } = useUser();

  if (!room) return null;

  // Sort cards by votes (descending) for discussion
  const sortedCards = [...cards].sort((a, b) => b.votes - a.votes);
  const currentIndex = focusedCardId
    ? sortedCards.findIndex((c) => c.id === focusedCardId)
    : 0;

  // Get column name for a card
  const getColumnName = (columnId: string): string => {
    const column = room.columns.find((c) => c.id === columnId);
    return column?.name || "Unknown";
  };

  const isOwner = user?.isOwner ?? false;

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setFocus(sortedCards[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (currentIndex < sortedCards.length - 1) {
      setFocus(sortedCards[currentIndex + 1].id);
    }
  };

  const handleAddAction = (content: string) => {
    if (focusedCardId) {
      addAction(focusedCardId, content);
    }
  };

  // No cards to discuss
  if (sortedCards.length === 0) {
    return (
      <div className="focus-mode">
        <div className="focus-empty">
          <h2>No Cards to Discuss</h2>
          <p>There are no cards to review.</p>
        </div>
      </div>
    );
  }

  // If no card is focused, show the first one (or prompt owner to start)
  const currentCard =
    currentIndex >= 0 ? sortedCards[currentIndex] : sortedCards[0];

  if (!currentCard) return null;

  return (
    <div className="focus-mode">
      <div className="focus-header">
        <div className="focus-progress">
          Card {currentIndex + 1} of {sortedCards.length}
        </div>
      </div>

      <div className="focus-main">
        <FocusCard
          card={currentCard}
          columnName={getColumnName(currentCard.columnId)}
        />

        <div className="focus-actions-section">
          <h3>Action Items</h3>
          {currentCard.actionItems.length === 0 ? (
            <p className="no-actions">No action items yet.</p>
          ) : (
            <ul className="action-items-list">
              {currentCard.actionItems.map((action) => (
                <li key={action.id}>{action.content}</li>
              ))}
            </ul>
          )}

          {isOwner && <ActionItemForm onAdd={handleAddAction} />}
        </div>
      </div>

      {isOwner && (
        <div className="focus-nav">
          <button
            onClick={handlePrevious}
            disabled={currentIndex <= 0}
            className="focus-nav-btn"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex >= sortedCards.length - 1}
            className="focus-nav-btn"
          >
            Next
          </button>
        </div>
      )}

      {!isOwner && (
        <div className="focus-waiting">
          <p>The facilitator is controlling the discussion.</p>
        </div>
      )}
    </div>
  );
}
