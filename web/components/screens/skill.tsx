"use client";

import { useEffect, useState } from "react";
import { Brain, Lock, Loader2, FlaskConical, Info } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
      <Card className="relative mb-3 items-center gap-2 p-5 text-center">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <FlaskConical className="size-3" /> Experimental
        </div>

        {me.roadmap?.length > 0 && lvl && (
          <Dialog>
            <DialogTrigger asChild>
              <button
                aria-label="Level roadmap"
                className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full text-muted-foreground active:scale-95 hover:text-foreground"
              >
                <Info className="size-5" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Level roadmap</DialogTitle>
              </DialogHeader>
              <Roadmap roadmap={me.roadmap} sp={lvl.sp} />
            </DialogContent>
          </Dialog>
        )}

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

/* The full 15-level ladder. The whole point is SCALE: skill points needed grow from
   100 to 140,000, so the bars are drawn to a linear scale — the top levels tower over
   the early ones, which is the honest picture. A dashed line marks where you are. */
function Roadmap({ roadmap, sp }: { roadmap: any[]; sp: number }) {
  const max = Math.max(...roadmap.map((r) => r.sp_required)) || 1;
  const youPct = Math.max(0, Math.min(100, (sp / max) * 100));
  return (
    <div className="space-y-4">
      {/* the scale chart */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Skill points to reach each level
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            you: <b className="text-gold">{sp.toLocaleString()}</b>
          </span>
        </div>
        <div className="rounded-lg bg-secondary/40 px-2 pb-1 pt-2">
          {/* plot area — bars and the reference line share this exact height, so they line up */}
          <div className="relative h-36">
            <div className="flex h-full items-end gap-[3px]">
              {roadmap.map((r) => (
                <div
                  key={r.level}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${Math.max(1.5, (r.sp_required / max) * 100)}%`,
                    backgroundColor: r.color,
                    opacity: r.reached ? 1 : 0.35,
                    outline: r.current ? `2px solid ${r.color}` : undefined,
                    outlineOffset: r.current ? "1px" : undefined,
                  }}
                  title={`Level ${r.level} · ${r.tier} · ${r.sp_required.toLocaleString()} SP`}
                />
              ))}
            </div>
            {/* "you are here" reference line, on the same scale as the bars */}
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gold"
              style={{ bottom: `${youPct}%` }}
            >
              <span className="absolute -top-[7px] right-0 rounded-sm bg-gold px-1 text-[8px] font-extrabold uppercase leading-tight text-black">
                you
              </span>
            </div>
          </div>
          {/* level labels, aligned under the bars */}
          <div className="mt-1 flex gap-[3px]">
            {roadmap.map((r) => (
              <span
                key={r.level}
                className={cn(
                  "flex-1 text-center text-[8px] tabular-nums",
                  r.current ? "font-extrabold text-gold" : "text-muted-foreground",
                )}
              >
                {r.level}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[9px] uppercase text-muted-foreground">
          <span>quick early levels</span>
          <span>a long climb up top</span>
        </div>
      </div>

      {/* the numbers, for reference */}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-white/5">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[9px] uppercase text-muted-foreground">
              <th className="px-2 py-1.5 font-semibold">Lvl</th>
              <th className="px-2 py-1.5 font-semibold">Tier</th>
              <th className="px-2 py-1.5 text-right font-semibold">Total SP</th>
              <th className="px-2 py-1.5 text-right font-semibold">Step</th>
            </tr>
          </thead>
          <tbody>
            {roadmap.map((r) => (
              <tr
                key={r.level}
                className={cn(
                  "border-t border-white/5",
                  r.current && "bg-gold/15",
                )}
              >
                <td className="px-2 py-1.5">
                  <span
                    className="grid size-5 place-items-center rounded text-[10px] font-extrabold"
                    style={{
                      backgroundColor: r.reached ? r.color : r.color + "22",
                      color: r.reached ? "#000" : r.color,
                    }}
                  >
                    {r.level}
                  </span>
                </td>
                <td className="px-2 py-1.5" style={{ color: r.color }}>
                  <span className="font-semibold">{r.tier}</span>
                  {r.current && (
                    <span className="ml-1 text-[8px] font-extrabold uppercase text-gold">• you</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                  {r.sp_required.toLocaleString()}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.step > 0 ? `+${r.step.toLocaleString()}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
