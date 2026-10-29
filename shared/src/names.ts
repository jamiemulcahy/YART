const ADJECTIVES = [
  "Colourful",
  "Dastardly",
  "Sneaky",
  "Majestic",
  "Grumpy",
  "Jolly",
  "Bewildered",
  "Fearless",
  "Wobbly",
  "Sleepy",
  "Dapper",
  "Cheeky",
  "Mighty",
  "Suspicious",
  "Fluffy",
  "Peculiar",
  "Sparkly",
  "Galactic",
  "Thunderous",
  "Bashful",
  "Turbo",
  "Nimble",
  "Sassy",
  "Heroic",
  "Zany",
  "Cosmic",
  "Plucky",
  "Mysterious",
  "Dramatic",
  "Caffeinated",
  "Unstoppable",
  "Polite",
  "Rebellious",
  "Glorious",
  "Quantum",
  "Fabulous",
  "Stealthy",
  "Wise",
  "Bouncy",
  "Legendary",
];

const ANIMALS = [
  "Zebra",
  "Pigeon",
  "Penguin",
  "Otter",
  "Badger",
  "Llama",
  "Narwhal",
  "Walrus",
  "Hedgehog",
  "Platypus",
  "Flamingo",
  "Axolotl",
  "Capybara",
  "Moose",
  "Puffin",
  "Ferret",
  "Pangolin",
  "Octopus",
  "Wombat",
  "Koala",
  "Gecko",
  "Toucan",
  "Yak",
  "Lobster",
  "Mongoose",
  "Sloth",
  "Raccoon",
  "Hamster",
  "Owl",
  "Seal",
  "Heron",
  "Goose",
  "Lemur",
  "Tortoise",
  "Panda",
  "Alpaca",
  "Mole",
  "Crab",
  "Squid",
  "Bison",
];

/** Distinct, readable on both light and dark backgrounds. */
export const PARTICIPANT_COLOURS = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#14a5a5",
  "#f032e6",
  "#7a9e00",
  "#c27c0e",
  "#008080",
  "#9a6324",
  "#800000",
  "#2f8f5b",
  "#5b5bd6",
  "#d6336c",
  "#1c7ed6",
  "#e8590c",
  "#6741d9",
  "#0b7285",
  "#a61e4d",
];

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)] as T;
}

/** A name not already in `taken` (falls back to a numbered suffix). */
export function randomName(taken: ReadonlySet<string>, rand: () => number = Math.random): string {
  for (let i = 0; i < 50; i++) {
    const name = `${pick(ADJECTIVES, rand)} ${pick(ANIMALS, rand)}`;
    if (!taken.has(name)) return name;
  }
  const base = `${pick(ADJECTIVES, rand)} ${pick(ANIMALS, rand)}`;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** The least-used colour, so colours stay distinct for as long as possible. */
export function nextColour(used: readonly string[]): string {
  const counts = new Map(PARTICIPANT_COLOURS.map((c) => [c, 0]));
  for (const c of used) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = PARTICIPANT_COLOURS[0] as string;
  let bestCount = Infinity;
  for (const [c, n] of counts) {
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}
