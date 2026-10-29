import { useState } from "react";

/** Text that turns into an input on click; saves on Enter/blur, cancels on Escape. */
export function InlineEdit(props: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  allowEmpty?: boolean;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);

  if (!editing) {
    return (
      <button
        className={`inline-edit ${props.className ?? ""}`}
        onClick={() => {
          setDraft(props.value);
          setEditing(true);
        }}
        aria-label={`${props.label}: ${props.value || props.placeholder || ""}. Click to edit`}
        title="Click to edit"
      >
        {props.value || <span className="placeholder">{props.placeholder}</span>}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === props.value) return;
    if (!next && !props.allowEmpty) return;
    props.onSave(next);
  };

  return (
    <input
      className={`inline-edit-input ${props.className ?? ""}`}
      aria-label={props.label}
      value={draft}
      maxLength={props.maxLength}
      placeholder={props.placeholder}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
