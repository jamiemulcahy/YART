import type { Topic } from "@yart/shared";
import { sounds } from "../lib/sounds";
import { useRoom } from "../room/RoomContext";
import { CardAuthor } from "../components/CardAuthor";
import { laneVar } from "../lib/style";
import { LaneHeader, PhaseIntro } from "../components/common";

export function VotePhase() {
  const { room, topics, isViewer, isOwner } = useRoom();
  const used = Object.values(room.shields.mine).reduce((a, b) => a + b, 0);
  const left = room.settings.shieldsPerPerson - used;
  const totalsHidden = room.shields.totals === null;

  return (
    <div className="phase vote">
      <PhaseIntro
        title="Vote for what matters"
        aside={
          !isViewer && (
            <div className="shield-bank" aria-live="polite">
              <span className="shield-icons" aria-hidden="true">
                {Array.from({ length: room.settings.shieldsPerPerson }, (_, i) => (
                  <span key={i} className={i < left ? "pip vote-pip full" : "pip vote-pip"} />
                ))}
              </span>
              <span className="shield-left">
                {left} of {room.settings.shieldsPerPerson} votes left
              </span>
            </div>
          )
        }
      >
        Vote for the topics you most want to discuss — up to {room.settings.maxShieldsPerTopic} on one topic.
        The most-voted topics get discussed first.
        {totalsHidden && " Totals are hidden until everyone's done."}
        {isOwner &&
          !room.settings.showShieldTotals &&
          " (You can see totals because you're the facilitator.)"}
      </PhaseIntro>
      <div className="lanes">
        {room.lanes.map((lane) => {
          const laneTopics = topics.filter((t) => t.laneId === lane.id);
          return (
            <section key={lane.id} className="lane" aria-label={lane.title} style={laneVar(lane.colour)}>
              <LaneHeader lane={lane} />
              <ul className="postits wide">
                {laneTopics.map((topic) => (
                  <li key={topic.id}>
                    <VoteTopic topic={topic} left={left} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function VoteTopic(props: { topic: Topic; left: number }) {
  const { topic, left } = props;
  const { room, send, isViewer } = useRoom();
  const mine = room.shields.mine[topic.id] ?? 0;
  const total = room.shields.totals ? (room.shields.totals[topic.id] ?? 0) : undefined;
  const strength = total ?? mine;
  const canAdd = !isViewer && left > 0 && mine < room.settings.maxShieldsPerTopic;
  const level = Math.min(5, strength);

  return (
    <article
      className={`defend-topic shield-${level} ${mine > 0 ? "has-mine" : ""}`}
      aria-label={`${topic.title}. ${mine} of your votes${total !== undefined ? `, ${total} total` : ""}`}
    >
      {topic.kind === "group" && <h4 className="topic-title">{topic.title}</h4>}
      <ul className="topic-cards">
        {topic.cards.map((c) => (
          <li key={c.id}>
            {c.text} <CardAuthor card={c} />
          </li>
        ))}
      </ul>
      <div className="defend-controls">
        <span className="shield-count">
          {total !== undefined ? (
            <>
              <strong>{total}</strong> {total === 1 ? "vote" : "votes"}
            </>
          ) : (
            <span className="muted">Totals hidden</span>
          )}
        </span>
        {!isViewer && (
          <div className="shield-buttons">
            <button
              className="btn small ghost"
              disabled={mine === 0}
              onClick={() => send({ t: "shield.remove", topicId: topic.id })}
              aria-label={`Remove a vote from ${topic.title}`}
            >
              −
            </button>
            <span className="my-shields" aria-label={`Your votes: ${mine}`}>
              {mine > 0 ? "●".repeat(mine) : "0"}
            </span>
            <button
              className="btn small primary"
              disabled={!canAdd}
              onClick={() => {
                sounds.shield();
                send({ t: "shield.add", topicId: topic.id });
              }}
              aria-label={`Add a vote to ${topic.title}`}
            >
              + Vote
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
