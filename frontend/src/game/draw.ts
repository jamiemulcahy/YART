// Small pixel-art sprites drawn with fillRect, so there are no image assets.

const GRUNT_FRAMES = [
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
];

const BOSS_SPRITE = [
  "0000011111100000",
  "0001111111111000",
  "0011111111111100",
  "0111001111001110",
  "1111111111111111",
  "0011101111011100",
  "0110000110000110",
  "1100001001000011",
];

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

export function drawGrunt(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, flash: boolean) {
  const frame = GRUNT_FRAMES[Math.floor(t / 400) % 2] as string[];
  drawBitmap(ctx, frame, x, y, 4.2, flash ? "#ffffff" : "#7CFF6B");
}

export function drawBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hpRatio: number,
  flash: boolean
) {
  drawBitmap(ctx, BOSS_SPRITE, x, y, 8, flash ? "#ffffff" : "#ff4fd8");
  // HP bar
  const w = 120;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - w / 2, y - 52, w, 8);
  ctx.fillStyle = "#ff4fd8";
  ctx.fillRect(x - w / 2, y - 52, w * Math.max(0, hpRatio), 8);
}

export function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, colour: string, me: boolean) {
  ctx.save();
  ctx.translate(x, y);
  if (me) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(26, 18);
  ctx.lineTo(8, 10);
  ctx.lineTo(0, 22);
  ctx.lineTo(-8, 10);
  ctx.lineTo(-26, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = me ? "#ffffff" : "rgba(255,255,255,0.6)";
  ctx.fillRect(-3, -14, 6, 10);
  ctx.restore();
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  const used = lines.join(" ").length;
  if (used < text.replace(/\s+/g, " ").trim().length && lines.length > 0) {
    let last = lines[lines.length - 1] as string;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
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
