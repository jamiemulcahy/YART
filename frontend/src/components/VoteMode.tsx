import { useState, useRef, useEffect, useCallback } from "react";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { Card } from "../types";

interface SwipeCardProps {
  card: Card;
  columnName: string;
  onVote: (vote: boolean) => void;
  isEntering: boolean;
}

function SwipeCard({ card, columnName, onVote, isEntering }: SwipeCardProps) {
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
      className={`swipe-card ${isDragging ? "dragging" : ""} ${isEntering ? "entering" : ""}`}
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
  const { room, cards, users, vote } = useRoom();
  const { votedCardIds, addVotedCard } = useUser();
  const [isEntering, setIsEntering] = useState(false);
  const prevCardIdRef = useRef<string | null>(null);

  // Filter cards that haven't been voted on yet
  const unvotedCards = room
    ? cards.filter((card) => !votedCardIds.includes(card.id))
    : [];
  const currentCard = unvotedCards[0];

  // Trigger entrance animation when the current card changes
  useEffect(() => {
    if (currentCard && currentCard.id !== prevCardIdRef.current) {
      // Only animate if this isn't the first card
      if (prevCardIdRef.current !== null) {
        setIsEntering(true);
        const timer = setTimeout(() => setIsEntering(false), 300);
        return () => clearTimeout(timer);
      }
      prevCardIdRef.current = currentCard.id;
    }
  }, [currentCard]);

  // Update ref after animation starts
  useEffect(() => {
    if (currentCard) {
      prevCardIdRef.current = currentCard.id;
    }
  }, [currentCard]);

  if (!room) return null;

  // Get column name for a card
  const getColumnName = (columnId: string): string => {
    const column = room.columns.find((c) => c.id === columnId);
    return column?.name || "Unknown";
  };

  const handleVote = useCallback(
    (voteValue: boolean) => {
      const card = unvotedCards[0];
      if (!card) return;

      vote(card.id, voteValue);
      addVotedCard(card.id);
    },
    [unvotedCards, vote, addVotedCard]
  );

  // Keyboard navigation: arrow keys to vote
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (unvotedCards.length === 0) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleVote(true);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleVote(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleVote, unvotedCards.length]);

  // All cards voted
  if (unvotedCards.length === 0) {
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

  const progress = votedCardIds.length;
  const total = cards.length;

  return (
    <div className="vote-mode">
      <div className="vote-header">
        <p>Swipe right for Yes, left for No (or use arrow keys)</p>
      </div>

      <div className="vote-main-content">
        <div className="swipe-area">
          <div className="swipe-container">
            <SwipeCard
              key={currentCard.id}
              card={currentCard}
              columnName={getColumnName(currentCard.columnId)}
              onVote={handleVote}
              isEntering={isEntering}
            />
          </div>
          <div className="vote-progress">
            {progress} / {total} cards
          </div>
        </div>

        <div className="vote-progress-table">
          <h3>Voting Progress</h3>
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>
                    <span className="progress-count">
                      {user.votesCount || 0} / {total}
                    </span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${((user.votesCount || 0) / total) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
