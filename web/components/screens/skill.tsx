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
  const lvl = me.skill_level;

  return (
    <>
      <Card className="mb-3 items-center gap-2 p-5 text-center">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <FlaskConical className="size-3" /> Experimental
        </div>

        {lvl && (
          <>
            {/* the cumulative Skill Level badge — Clash-Royale-style, never drops */}
            <div
              className="grid size-16 place-items-center rounded-2xl text-2xl font-extrabold"
              style={{ backgroundColor: lvl.color + "22", color: lvl.color, border: `2px solid ${lvl.color}` }}
            >
              {lvl.level}
            </div>
            <div className="text-lg font-extrabold" style={{ color: lvl.color }}>
              {lvl.tier} · Level {lvl.level}
            </div>
            <div className="text-xs text-muted-foreground">
              {lvl.sp.toLocaleString()} skill points
              {me.ready && g ? ` · ${g.name}` : ""}
            </div>
            <div className="mt-1 h-2 w-full max-w-52 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(lvl.progress * 100)}%`, backgroundColor: lvl.color }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {lvl.next_at
                ? `Level ${lvl.level + 1} at ${lvl.next_at.toLocaleString()} SP`
                : `Max level ${lvl.max_level}`}
            </div>
            <p className="mt-1 max-w-64 text-[11px] leading-snug text-muted-foreground">
              You earn skill points for good decisions — graded by expected value, not by
              whether they won. It never drops, and the top levels are a long climb.
            </p>
          </>
        )}
      </Card>

      {me.roadmap?.length > 0 && (
        <>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Level roadmap
          </h2>
          <Card className="mb-4 gap-0 p-2">
            {me.roadmap.map((r: any) => {
              const need = lvl && !r.reached ? r.sp_required - lvl.sp : 0;
              return (
                <div
                  key={r.level}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5",
                    r.current && "bg-gold/15",
                  )}
                >
                  <div
                    className="grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-extrabold"
                    style={{
                      backgroundColor: r.color + (r.reached ? "" : "22"),
                      color: r.reached ? "#000" : r.color,
                      border: `1px solid ${r.color}`,
                    }}
                  >
                    {r.level}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold" style={{ color: r.color }}>
                        {r.tier}
                      </span>
                      {r.current && (
                        <span className="rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-black">
                          You are here
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.step > 0 ? `+${r.step.toLocaleString()} SP from Lv ${r.level - 1}` : "Starting level"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-extrabold tabular-nums">
                      {r.sp_required.toLocaleString()}
                    </div>
                    <div className="text-[9px] uppercase text-muted-foreground">
                      {r.reached ? "reached" : `${need.toLocaleString()} to go`}
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

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
              <div
                className="grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-extrabold"
                style={{ backgroundColor: r.level_color + "22", color: r.level_color, border: `1px solid ${r.level_color}` }}
              >
                {r.skill_level}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-sm font-semibold"
                  style={r.name_color ? { color: r.name_color } : undefined}
                >
                  {r.name}
                </div>
                {r.grade && (
                  <div className="text-[10px] font-bold uppercase" style={{ color: r.grade_color }}>
                    {r.grade}
                  </div>
                )}
              </div>
              <span className="text-sm font-extrabold tabular-nums">
                {r.skill_sp.toLocaleString()}
              </span>
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
