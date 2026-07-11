export interface UserProfile {
  id: number;
  telegram_id: number | null;
  display_name: string;
  handle: string | null;
  username: string | null;
  avatar: string;
  name_color: string;
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
  | "join"
  | "friends"
  | "user"
  | "customize";

export interface FriendCard {
  id: number;
  display_name: string;
  handle?: string | null;
  username: string | null;
  avatar: string;
  name_color?: string;
  level: number;
  degree: string;
  degree_label: string;
  online: boolean;
  hands_won: number;
  hands_played: number;
  total_won: number;
  win_rate: number;
  relation?: string;
}

export interface HistoryItem {
  room_code: string;
  hand_no: number;
  net: number;
  won: boolean;
  hand_name: string;
  pot: number;
  at: string | null;
}
