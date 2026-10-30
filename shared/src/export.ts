import { buildTopics, rankTopics } from "./topics";
import type { RoomSnapshot, Topic } from "./types";

function bullet(text: string): string {
  // Keep multi-line cards inside one list item.
  return text.replace(/\n/g, "\n  ");
}

function laneNames(topic: Topic, laneTitle: Map<string, string>): string {
  const names = new Set(topic.cards.map((c) => laneTitle.get(c.laneId) ?? "?"));
  return [...names].join(", ");
}

export function exportMarkdown(room: RoomSnapshot): string {
  const laneTitle = new Map(room.lanes.map((l) => [l.id, l.title]));
  const totals = room.shields.totals ?? {};
  const topics = rankTopics(buildTopics(room.lanes, room.groups, room.cards), totals);
  const participants = room.participants.filter((p) => p.role !== "viewer").length;
  const date = new Date(room.createdAt).toISOString().slice(0, 10);
  const lines: string[] = [`# ${room.name} — ${date}`, ""];
  lines.push(`Participants: ${participants} · Votes per person: ${room.settings.shieldsPerPerson}`, "");

  const shielded = topics.filter((t) => (totals[t.id] ?? 0) > 0);
  const unshielded = topics.filter((t) => (totals[t.id] ?? 0) === 0);

  const writeTopic = (topic: Topic, index: number | null) => {
    const shields = totals[topic.id] ?? 0;
    const fate = room.battle?.fates[topic.id];
    const fateText = fate ? ` (${fate})` : "";
    const prefix = index === null ? "" : `${index}. `;
    lines.push(
      `### ${prefix}${topic.title.split("\n")[0]} — ${shields} ${shields === 1 ? "vote" : "votes"}${fateText}`
    );
    const kind = topic.kind === "group" ? `Group of ${topic.cards.length} · ` : "";
    lines.push(`_${kind}${laneNames(topic, laneTitle)}_`);
    for (const card of topic.cards) {
      lines.push(`- ${bullet(card.text ?? "")} (${laneTitle.get(card.laneId) ?? "?"})`);
    }
    const notes = room.notes.filter((n) => n.topicId === topic.id);
    if (notes.length > 0) {
      lines.push("", "**Notes**");
      for (const n of notes) lines.push(`- ${bullet(n.text)}`);
    }
    const actions = room.actions.filter((a) => a.topicId === topic.id);
    if (actions.length > 0) {
      lines.push("", "**Actions**");
      for (const a of actions) lines.push(`- [ ] ${bullet(a.text)}${a.assignee ? ` — ${a.assignee}` : ""}`);
    }
    lines.push("");
  };

  if (shielded.length > 0) {
    lines.push("## Topics (by votes)", "");
    shielded.forEach((t, i) => writeTopic(t, i + 1));
  }
  if (unshielded.length > 0) {
    lines.push("## Other topics (no votes)", "");
    unshielded.forEach((t) => writeTopic(t, null));
  }

  lines.push("## All actions", "");
  if (room.actions.length === 0) {
    lines.push("_No actions recorded._");
  } else {
    for (const a of room.actions)
      lines.push(`- [ ] ${bullet(a.text)}${a.assignee ? ` — ${a.assignee}` : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}
