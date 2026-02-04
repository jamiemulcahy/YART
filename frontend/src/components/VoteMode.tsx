import { useRoom } from "../contexts/RoomContext";
import type { Card, CardGroup } from "../types";

interface VotableItem {
  type: "card" | "group";
  id: string;
  card?: Card;
  group?: CardGroup;
  groupCards?: Card[];
  votes: number;
  columnId: string;
}

interface VoteCardProps {
  item: VotableItem;
  hasVoted: boolean;
  onVote: () => void;
}

function VoteCard({ item, hasVoted, onVote }: VoteCardProps) {
  const isGroup = item.type === "group";

  return (
    <div
      className={`vote-card ${hasVoted ? "voted" : ""} ${isGroup ? "vote-group" : ""}`}
      onClick={onVote}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onVote();
        }
      }}
      aria-pressed={hasVoted}
      aria-label={`${hasVoted ? "Remove vote from" : "Vote for"} ${isGroup ? "group" : "card"}`}
    >
      {isGroup ? (
        <div className="vote-group-content">
          <div className="vote-group-header">
            <span className="vote-group-count">
              {item.groupCards!.length} cards
            </span>
          </div>
          {item.groupCards!.slice(0, 2).map((card) => (
            <p key={card.id} className="vote-card-preview">
              {card.content}
            </p>
          ))}
          {item.groupCards!.length > 2 && (
            <p className="vote-card-more">
              +{item.groupCards!.length - 2} more
            </p>
          )}
        </div>
      ) : (
        <div className="vote-card-content">
          <p>{item.card!.content}</p>
          <span className="vote-card-author">- {item.card!.authorName}</span>
        </div>
      )}

      <div className="vote-card-footer">
        <span className={`vote-count ${hasVoted ? "voted" : ""}`}>
          {item.votes} {item.votes === 1 ? "vote" : "votes"}
        </span>
        <span className="vote-indicator">{hasVoted ? "Voted" : "Vote"}</span>
      </div>
    </div>
  );
}

export function VoteMode() {
  const {
    room,
    cards,
    groups,
    voteSettings,
    myVotes,
    toggleVote,
    getMyVotesInColumn,
    getTotalMyVotes,
  } = useRoom();

  if (!room) return null;

  const sortedColumns = [...room.columns].sort((a, b) => a.order - b.order);

  // Build votable items for a column
  const getColumnItems = (columnId: string): VotableItem[] => {
    const items: VotableItem[] = [];

    // Get groups in this column
    const columnGroups = groups.filter((group) => {
      const firstCard = cards.find((c) => c.id === group.cardIds[0]);
      return firstCard?.columnId === columnId;
    });

    const groupedCardIds = new Set(columnGroups.flatMap((g) => g.cardIds));

    // Ungrouped cards
    cards
      .filter(
        (card) => card.columnId === columnId && !groupedCardIds.has(card.id)
      )
      .forEach((card) => {
        items.push({
          type: "card",
          id: card.id,
          card,
          votes: card.votes,
          columnId,
        });
      });

    // Groups
    columnGroups.forEach((group) => {
      const groupCards = group.cardIds
        .map((id) => cards.find((c) => c.id === id))
        .filter((c): c is Card => !!c);

      // Calculate group vote count (count users who voted for this group)
      // For now, we use the first card's votes as proxy since backend updates it
      const votes = groupCards[0]?.votes || 0;

      items.push({
        type: "group",
        id: group.id,
        group,
        groupCards,
        votes,
        columnId,
      });
    });

    // Sort by votes descending
    return items.sort((a, b) => b.votes - a.votes);
  };

  const handleVote = (item: VotableItem) => {
    toggleVote(item.id, item.type);
  };

  const totalUsed = getTotalMyVotes();
  const { totalVotesLimit, votesPerColumnLimit } = voteSettings;

  return (
    <div className="vote-mode direct-vote">
      <div className="vote-mode-header">
        <p>
          Click on cards or groups to vote. Click again to remove your vote.
        </p>
        <div className="vote-limits-info">
          {totalVotesLimit !== undefined && (
            <span>
              Total votes: {totalUsed} / {totalVotesLimit}
            </span>
          )}
          {votesPerColumnLimit !== undefined && (
            <span>Max {votesPerColumnLimit} per column</span>
          )}
          {totalVotesLimit === undefined &&
            votesPerColumnLimit === undefined && <span>Unlimited voting</span>}
        </div>
      </div>

      <div className="columns-container">
        {sortedColumns.map((column) => {
          const columnItems = getColumnItems(column.id);
          const columnVotes = getMyVotesInColumn(column.id);

          return (
            <div key={column.id} className="column">
              <div className="column-header">
                <h3>{column.name}</h3>
                <span className="card-count">
                  {columnItems.length}
                  {votesPerColumnLimit !== undefined && (
                    <span className="column-votes">
                      {" "}
                      ({columnVotes}/{votesPerColumnLimit})
                    </span>
                  )}
                </span>
              </div>
              <div className="column-cards">
                {columnItems.length === 0 ? (
                  <p className="empty-column">No cards</p>
                ) : (
                  columnItems.map((item) => (
                    <VoteCard
                      key={item.id}
                      item={item}
                      hasVoted={myVotes.has(item.id)}
                      onVote={() => handleVote(item)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
