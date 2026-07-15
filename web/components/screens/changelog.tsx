"use client";

import { Sparkles, Wrench, Zap, MessageCircle, Spade } from "lucide-react";
import { RELEASES, TEAM, type ChangeTag } from "@/lib/changelog";
import { openTelegramLink } from "@/lib/telegram";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TAG: Record<ChangeTag, { icon: React.ElementType; color: string; label: string }> = {
  new: { icon: Sparkles, color: "text-gold", label: "New" },
  improved: { icon: Zap, color: "text-[#3fa9ff]", label: "Improved" },
  fixed: { icon: Wrench, color: "text-win", label: "Fixed" },
};

export function ChangelogScreen() {
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-gold/25 to-secondary text-gold">
          <Spade className="size-6" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold">What&apos;s New</h1>
          <p className="text-xs text-muted-foreground">
            Every update to Poker CM, newest first.
          </p>
        </div>
      </div>

      {RELEASES.map((r, i) => (
        <Card key={r.version} className="mb-3 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-extrabold text-gold">
              v{r.version}
            </span>
            <span className="text-sm font-bold">{r.title}</span>
            {i === 0 && (
              <span className="rounded-full bg-win/20 px-2 py-0.5 text-[10px] font-bold uppercase text-win">
                Latest
              </span>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">{r.date}</span>
          </div>
          <div className="space-y-2">
            {r.changes.map((c, k) => {
              const t = TAG[c.tag];
              const Icon = t.icon;
              return (
                <div key={k} className="flex items-start gap-2.5">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${t.color}`} />
                  <span className="text-[13px] leading-snug text-muted-foreground">
                    {c.text}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {/* team intro */}
      <Card className="mt-4 items-center gap-2 p-5 text-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Made by
        </div>
        <div className="text-lg font-extrabold text-gold">{TEAM.name}</div>
        <p className="max-w-xs text-[12px] leading-snug text-muted-foreground">
          {TEAM.blurb}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() =>
            openTelegramLink(`https://t.me/${TEAM.handle.replace("@", "")}`)
          }
        >
          <MessageCircle className="size-4" /> Message {TEAM.handle}
        </Button>
      </Card>
    </>
  );
}
