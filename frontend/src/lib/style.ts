import type { CSSProperties } from "react";

/** Sets the --lane custom property that tints cards. */
export function laneVar(colour: string | undefined): CSSProperties | undefined {
  return colour ? ({ "--lane": colour } as CSSProperties) : undefined;
}
