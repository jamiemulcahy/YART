import { useRoom } from "../contexts/RoomContext";
import { Column } from "./Column";

export function GroupMode() {
  const { room, cards } = useRoom();

  if (!room) return null;

  const sortedColumns = [...room.columns].sort((a, b) => a.order - b.order);

  return (
    <div className="group-mode">
      <div className="group-mode-header">
        <p>
          Review and organize cards. Drag cards to group related items together.
        </p>
      </div>

      <div className="columns-container">
        {sortedColumns.length === 0 ? (
          <div className="no-columns">
            <p>No columns have been configured.</p>
          </div>
        ) : (
          sortedColumns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={cards}
              showDraftArea={false}
              showAuthor={true}
              showDelete={false}
            />
          ))
        )}
      </div>
    </div>
  );
}
