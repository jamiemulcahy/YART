import { useRoom } from "../contexts/RoomContext";
import { Column } from "./Column";

export function PublishMode() {
  const { room, cards } = useRoom();

  if (!room) return null;

  const sortedColumns = [...room.columns].sort((a, b) => a.order - b.order);

  return (
    <div className="publish-mode">
      <div className="publish-mode-header">
        <p>
          Add your thoughts to each column. Your drafts are private until you
          publish them.
        </p>
      </div>

      <div className="columns-container">
        {sortedColumns.length === 0 ? (
          <div className="no-columns">
            <p>No columns have been configured yet.</p>
          </div>
        ) : (
          sortedColumns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={cards}
              showDraftArea={true}
              showAuthor={true}
              showDelete={true}
            />
          ))
        )}
      </div>
    </div>
  );
}
