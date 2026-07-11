"use client";

import { useEffect, useState } from "react";
import { Share2, Copy, Users, Gift, Target } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { openTelegramLink, notify } from "@/lib/telegram";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function InviteScreen() {
  const { go } = useApp();
  const [r, setR] = useState<any>(null);

  useEffect(() => {
    api.referral().then(setR).catch(() => {});
  }, []);

  const shareText = "Come play Poker CM with me — grab your welcome chips!";
  function share() {
    if (!r?.link) return toast("Invite link not ready");
    openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(shareText)}`,
    );
  }
  async function copy() {
    if (!r?.link) return;
    try {
      await navigator.clipboard.writeText(r.link);
      toast.success("Link copied!");
      notify("success");
    } catch {
      share();
    }
  }

  const nm = r?.next_milestone;
  return (
    <>
      <PageHeader title="Invite & Earn" onBack={() => go("profile")} />
      {!r ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Card className="items-center p-6 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-secondary">
              <Users className="size-6 text-gold" />
            </div>
            <div className="mt-2 font-extrabold">Invite friends, earn chips</div>
            <p className="mt-1 text-sm text-muted-foreground">
              You get <b className="text-gold">{fmt(r.reward_per_friend)}</b> per friend.
              They start with <b className="text-gold">{fmt(r.friend_bonus)}</b>.
            </p>
          </Card>

          <div className="mt-3 flex gap-3">
            <Card className="flex-1 items-center p-4 text-center">
              <div className="text-2xl font-extrabold">{r.referral_count}</div>
              <div className="text-xs text-muted-foreground">Friends joined</div>
            </Card>
            <Card className="flex-1 items-center p-4 text-center">
              <div className="text-2xl font-extrabold text-gold">{fmt(r.referral_earned)}</div>
              <div className="text-xs text-muted-foreground">Chips earned</div>
            </Card>
          </div>

          {nm && (
            <Card className="mt-3 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1">
                  <Target className="size-4 text-gold" /> Next bonus at {nm.at} friends
                </span>
                <span className="text-xs text-muted-foreground">{nm.remaining} to go</span>
              </div>
              <Progress
                value={Math.round((1 - nm.remaining / nm.at) * 100)}
                className="mt-2"
              />
              <div className="mt-1.5 text-xs text-muted-foreground">
                Reward: {fmt(nm.coins)} coins{nm.gems ? ` · ${nm.gems} gems` : ""}
              </div>
            </Card>
          )}

          <Button className="mt-3 w-full font-bold" size="lg" onClick={share}>
            <Share2 className="size-4" /> Share invite link
          </Button>
          <Button variant="secondary" className="mt-2.5 w-full" size="lg" onClick={copy}>
            <Copy className="size-4" /> Copy link
          </Button>
          <div className="mt-3 break-all rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
            {r.link || "Link unavailable"}
          </div>

          <h2 className="mb-2 mt-5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Gift className="size-3.5" /> Milestone bonuses
          </h2>
          <Card className="p-4">
            {r.milestones.map((m: any) => (
              <div
                key={m.at}
                className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0"
              >
                <Target className="size-4 text-gold" />
                <span className="flex-1 text-sm">{m.at} friends</span>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-gold">
                  {fmt(m.coins)}
                  {m.gems ? ` · ${m.gems} gems` : ""}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
