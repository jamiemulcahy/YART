// Small pixel-art sprites drawn with fillRect, so there are no image assets.
import type { AttackerKind, ShipKind } from "@yart/shared";

const SPRITES: Record<AttackerKind, { frames: string[][]; pixel: number; colour: string }> = {
  drone: {
    pixel: 4,
    colour: "#5eead4",
    frames: [
      ["0100010", "0011100", "0111110", "1101011", "0100010"],
      ["0100010", "1011101", "0111110", "1101011", "1000001"],
    ],
  },
  grunt: {
    pixel: 4.2,
    colour: "#7CFF6B",
    frames: [
      [
        "00100000100",
        "00010001000",
        "00111111100",
        "01101110110",
        "11111111111",
        "10111111101",
        "10100000101",
        "00011011000",
      ],
      [
        "00100000100",
        "10010001001",
        "10111111101",
        "11101110111",
        "11111111111",
        "01111111110",
        "00100000100",
        "01000000010",
      ],
    ],
  },
  brute: {
    pixel: 5,
    colour: "#fb923c",
    frames: [
      [
        "0001100011000",
        "0011111111100",
        "0110111110110",
        "1111111111111",
        "1101111111011",
        "1111100011111",
        "0110000000110",
        "1100000000011",
      ],
      [
        "0001100011000",
        "0011111111100",
        "0110111110110",
        "1111111111111",
        "1101111111011",
        "1111100011111",
        "0011000001100",
        "0110000000110",
      ],
    ],
  },
  boss: {
    pixel: 8,
    colour: "#ff4fd8",
    frames: [
      [
        "0000011111100000",
        "0001111111111000",
        "0011111111111100",
        "0111001111001110",
        "1111111111111111",
        "0011101111011100",
        "0110000110000110",
        "1100001001000011",
      ],
    ],
  },
};

function drawBitmap(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  cx: number,
  cy: number,
  pixel: number,
  colour: string
) {
  const w = (rows[0]?.length ?? 0) * pixel;
  const h = rows.length * pixel;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  ctx.fillStyle = colour;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "1") ctx.fillRect(x0 + x * pixel, y0 + y * pixel, pixel + 0.5, pixel + 0.5);
    }
  });
}

export function drawAttacker(
  ctx: CanvasRenderingContext2D,
  kind: AttackerKind,
  x: number,
  y: number,
  t: number,
  flash: string | null,
  hpRatio: number
) {
  const sprite = SPRITES[kind];
  const frame = sprite.frames[Math.floor(t / 400) % sprite.frames.length] as string[];
  drawBitmap(ctx, frame, x, y, sprite.pixel, flash ?? sprite.colour);
  // Big enemies always show health; small ones once they've been hit.
  if (kind === "boss" || kind === "brute" || hpRatio < 1) {
    const w = kind === "boss" ? 130 : kind === "brute" ? 70 : 40;
    const top = y - (frame.length * sprite.pixel) / 2 - 12;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - w / 2, top, w, kind === "boss" ? 8 : 5);
    ctx.fillStyle = sprite.colour;
    ctx.fillRect(x - w / 2, top, w * Math.max(0, hpRatio), kind === "boss" ? 8 : 5);
  }
}

/** Ship silhouettes per class; the body is the pilot's colour, trim is the class colour. */
export function drawShip(
  ctx: CanvasRenderingContext2D,
  kind: ShipKind,
  x: number,
  y: number,
  colour: string,
  trim: string,
  opts: { me: boolean; thrust: boolean; t: number }
) {
  ctx.save();
  ctx.translate(x, y);
  if (opts.me) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = 18;
  }
  // Engine flame when pushing forward.
  if (opts.thrust) {
    const flicker = 10 + Math.sin(opts.t / 30) * 4;
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.moveTo(-7, 20);
    ctx.lineTo(0, 20 + flicker + 10);
    ctx.lineTo(7, 20);
    ctx.fill();
  }
  ctx.fillStyle = colour;
  ctx.beginPath();
  if (kind === "viper") {
    ctx.moveTo(0, -32);
    ctx.lineTo(26, 18);
    ctx.lineTo(8, 10);
    ctx.lineTo(0, 22);
    ctx.lineTo(-8, 10);
    ctx.lineTo(-26, 18);
  } else if (kind === "lancer") {
    ctx.moveTo(0, -40);
    ctx.lineTo(10, -6);
    ctx.lineTo(22, 22);
    ctx.lineTo(0, 14);
    ctx.lineTo(-22, 22);
    ctx.lineTo(-10, -6);
  } else {
    ctx.moveTo(0, -24);
    ctx.lineTo(14, -8);
    ctx.lineTo(34, 6);
    ctx.lineTo(30, 22);
    ctx.lineTo(0, 16);
    ctx.lineTo(-30, 22);
    ctx.lineTo(-34, 6);
    ctx.lineTo(-14, -8);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // Class trim.
  ctx.fillStyle = trim;
  if (kind === "viper") {
    ctx.fillRect(-3, -16, 6, 12);
    ctx.fillRect(-22, 12, 8, 4);
    ctx.fillRect(14, 12, 8, 4);
  } else if (kind === "lancer") {
    ctx.fillRect(-2, -36, 4, 26);
  } else {
    ctx.fillRect(-32, 2, 7, 14);
    ctx.fillRect(25, 2, 7, 14);
    ctx.fillRect(-3, -12, 6, 10);
  }
  ctx.restore();
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const fits = (t: string) => ctx.measureText(t).width <= maxWidth;
  // Split anything too wide to fit on a line (long URLs, keyboard mashing) into chunks.
  const words: string[] = [];
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    let rest = word;
    while (rest && !fits(rest)) {
      let n = rest.length - 1;
      while (n > 1 && !fits(rest.slice(0, n))) n--;
      words.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    if (rest) words.push(rest);
  }
  const lines: string[] = [];
  let line = "";
  let truncated = false;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (fits(test)) {
      line = test;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
  }
  if (!truncated && line) lines.push(line);
  if (truncated && lines.length > 0) {
    let last = lines[lines.length - 1] as string;
    while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines.filter(Boolean);
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  colour: string;
}

export function burst(particles: Particle[], x: number, y: number, colour: string, count: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 80 + Math.random() * 320;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.5 + Math.random() * 0.5,
      colour,
    });
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
