import type { LucideIcon } from "lucide-react";
import {
  User, Cat, Dog, Bird, Fish, Rabbit, Ghost, Smile, Dice5, Club,
  Squirrel, Turtle, Snail, Bug, Rocket, Bot, Brain, Target, Anchor, Flame,
  Crown, Gem, Skull, Diamond, Swords, Zap, Star, Trophy,
  ThumbsUp, ThumbsDown, Laugh, Angry, Frown, PartyPopper, Heart, Hand, Dumbbell, Clover,
} from "lucide-react";

export const AVATAR_ICONS: Record<string, LucideIcon> = {
  user: User, cat: Cat, dog: Dog, bird: Bird, fish: Fish, rabbit: Rabbit,
  ghost: Ghost, smile: Smile, dice: Dice5, club: Club,
  squirrel: Squirrel, turtle: Turtle, snail: Snail, bug: Bug, rocket: Rocket,
  bot: Bot, brain: Brain, target: Target, anchor: Anchor, flame: Flame,
  crown: Crown, gem: Gem, skull: Skull, diamond: Diamond, swords: Swords,
  zap: Zap, star: Star, trophy: Trophy,
};

export function avatarIcon(code?: string | null): LucideIcon {
  return (code && AVATAR_ICONS[code]) || User;
}

export function AvatarIcon({
  code,
  color,
  className,
}: {
  code?: string | null;
  color?: string | null;
  className?: string;
}) {
  const Icon = avatarIcon(code);
  return <Icon className={className} style={color ? { color } : undefined} />;
}

// --- Emotes (icon-based) ---
export const EMOTES: string[] = [
  "thumbs_up", "thumbs_down", "laugh", "angry", "cry", "fire",
  "party", "heart", "clap", "muscle", "skull", "lucky",
];

export const EMOTE_ICONS: Record<string, LucideIcon> = {
  thumbs_up: ThumbsUp, thumbs_down: ThumbsDown, laugh: Laugh, angry: Angry,
  cry: Frown, fire: Flame, party: PartyPopper, heart: Heart, clap: Hand,
  muscle: Dumbbell, skull: Skull, lucky: Clover,
};
