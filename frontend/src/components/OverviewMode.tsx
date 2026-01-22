import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { Card } from "../types";

interface OverviewCardProps {
  card: Card;
  wasDiscussed: boolean;
}

function OverviewCard({ card, wasDiscussed }: OverviewCardProps) {
  return (
    <div className={`overview-card ${wasDiscussed ? "discussed" : ""}`}>
      <div className="overview-card-content">{card.content}</div>
      <div className="overview-card-meta">
        <span className="overview-card-author">{card.authorName}</span>
        <span className="overview-card-votes">{card.votes} votes</span>
        {card.actionItems.length > 0 && (
          <span className="overview-card-actions-badge">
            {card.actionItems.length} action
            {card.actionItems.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {card.actionItems.length > 0 && (
        <ul className="overview-card-actions">
          {card.actionItems.map((action) => (
            <li key={action.id}>{action.content}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function generateMarkdownExport(
  roomName: string,
  columns: Array<{ id: string; name: string }>,
  cards: Card[],
  discussedCardIds: string[]
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const discussedCards = cards.filter((c) => discussedCardIds.includes(c.id));
  const hasDiscussedItems = discussedCards.length > 0;

  let markdown = `# ${roomName} - Retrospective Summary\n\n`;
  markdown += `## Date\n\n${date}\n\n`;

  if (hasDiscussedItems) {
    markdown += `## Discussed Items\n\n`;
    for (const card of discussedCards) {
      const column = columns.find((c) => c.id === card.columnId);
      markdown += `### ${column?.name || "Unknown"}\n\n`;
      markdown += `**${card.content}** (${card.votes} votes, by ${card.authorName})\n\n`;
      if (card.actionItems.length > 0) {
        markdown += `Action Items:\n`;
        for (const action of card.actionItems) {
          markdown += `- ${action.content}\n`;
        }
        markdown += `\n`;
      }
    }
  }

  markdown += `## All Cards\n\n`;
  for (const column of columns) {
    const columnCards = cards
      .filter((c) => c.columnId === column.id)
      .sort((a, b) => b.votes - a.votes);

    if (columnCards.length === 0) continue;

    markdown += `### ${column.name}\n\n`;
    for (const card of columnCards) {
      const discussed = discussedCardIds.includes(card.id)
        ? " (discussed)"
        : "";
      markdown += `- **${card.content}**${discussed}\n`;
      markdown += `  - ${card.votes} votes, by ${card.authorName}\n`;
      if (card.actionItems.length > 0) {
        markdown += `  - Actions:\n`;
        for (const action of card.actionItems) {
          markdown += `    - ${action.content}\n`;
        }
      }
    }
    markdown += `\n`;
  }

  return markdown;
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function OverviewMode() {
  const { room, cards } = useRoom();
  const { user } = useUser();

  if (!room) return null;

  const sortedColumns = [...room.columns].sort((a, b) => a.order - b.order);
  const isOwner = user?.isOwner ?? false;

  // Cards with action items are considered "discussed"
  const discussedCardIds = cards
    .filter((c) => c.actionItems.length > 0)
    .map((c) => c.id);

  const handleExport = () => {
    const markdown = generateMarkdownExport(
      room.name,
      sortedColumns,
      cards,
      discussedCardIds
    );
    const filename = `${room.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-retro-${new Date().toISOString().split("T")[0]}.md`;
    downloadMarkdown(markdown, filename);
  };

  return (
    <div className="overview-mode">
      <div className="overview-header">
        <h2>Retrospective Overview</h2>
        {isOwner && (
          <button onClick={handleExport} className="export-btn">
            Export to Markdown
          </button>
        )}
      </div>

      <div className="overview-columns">
        {sortedColumns.map((column) => {
          const columnCards = cards
            .filter((c) => c.columnId === column.id)
            .sort((a, b) => b.votes - a.votes);

          return (
            <div key={column.id} className="overview-column">
              <div className="overview-column-header">
                <h3>{column.name}</h3>
                <span className="overview-column-count">
                  {columnCards.length} card{columnCards.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="overview-column-cards">
                {columnCards.length === 0 ? (
                  <p className="no-cards">No cards</p>
                ) : (
                  columnCards.map((card) => (
                    <OverviewCard
                      key={card.id}
                      card={card}
                      wasDiscussed={discussedCardIds.includes(card.id)}
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
