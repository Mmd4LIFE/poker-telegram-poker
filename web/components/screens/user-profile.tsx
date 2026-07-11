"use client";

import { useEffect, useState } from "react";
import { UserPlus, UserMinus, Check, TrendingUp, TrendingDown, Trophy, Flame } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import type { HistoryItem } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { OnlineDot } from "@/components/online-dot";

interface Profile {
  id: number;
  display_name: string;
  username: string | null;
  avatar: string;
  level: number;
  degree_label: string;
  online: boolean;
  hands_won: number;
  hands_played: number;
  total_won: number;
  win_rate: number;
  biggest_pot: number;
  best_win_streak: number;
  games_played: number;
  relation: string;
  history: HistoryItem[];
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-secondary/60 p-3">
      <Icon className="size-4 text-gold" />
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function UserProfileScreen() {
  const { profileId, go } = useApp();
  const [p, setP] = useState<Profile | null>(null);

  useEffect(() => {
    if (profileId) api.userProfile(profileId).then(setP as never).catch(() => go("friends"));
  }, [profileId, go]);

  async function toggleFriend() {
    if (!p) return;
    try {
      if (p.relation === "friends") {
        await api.friendRemove(p.id);
        toast("Removed friend");
      } else if (p.relation === "incoming") {
        await api.friendAccept(p.id);
        toast.success("Friend added");
        notify("success");
      } else {
        const r = await api.friendRequest(p.id);
        toast.success(r.status === "friends" ? "You're now friends!" : "Request sent");
        notify("success");
      }
      setP(await api.userProfile(p.id) as never);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!p) {
    return (
      <>
        <PageHeader title="Player" onBack={() => go("friends")} />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </>
    );
  }

  const friendBtn =
    p.relation === "friends" ? (
      <Button variant="outline" onClick={toggleFriend}>
        <UserMinus className="size-4" /> Unfriend
      </Button>
    ) : p.relation === "incoming" ? (
      <Button onClick={toggleFriend}>
        <Check className="size-4" /> Accept
      </Button>
    ) : p.relation === "outgoing" ? (
      <Button variant="outline" disabled>
        Requested
      </Button>
    ) : (
      <Button onClick={toggleFriend}>
        <UserPlus className="size-4" /> Add friend
      </Button>
    );

  return (
    <>
      <PageHeader title="Player" onBack={() => go("friends")} />

      <Card className="items-center p-6 text-center">
        <div className="relative mx-auto">
          <Avatar className="size-20 border-2 border-gold/40">
            <AvatarFallback className="bg-secondary text-4xl">{p.avatar}</AvatarFallback>
          </Avatar>
          <OnlineDot online={p.online} className="absolute bottom-1 right-1 size-4" />
        </div>
        <div className="mt-2 text-xl font-extrabold">{p.display_name}</div>
        <div className="text-sm text-muted-foreground">
          {p.degree_label} · {p.online ? "Online" : "Offline"}
        </div>
        <div className="mt-4 w-full">{friendBtn}</div>
      </Card>

      <div className="mt-3 flex gap-2">
        <Stat icon={Trophy} label="Total won" value={fmt(p.total_won)} />
        <Stat icon={TrendingUp} label="Win rate" value={`${p.win_rate}%`} />
        <Stat icon={Flame} label="Best streak" value={String(p.best_win_streak)} />
      </div>

      <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Recent Hands
      </h2>
      <Card className="p-4">
        {p.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hands played yet.</p>
        ) : (
          p.history.map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0"
            >
              {h.net >= 0 ? (
                <TrendingUp className="size-4 text-win" />
              ) : (
                <TrendingDown className="size-4 text-lose" />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">
                  {h.hand_name || "—"}{" "}
                  <span className="text-xs text-muted-foreground">#{h.room_code}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">Pot {fmt(h.pot)}</div>
              </div>
              <span
                className={h.net >= 0 ? "font-bold text-win" : "font-bold text-lose"}
              >
                {h.net >= 0 ? "+" : "-"}
                {fmt(Math.abs(h.net))}
              </span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
