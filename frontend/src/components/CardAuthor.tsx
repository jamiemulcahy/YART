import type { Card } from "@yart/shared";
import { useRoom } from "../room/RoomContext";

/** "yours" on your own cards, otherwise the author's name and colour. */
export function CardAuthor(props: { card: Card }) {
  const { room } = useRoom();
  const { card } = props;
  if (card.mine) return <span className="card-author mine">yours</span>;
  const author = room.participants.find((p) => p.id === card.authorId);
  if (!author) return null;
  return (
    <span className="card-author">
      <span className="dot" style={{ background: author.colour }} aria-hidden="true" />
      <span className="card-author-name">{author.name}</span>
    </span>
  );
}
