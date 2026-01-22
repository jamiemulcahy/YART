import { useState, type FormEvent } from "react";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { Column } from "../types";

interface SortableColumnItemProps {
  column: Column;
  onUpdate: (name: string) => void;
  onDelete: () => void;
}

function SortableColumnItem({
  column,
  onUpdate,
  onDelete,
}: SortableColumnItemProps) {
  const [name, setName] = useState(column.name);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
    <div ref={setNodeRef} style={style} className="column-item">
      <span
        className="drag-handle"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
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

function ColumnOverlay({ column }: { column: Column }) {
  return (
    <div className="column-item dragging">
      <span className="drag-handle">⋮⋮</span>
      <input
        type="text"
        value={column.name}
        readOnly
        placeholder="Column name"
      />
      <button className="delete-btn">✕</button>
    </div>
  );
}

export function EditMode() {
  const { room, addColumn, updateColumn, deleteColumn, reorderColumns } =
    useRoom();
  const { ownerKey } = useUser();
  const [newColumnName, setNewColumnName] = useState("");
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    const column = sortedColumns.find((c) => c.id === event.active.id);
    if (column) {
      setActiveColumn(column);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveColumn(null);
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = sortedColumns.findIndex((c) => c.id === active.id);
    const newIndex = sortedColumns.findIndex((c) => c.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Create new order
    const newOrder = [...sortedColumns];
    const [movedColumn] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, movedColumn);

    // Send reorder command with new column IDs order
    reorderColumns(newOrder.map((c) => c.id));
  };

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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedColumns.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="columns-editor">
              {sortedColumns.map((column) => (
                <SortableColumnItem
                  key={column.id}
                  column={column}
                  onUpdate={(name) => updateColumn(column.id, name)}
                  onDelete={() => deleteColumn(column.id)}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeColumn && <ColumnOverlay column={activeColumn} />}
          </DragOverlay>
        </DndContext>

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
