import type { ReactNode } from "react";
import type { Lane } from "@yart/shared";

export function PhaseIntro(props: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="phase-intro">
      <div>
        <h2>{props.title}</h2>
        <p>{props.children}</p>
      </div>
      {props.aside && <div className="phase-intro-aside">{props.aside}</div>}
    </div>
  );
}

export function LaneHeader(props: { lane: Lane; count?: number }) {
  const { lane, count } = props;
  return (
    <header className="lane-header" style={{ borderColor: lane.colour }}>
      <h3>
        <span className="lane-swatch" style={{ background: lane.colour }} aria-hidden="true" />
        {lane.title}
        {count !== undefined && (
          <span className="lane-count" aria-label={`${count} cards`}>
            {count}
          </span>
        )}
      </h3>
      {lane.description && <p className="lane-desc">{lane.description}</p>}
    </header>
  );
}

export function CardText(props: { text: string }) {
  return <p className="card-text">{props.text}</p>;
}

export function HiddenCardText() {
  return (
    <p className="card-text hidden-text" aria-label="Hidden card">
      <span aria-hidden="true">▒▒▒▒ ▒▒▒ ▒▒▒▒▒</span>
    </p>
  );
}
