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
  const { deleteCard } = useRoom();

  const isOwnCard = user?.id === card.authorId;

  const handleDelete = () => {
    if (isOwnCard) {
      deleteCard(card.id);
    }
  };

  return (
    <div className={`card-item ${isOwnCard ? "own-card" : ""}`}>
      <p className="card-content">{card.content}</p>
      <div className="card-footer">
        {showAuthor && (
          <span className="card-author" title={card.authorName}>
            {isOwnCard ? "You" : card.authorName}
          </span>
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
