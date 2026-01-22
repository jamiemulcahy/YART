import { useState, useRef } from "react";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { Card } from "../types";

interface SwipeCardProps {
  card: Card;
  columnName: string;
  onVote: (vote: boolean) => void;
}

function SwipeCard({ card, columnName, onVote }: SwipeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);

  const handleStart = (clientX: number) => {
    setIsDragging(true);
    startX.current = clientX;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging) return;
    const diff = clientX - startX.current;
    setOffset(diff);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 100;
    if (offset > threshold) {
      // Swipe right = yes
      onVote(true);
    } else if (offset < -threshold) {
      // Swipe left = no
      onVote(false);
    }
    setOffset(0);
  };

  const rotation = offset * 0.05;
  const opacity = Math.max(0.5, 1 - Math.abs(offset) / 300);

  return (
    <div
      ref={cardRef}
      className={`swipe-card ${isDragging ? "dragging" : ""}`}
      style={{
        transform: `translateX(${offset}px) rotate(${rotation}deg)`,
        opacity,
      }}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={handleEnd}
    >
      <div className="swipe-card-column">{columnName}</div>
      <div className="swipe-card-content">{card.content}</div>
      <div className="swipe-card-author">- {card.authorName}</div>

      {offset !== 0 && (
        <div className={`swipe-indicator ${offset > 0 ? "yes" : "no"}`}>
          {offset > 0 ? "Yes" : "No"}
        </div>
      )}
    </div>
  );
}

export function VoteMode() {
  const { room, cards, vote } = useRoom();
  const { votedCardIds, addVotedCard } = useUser();
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!room) return null;

  // Filter cards that haven't been voted on yet
  const unvotedCards = cards.filter((card) => !votedCardIds.includes(card.id));

  // Get column name for a card
  const getColumnName = (columnId: string): string => {
    const column = room.columns.find((c) => c.id === columnId);
    return column?.name || "Unknown";
  };

  const handleVote = (voteValue: boolean) => {
    const card = unvotedCards[currentIndex];
    if (!card) return;

    vote(card.id, voteValue);
    addVotedCard(card.id);
    setCurrentIndex((prev) => prev + 1);
  };

  // All cards voted
  if (unvotedCards.length === 0 || currentIndex >= unvotedCards.length) {
    return (
      <div className="vote-mode">
        <div className="vote-complete">
          <h2>Voting Complete!</h2>
          <p>
            You've voted on all {cards.length} card
            {cards.length !== 1 ? "s" : ""}.
          </p>
          <p>Waiting for the facilitator to move to the next phase...</p>
        </div>
      </div>
    );
  }

  const currentCard = unvotedCards[currentIndex];
  const progress = votedCardIds.length;
  const total = cards.length;

  return (
    <div className="vote-mode">
      <div className="vote-header">
        <p>Swipe right for Yes, left for No</p>
        <div className="vote-progress">
          {progress} / {total} cards
        </div>
      </div>

      <div className="swipe-container">
        <SwipeCard
          key={currentCard.id}
          card={currentCard}
          columnName={getColumnName(currentCard.columnId)}
          onVote={handleVote}
        />
      </div>

      <div className="vote-buttons">
        <button
          className="vote-no-btn"
          onClick={() => handleVote(false)}
          aria-label="Vote No"
        >
          No
        </button>
        <button
          className="vote-yes-btn"
          onClick={() => handleVote(true)}
          aria-label="Vote Yes"
        >
          Yes
        </button>
      </div>
    </div>
  );
}
