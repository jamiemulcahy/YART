import { useState, type FormEvent } from "react";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { Column } from "../types";

interface ColumnItemProps {
  column: Column;
  onUpdate: (name: string) => void;
  onDelete: () => void;
}

function ColumnItem({ column, onUpdate, onDelete }: ColumnItemProps) {
  const [name, setName] = useState(column.name);

  const handleBlur = () => {
    if (name.trim() && name.trim() !== column.name) {
      onUpdate(name.trim());
    } else {
      setName(column.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setName(column.name);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="column-item">
      <span className="drag-handle" title="Drag to reorder">
        ⋮⋮
      </span>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Column name"
        aria-label={`Column name: ${column.name}`}
      />
      <button
        className="delete-btn"
        onClick={onDelete}
        title="Delete column"
        aria-label={`Delete column: ${column.name}`}
      >
        ✕
      </button>
    </div>
  );
}

export function EditMode() {
  const { room, addColumn, updateColumn, deleteColumn } = useRoom();
  const { ownerKey } = useUser();
  const [newColumnName, setNewColumnName] = useState("");

  const isOwner = !!ownerKey;

  if (!room) return null;

  const handleAddColumn = (e: FormEvent) => {
    e.preventDefault();
    if (newColumnName.trim()) {
      addColumn(newColumnName.trim());
      setNewColumnName("");
    }
  };

  const sortedColumns = [...room.columns].sort((a, b) => a.order - b.order);

  if (!isOwner) {
    return (
      <div className="edit-mode">
        <div className="waiting-message">
          <h2>Waiting for Setup</h2>
          <p>
            The facilitator is setting up the retrospective. You&apos;ll be able
            to participate once they start the session.
          </p>
          {sortedColumns.length > 0 && (
            <div className="columns-preview">
              <p>Columns so far:</p>
              <ul>
                {sortedColumns.map((col) => (
                  <li key={col.id}>{col.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="edit-mode">
      <div className="edit-mode-content">
        <h2>Configure Columns</h2>
        <p style={{ color: "#888", marginBottom: "1.5rem" }}>
          Add and organize the columns for your retrospective. Common setups
          include &quot;What went well / What didn&apos;t / Action items&quot;
          or &quot;Start / Stop / Continue&quot;.
        </p>

        <div className="columns-editor">
          {sortedColumns.map((column) => (
            <ColumnItem
              key={column.id}
              column={column}
              onUpdate={(name) => updateColumn(column.id, name)}
              onDelete={() => deleteColumn(column.id)}
            />
          ))}
        </div>

        <form className="add-column-form" onSubmit={handleAddColumn}>
          <input
            type="text"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="New column name"
            aria-label="New column name"
          />
          <button type="submit" disabled={!newColumnName.trim()}>
            Add Column
          </button>
        </form>

        {sortedColumns.length === 0 && (
          <p style={{ color: "#666", marginTop: "1rem", textAlign: "center" }}>
            Add at least one column to get started.
          </p>
        )}
      </div>
    </div>
  );
}
