import { cn } from "@/lib/utils";

/** Renders a username with its equipped color. */
export function PlayerName({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(color && "font-bold", className)}
      style={color ? { color } : undefined}
    >
      {name}
    </span>
  );
}
