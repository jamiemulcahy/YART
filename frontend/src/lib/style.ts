import type { CSSProperties } from "react";

/** Sets the --lane custom property that tints cards. */
export function laneVar(colour: string | undefined): CSSProperties | undefined {
  return colour ? ({ "--lane": colour } as CSSProperties) : undefined;
}

/** A small, stable tilt per card id so the board looks like post-its rather than a spreadsheet. */
export function tilt(id: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const deg = ((Math.abs(h) % 25) - 12) / 10; // -1.2deg .. 1.2deg
  return { "--tilt": `${deg}deg` } as CSSProperties;
}
