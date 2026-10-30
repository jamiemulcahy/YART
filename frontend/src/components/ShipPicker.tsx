import { useEffect, useRef } from "react";
import { SHIPS, SHIP_KINDS } from "@yart/shared";
import type { ShipKind } from "@yart/shared";
import { drawShip } from "../game/draw";

function ShipPreview(props: { kind: ShipKind; colour: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 96 * dpr;
    canvas.height = 96 * dpr;
    ctx.setTransform(dpr * 1.3, 0, 0, dpr * 1.3, 0, 0);
    ctx.clearRect(0, 0, 96, 96);
    drawShip(ctx, props.kind, 37, 38, props.colour, SHIPS[props.kind].colour, {
      me: true,
      thrust: true,
      t: 0,
    });
  }, [props.kind, props.colour]);
  return <canvas ref={ref} className="ship-preview" aria-hidden="true" />;
}

/** Choose a battle ship: each has its own weapon and special move. */
export function ShipPicker(props: {
  value: ShipKind | undefined;
  colour: string;
  onChange: (kind: ShipKind) => void;
}) {
  return (
    <div className="ship-picker" role="radiogroup" aria-label="Choose your ship">
      {SHIP_KINDS.map((kind) => {
        const spec = SHIPS[kind];
        const selected = props.value === kind;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${spec.name}: ${spec.weapon}`}
            className={`ship-option ${selected ? "selected" : ""}`}
            style={{ borderColor: selected ? spec.colour : undefined }}
            onClick={() => props.onChange(kind)}
          >
            <ShipPreview kind={kind} colour={props.colour} />
            <span className="ship-name" style={{ color: spec.colour }}>
              {spec.name}
            </span>
            <span className="ship-weapon">{spec.weapon}</span>
            <span className="ship-blurb">{spec.blurb}</span>
            <span className="ship-special">
              <strong>{spec.special}:</strong> {spec.specialBlurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}
