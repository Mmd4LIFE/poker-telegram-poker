"use client";

import { useEffect, useState } from "react";
import { Brain, Lock, Loader2, FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* Skill = how WELL you play (Decision Quality, luck-free), distinct from XP level
   (how MUCH you play). Experimental, gated to level 10+, first player-facing use of
   the DQ score. */
export function SkillScreen() {
  const [me, setMe] = useState<any>(null);
  const [board, setBoard] = useState<any>(null);

  useEffect(() => {
    api.skill().then(setMe).catch(() => {});
    api.skillBoard().then(setBoard).catch(() => {});
  }, []);

  if (!me) return <Loader2 className="mx-auto mt-8 size-6 animate-spin text-gold" />;

  if (me.locked)
    return (
      <Card className="items-center gap-2 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-secondary">
          <Lock className="size-6 text-muted-foreground" />
        </div>
        <div className="text-sm font-extrabold">Skill rating locked</div>
        <div className="text-xs text-muted-foreground">
          Unlocks at <b className="text-foreground">level {me.unlock_level}</b> —
          you&apos;re level {me.level}.
        </div>
      </Card>
    );

  const g = me.grade;

  return (
    <>
      <Card className="mb-3 items-center gap-2 p-5 text-center">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <FlaskConical className="size-3" /> Experimental
        </div>

        {me.ready && g ? (
          <>
            <div
              className="grid size-16 place-items-center rounded-2xl"
              style={{ backgroundColor: g.color + "22", color: g.color }}
            >
              <Brain className="size-8" />
            </div>
            <div className="text-2xl font-extrabold" style={{ color: g.color }}>
              {g.name}
            </div>
            <div className="text-xs text-muted-foreground">
              Skill level {g.level} · DQ {me.dq}
            </div>
            {g.next && (
              <>
                <div className="mt-1 h-2 w-full max-w-52 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(g.progress * 100)}%`,
                      backgroundColor: g.color,
                    }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {g.next} at DQ {g.next_at}
                </div>
              </>
            )}
            <p className="mt-1 max-w-64 text-[11px] leading-snug text-muted-foreground">
              Decision Quality grades your choices by expected value — not whether they
              won. It measures how well you play, not how lucky you run.
            </p>
          </>
        ) : (
          <>
            <div className="grid size-14 place-items-center rounded-2xl bg-secondary">
              <Brain className="size-7 text-muted-foreground" />
            </div>
            <div className="text-sm font-extrabold">Calibrating…</div>
            <div className="text-xs text-muted-foreground">
              Play <b className="text-foreground">{me.min_decisions - me.decisions} more decisions</b> to reveal your skill grade.
            </div>
            <div className="mt-1 h-1.5 w-full max-w-52 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gold"
                style={{ width: `${Math.round((100 * me.decisions) / me.min_decisions)}%` }}
              />
            </div>
          </>
        )}
      </Card>

      <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Skill leaderboard
      </h2>
      {!board ? (
        <Loader2 className="mx-auto mt-4 size-5 animate-spin text-gold" />
      ) : board.board?.length ? (
        <Card className="p-2">
          {board.board.map((r: any) => (
            <div
              key={r.user_id}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-2",
                r.is_me && "bg-gold/15",
              )}
            >
              <span className="w-6 text-center text-xs font-bold tabular-nums text-muted-foreground">
                {r.rank}
              </span>
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-secondary text-gold">
                  <AvatarIcon code={r.avatar} color={r.avatar_color} className="size-4" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-sm font-semibold"
                  style={r.name_color ? { color: r.name_color } : undefined}
                >
                  {r.name}
                </div>
                <div
                  className="text-[10px] font-bold uppercase"
                  style={{ color: r.grade_color }}
                >
                  {r.grade}
                </div>
              </div>
              <span className="text-sm font-extrabold tabular-nums">{r.dq}</span>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="items-center gap-1 p-6 text-center">
          <Brain className="size-7 text-muted-foreground" />
          <div className="text-sm font-semibold">No rated players yet</div>
          <div className="text-xs text-muted-foreground">
            Level-{board.unlock_level}+ players show up here once they&apos;ve played
            enough hands.
          </div>
        </Card>
      )}
    </>
  );
}
