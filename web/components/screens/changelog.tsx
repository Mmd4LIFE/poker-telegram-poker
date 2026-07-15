"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Wrench,
  Zap,
  MessageCircle,
  Spade,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { openTelegramLink } from "@/lib/telegram";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

      {releases.map((r, i) => (
        <Card key={r.version + i} className="mb-3 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-extrabold text-gold">
              {r.version.toLowerCase() === "unreleased" ? "Next" : `v${r.version}`}
            </span>
            {r.title && <span className="text-sm font-bold">{r.title}</span>}
            {i === 0 && r.version.toLowerCase() !== "unreleased" && (
              <span className="rounded-full bg-win/20 px-2 py-0.5 text-[10px] font-bold uppercase text-win">
                Latest
              </span>
            )}
            {r.date && (
              <span className="ml-auto text-[11px] text-muted-foreground">{r.date}</span>
            )}
          </div>
          <div className="space-y-2">
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
        </Card>
      ))}

      {releases.length === 0 && (
        <Card className="items-center gap-1 p-8 text-center">
          <Spade className="size-7 text-muted-foreground" />
          <div className="text-sm font-semibold">No release notes yet</div>
        </Card>
      )}

      {team && (
        <Card className="mt-4 items-center gap-2 p-5 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Made by
          </div>
          <div className="text-lg font-extrabold text-gold">{team.name}</div>
          <p className="max-w-xs text-[12px] leading-snug text-muted-foreground">
            {team.blurb}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={() =>
              openTelegramLink(`https://t.me/${String(team.handle).replace("@", "")}`)
            }
          >
            <MessageCircle className="size-4" /> Message {team.handle}
          </Button>
        </Card>
      )}
    </>
  );
}
