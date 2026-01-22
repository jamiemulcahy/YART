import { useState, type FormEvent } from "react";
import { useUser } from "../contexts/UserContext";
import { useRoom } from "../contexts/RoomContext";
import type { DraftCard } from "../types";

interface DraftCardItemProps {
  draft: DraftCard;
  onUpdate: (content: string) => void;
  onDelete: () => void;
  onPublish: () => void;
}

function DraftCardItem({
  draft,
  onUpdate,
  onDelete,
  onPublish,
}: DraftCardItemProps) {
  const [content, setContent] = useState(draft.content);

  const handleBlur = () => {
    if (content.trim() !== draft.content) {
      onUpdate(content.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setContent(draft.content);
    }
  };

  return (
    <div className="draft-card-item">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Edit your card..."
        rows={2}
      />
      <div className="draft-card-actions">
        <button
          className="draft-publish-btn"
          onClick={onPublish}
          disabled={!content.trim()}
        >
          Publish
        </button>
        <button className="draft-delete-btn" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

interface DraftAreaProps {
  columnId: string;
}

export function DraftArea({ columnId }: DraftAreaProps) {
  const {
    getDraftCardsForColumn,
    addDraftCard,
    updateDraftCard,
    deleteDraftCard,
  } = useUser();
  const { publishCard } = useRoom();
  const [newContent, setNewContent] = useState("");

  const drafts = getDraftCardsForColumn(columnId);

  const handleAddDraft = (e: FormEvent) => {
    e.preventDefault();
    if (newContent.trim()) {
      addDraftCard(columnId, newContent.trim());
      setNewContent("");
    }
  };

  const handlePublish = (draft: DraftCard) => {
    if (draft.content.trim()) {
      publishCard(draft.columnId, draft.content);
      deleteDraftCard(draft.id);
    }
  };

  return (
    <div className="draft-area">
      <div className="draft-area-header">Your Drafts</div>

      {drafts.length > 0 && (
        <div className="draft-cards-list">
          {drafts.map((draft) => (
            <DraftCardItem
              key={draft.id}
              draft={draft}
              onUpdate={(content) => updateDraftCard(draft.id, content)}
              onDelete={() => deleteDraftCard(draft.id)}
              onPublish={() => handlePublish(draft)}
            />
          ))}
        </div>
      )}

      <form className="add-draft-form" onSubmit={handleAddDraft}>
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add a new card..."
          rows={2}
        />
        <button type="submit" disabled={!newContent.trim()}>
          Add Draft
        </button>
      </form>
    </div>
  );
}
