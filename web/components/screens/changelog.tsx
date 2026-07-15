"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Wrench,
  Zap,
  MessageCircle,
  Spade,
  Loader2,
  ChevronDown,
  Lightbulb,
} from "lucide-react";
import { api } from "@/lib/api";
import { openTelegramLink } from "@/lib/telegram";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* "What's New" — rendered from the API, which parses the canonical CHANGELOG.md.
   One source of truth: a release is added in CHANGELOG.md and nowhere else. */

const TAG: Record<string, { icon: React.ElementType; color: string }> = {
  new: { icon: Sparkles, color: "text-gold" },
  improved: { icon: Zap, color: "text-[#3fa9ff]" },
  fixed: { icon: Wrench, color: "text-win" },
};

export function ChangelogScreen() {
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({}); // all collapsed

  useEffect(() => {
    api.changelog().then(setD).catch(() => setD({ releases: [] }));
  }, []);

  if (!d) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-gold" />;

  const releases: any[] = d.releases || [];
  const team = d.team;

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

      {/* what's next is up to the players — a real CTA, not a mystery "Next" section */}
      {team && (
        <Card className="mb-4 gap-3 border-gold/30 bg-gradient-to-br from-gold/15 to-secondary p-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="size-5 text-gold" />
            <span className="text-sm font-extrabold">What should we build next?</span>
          </div>
          <p className="text-[12px] leading-snug text-muted-foreground">
            Poker CM is built by one person — {team.name} ({team.handle}) — and shaped by
            your ideas. Got a feature you want, or found a bug? Message me directly.
          </p>
          <Button
            className="w-full"
            onClick={() =>
              openTelegramLink(`https://t.me/${String(team.handle).replace("@", "")}`)
            }
          >
            <MessageCircle className="size-4" /> Message the creator
          </Button>
        </Card>
      )}

      {releases.map((r, i) => {
        const isOpen = !!open[r.version];
        return (
          <Card key={r.version + i} className="mb-2 gap-0 p-0">
            <button
              onClick={() => setOpen((o) => ({ ...o, [r.version]: !o[r.version] }))}
              className="flex items-center gap-2 p-4 text-left active:opacity-80"
            >
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-extrabold text-gold">
                v{r.version}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold">{r.title}</span>
                  {i === 0 && (
                    <span className="rounded-full bg-win/20 px-2 py-0.5 text-[10px] font-bold uppercase text-win">
                      Latest
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {r.date} · {r.changes.length} change{r.changes.length === 1 ? "" : "s"}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-white/5 px-4 py-3">
                {r.changes.map((c: any, k: number) => {
                  const t = TAG[c.tag] || TAG.new;
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
            )}
          </Card>
        );
      })}

      {releases.length === 0 && (
        <Card className="items-center gap-1 p-8 text-center">
          <Spade className="size-7 text-muted-foreground" />
          <div className="text-sm font-semibold">No release notes yet</div>
        </Card>
      )}
    </>
  );
}
