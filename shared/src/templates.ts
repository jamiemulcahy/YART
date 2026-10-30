export interface LaneTemplate {
  id: string;
  name: string;
  lanes: { title: string; description: string }[];
}

export const LANE_TEMPLATES: LaneTemplate[] = [
  {
    id: "mad-sad-glad",
    name: "Mad / Sad / Glad",
    lanes: [
      { title: "Mad", description: "What frustrated you?" },
      { title: "Sad", description: "What disappointed you?" },
      { title: "Glad", description: "What made you happy?" },
    ],
  },
  {
    id: "4ls",
    name: "Liked / Learned / Lacked / Longed for",
    lanes: [
      { title: "Liked", description: "What did you enjoy?" },
      { title: "Learned", description: "What did you learn?" },
      { title: "Lacked", description: "What was missing?" },
      { title: "Longed for", description: "What do you wish we had?" },
    ],
  },
  {
    id: "start-stop-continue",
    name: "Start / Stop / Continue",
    lanes: [
      { title: "Start", description: "What should we start doing?" },
      { title: "Stop", description: "What should we stop doing?" },
      { title: "Continue", description: "What should we keep doing?" },
    ],
  },
  {
    id: "well-improve",
    name: "Went well / To improve",
    lanes: [
      { title: "Went well", description: "What went well?" },
      { title: "To improve", description: "What could be better?" },
    ],
  },
  { id: "blank", name: "Blank", lanes: [] },
];

export const LANE_COLOURS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
];
