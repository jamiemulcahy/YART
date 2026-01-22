import { useState, type FormEvent } from "react";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import { Column } from "./Column";

export function PublishMode() {
  const { room, cards, addColumn } = useRoom();
  const { ownerKey } = useUser();
  const [newColumnName, setNewColumnName] = useState("");

  const isOwner = !!ownerKey;

  const handleAddColumn = (e: FormEvent) => {
    e.preventDefault();
    if (newColumnName.trim()) {
      addColumn(newColumnName.trim());
      setNewColumnName("");
    }
  };

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
        {isOwner && (
          <div className="add-column-card">
            <form onSubmit={handleAddColumn}>
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Add new column..."
                aria-label="New column name"
              />
              <button type="submit" disabled={!newColumnName.trim()}>
                + Add
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
