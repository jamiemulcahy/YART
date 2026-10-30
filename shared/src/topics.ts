import type { Card, Group, Lane, Topic } from "./types";

export const TOPIC_TITLE_FALLBACK_LENGTH = 60;

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Groups and ungrouped cards, in lane order then creation order. */
export function buildTopics(lanes: Lane[], groups: Group[], cards: Card[]): Topic[] {
  const laneOrder = new Map(lanes.map((l, i) => [l.id, i]));
  const byGroup = new Map<string, Card[]>();
  const topics: Topic[] = [];
  const sortedCards = [...cards].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const card of sortedCards) {
    if (card.groupId) {
      const list = byGroup.get(card.groupId) ?? [];
      list.push(card);
      byGroup.set(card.groupId, list);
    } else {
      topics.push({
        id: card.id,
        kind: "card",
        laneId: card.laneId,
        title: card.text ?? "",
        cards: [card],
        createdAt: card.createdAt,
      });
    }
  }
  for (const group of groups) {
    const groupCards = byGroup.get(group.id) ?? [];
    if (groupCards.length === 0) continue;
    const first = groupCards[0]?.text ?? "";
    topics.push({
      id: group.id,
      kind: "group",
      laneId: group.laneId,
      title: group.title || truncate(first, TOPIC_TITLE_FALLBACK_LENGTH),
      cards: groupCards,
      createdAt: group.createdAt,
    });
  }
  return topics.sort(
    (a, b) =>
      (laneOrder.get(a.laneId) ?? 99) - (laneOrder.get(b.laneId) ?? 99) ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id)
  );
}

/** Discussion order: most shields, then bigger groups, then oldest. */
export function rankTopics(topics: Topic[], totals: Record<string, number>): Topic[] {
  return [...topics].sort(
    (a, b) =>
      (totals[b.id] ?? 0) - (totals[a.id] ?? 0) ||
      b.cards.length - a.cards.length ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id)
  );
}
