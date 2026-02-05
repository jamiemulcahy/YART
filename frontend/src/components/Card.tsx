import { useState, useRef, useEffect } from "react";
import type { Card as CardType } from "../types";
import { useUser } from "../contexts/UserContext";
import { useRoom } from "../contexts/RoomContext";

interface CardProps {
  card: CardType;
  showAuthor?: boolean;
  showDelete?: boolean;
}

export function Card({
  card,
  showAuthor = true,
  showDelete = true,
}: CardProps) {
  const { user } = useUser();
  const { deleteCard, editCard } = useRoom();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(card.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOwnCard = user?.id === card.authorId;

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [editing]);

  const handleDelete = () => {
    if (isOwnCard) {
      deleteCard(card.id);
    }
  };

  const handleStartEdit = () => {
    if (isOwnCard) {
      setEditContent(card.content);
      setEditing(true);
    }
  };

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== card.content) {
      editCard(card.id, trimmed);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(card.content);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
  };

  return (
    <div className={`card-item ${isOwnCard ? "own-card" : ""}`}>
      {editing ? (
        <textarea
          ref={textareaRef}
          className="card-edit-textarea"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSaveEdit}
          maxLength={1000}
          aria-label="Edit card content"
        />
      ) : (
        <p
          className={`card-content${isOwnCard ? " editable" : ""}`}
          onClick={isOwnCard ? handleStartEdit : undefined}
          title={isOwnCard ? "Click to edit" : undefined}
        >
          {card.content}
        </p>
      )}
      <div className="card-footer">
        {showAuthor && (
          <span className="card-author" title={card.authorName}>
            {isOwnCard ? "You" : card.authorName}
          </span>
        )}
        {isOwnCard && !editing && (
          <button
            className="card-edit-btn"
            onClick={handleStartEdit}
            title="Edit card"
            aria-label="Edit this card"
          >
            ✎
          </button>
        )}
        {showDelete && isOwnCard && (
          <button
            className="card-delete-btn"
            onClick={handleDelete}
            title="Delete card"
            aria-label="Delete this card"
          >
            ✕
          </button>
        )}
        {card.votes > 0 && (
          <span className="card-votes" title={`${card.votes} votes`}>
            {card.votes}
          </span>
        )}
      </div>
    </div>
  );
}
