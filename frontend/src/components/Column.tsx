import type { Column as ColumnType, Card as CardType } from "../types";
import { Card } from "./Card";
import { DraftArea } from "./DraftArea";

interface ColumnProps {
  column: ColumnType;
  cards: CardType[];
  showDraftArea?: boolean;
  showAuthor?: boolean;
  showDelete?: boolean;
}

export function Column({
  column,
  cards,
  showDraftArea = false,
  showAuthor = true,
  showDelete = true,
}: ColumnProps) {
  const columnCards = cards
    .filter((card) => card.columnId === column.id)
    .filter((card) => !card.groupId); // Don't show grouped cards in main list

  return (
    <div className="column">
      <div className="column-header">
        <div className="column-title-container">
          <h3 className="column-title" title={column.name}>
            {column.name}
          </h3>
          {column.description && (
            <span
              className="column-info-icon"
              title={column.description}
              aria-label={`Description: ${column.description}`}
            >
              &#x24D8;
            </span>
          )}
        </div>
        <span className="card-count">
          {columnCards.length} {columnCards.length === 1 ? "card" : "cards"}
        </span>
      </div>

      <div className="column-cards">
        {columnCards.length === 0 ? (
          <p className="no-cards">No cards yet</p>
        ) : (
          columnCards.map((card) => (
            <Card
              key={card.id}
              card={card}
              showAuthor={showAuthor}
              showDelete={showDelete}
            />
          ))
        )}
      </div>

      {showDraftArea && <DraftArea columnId={column.id} />}
    </div>
  );
}
