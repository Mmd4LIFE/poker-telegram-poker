export interface UserProfile {
  id: number;
  telegram_id: number | null;
  display_name: string;
  username: string | null;
  avatar: string;
  coins: number;
  gems: number;
  level: number;
  xp: number;
  degree: string;
  degree_label: string;
  level_progress: number;
  next_level_xp: number;
  hands_played: number;
  hands_won: number;
  games_played: number;
  biggest_pot: number;
  total_won: number;
  win_rate: number;
  best_win_streak: number;
  daily_streak: number;
  referral_count: number;
  referral_earned: number;
  is_bot: boolean;
  is_admin: boolean;
}

export interface RoomSummary {
  code: string;
  name: string;
  status: string;
  players: number;
  max_players: number;
  small_blind: number;
  big_blind: number;
  min_buy_in: number;
  max_buy_in: number;
  is_private: boolean;
  allow_bots: boolean;
  stack?: number;
}

export type View =
  | "lobby"
  | "quests"
  | "shop"
  | "leaderboard"
  | "profile"
  | "invite"
  | "admin"
  | "squad"
  | "create"
  | "join";
