import { cn } from "@/lib/utils";

export function OnlineDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 rounded-full ring-2 ring-background",
        online ? "bg-win" : "bg-muted-foreground/40",
        className,
      )}
    />
  );
}
