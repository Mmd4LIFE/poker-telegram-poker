/* Player-facing "What's New" — curated highlights, friendlier than the technical
   root CHANGELOG.md. Keep newest first. `tag` drives the icon + accent. */

export type ChangeTag = "new" | "improved" | "fixed";

export interface Release {
  version: string;
  date: string;
  title: string;
  changes: { tag: ChangeTag; text: string }[];
}

export const TEAM = {
  name: "Mmd",
  handle: "@mmdsvm",
  telegramId: 592354162,
  blurb:
    "Poker CM is built and run by one person — design, engine, economy, and every pixel. Feedback and bug reports are always welcome; message me directly.",
};

export const RELEASES: Release[] = [
  {
    version: "0.9",
    date: "2026-07-15",
    title: "Skill, measured",
    changes: [
      { tag: "new", text: "Your Skill rating in Ranks — a Grade (Rookie → Master) and a cumulative Skill Level that never drops." },
      { tag: "new", text: "Every decision is now scored by how good it was, not whether it won. Luck doesn't count." },
      { tag: "new", text: "A skill leaderboard of the best decision-makers." },
    ],
  },
  {
    version: "0.8",
    date: "2026-07-14",
    title: "The Daily League",
    changes: [
      { tag: "new", text: "Compete in a daily league — play Sit & Gos, climb from Bronze to Diamond, promote at midnight." },
      { tag: "new", text: "Earn League Shards toward the exclusive, ultra-rare Champion card skin." },
      { tag: "new", text: "See your live finishing place and LP right at the table." },
      { tag: "fixed", text: "You now get your league points the moment you're knocked out." },
    ],
  },
  {
    version: "0.7",
    date: "2026-07-13",
    title: "Smarter opponents",
    changes: [
      { tag: "improved", text: "Bots now read your betting and play far sharper — no more paying off every raise." },
      { tag: "new", text: "Poker DNA: a radar of your playing style, from real hands." },
    ],
  },
  {
    version: "0.6",
    date: "2026-07-12",
    title: "Collect & trade",
    changes: [
      { tag: "new", text: "Card skins — dress up any of the 52 cards, with rare serial-numbered editions." },
      { tag: "new", text: "A player market to buy and sell skins, with real floor prices." },
      { tag: "new", text: "A notification bell for your sales, purchases, and more." },
    ],
  },
  {
    version: "0.5",
    date: "2026-07-11",
    title: "Rewards & shop",
    changes: [
      { tag: "new", text: "A 7-day daily reward ladder — day 7 pays gems." },
      { tag: "new", text: "Buy coins and gems with Telegram Stars or TON, and open loot boxes." },
      { tag: "new", text: "Customize your profile with name and avatar colors." },
    ],
  },
  {
    version: "0.4",
    date: "2026-07-10",
    title: "Squads & friends",
    changes: [
      { tag: "new", text: "Form a Squad, chat, and climb the squad leaderboard together." },
      { tag: "new", text: "Add friends, message them, and compare stats." },
    ],
  },
  {
    version: "0.1",
    date: "2026-07-09",
    title: "Poker CM is live",
    changes: [
      { tag: "new", text: "No-Limit Texas Hold'em inside Telegram — real-time tables, rooms, and AI opponents." },
    ],
  },
];
