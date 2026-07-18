"use client";

import { useEffect, useState } from "react";
import {
  UserPlus,
  UserMinus,
  Check,
  MessageCircle,
  TrendingUp,
  TrendingDown,
  Trophy,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { fmt, api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify, openTelegramLink } from "@/lib/telegram";
import type { HistoryItem } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { OnlineDot } from "@/components/online-dot";

interface Profile {
  id: number;
  display_name: string;
  handle?: string | null;
  username?: string | null;
  name_color?: string;
  avatar: string;
  avatar_color?: string;
  level: number;
  degree_label: string;
  online: boolean;
  total_won: number;
  win_rate: number;
  best_win_streak: number;
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

export function UserProfileSheet() {
  const { profileId, closeUser } = useApp();
  const [p, setP] = useState<Profile | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setP(null);
    if (profileId) api.userProfile(profileId).then(setP as never).catch(() => closeUser());
  }, [profileId, closeUser]);

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
      setP((await api.userProfile(p.id)) as never);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doRemove() {
    if (!p) return;
    setRemoving(true);
    try {
      await api.friendRemove(p.id);
      toast("Removed friend");
      setConfirmRemove(false);
      setP((await api.userProfile(p.id)) as never);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  function message() {
    if (!p) return;
    if (p.username) openTelegramLink(`https://t.me/${p.username}`);
    else toast("This player can't be messaged directly");
  }

  const friendBtn = p && (
    p.relation === "friends" ? (
      <div className="space-y-2">
        <Button className="w-full" onClick={message}>
          <MessageCircle className="size-4" /> Message
        </Button>
        <button
          className="w-full text-center text-xs text-muted-foreground"
          onClick={() => setConfirmRemove(true)}
        >
          Remove friend
        </button>
      </div>
    ) : p.relation === "incoming" ? (
      <Button className="w-full" onClick={toggleFriend}>
        <Check className="size-4" /> Accept request
      </Button>
    ) : p.relation === "outgoing" ? (
      <Button variant="outline" className="w-full" disabled>
        Requested
      </Button>
    ) : (
      <Button className="w-full" onClick={toggleFriend}>
        <UserPlus className="size-4" /> Add friend
      </Button>
    )
  );

  return (
    <Sheet open={profileId !== null} onOpenChange={(o) => !o && closeUser()}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Player</SheetTitle>
        </SheetHeader>
        {!p ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="px-4 pb-6">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <Avatar className="size-20 border-2 border-gold/40">
                  <AvatarFallback className="bg-secondary text-gold">
                    <AvatarIcon code={p.avatar} color={p.avatar_color} className="size-9" />
                  </AvatarFallback>
                </Avatar>
                <OnlineDot online={p.online} className="absolute bottom-1 right-1 size-4" />
              </div>
              <div
                className="mt-2 text-xl font-extrabold"
                style={p.name_color ? { color: p.name_color } : undefined}
              >
                {p.display_name}
              </div>
              <div className="text-sm text-muted-foreground">
                {p.handle ? `${p.handle} · ` : ""}
                Level {p.level} · {p.online ? "Online" : "Offline"}
              </div>
            </div>

            <div className="mt-4">{friendBtn}</div>

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
                  <div key={i} className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0">
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
                    <span className={h.net >= 0 ? "font-bold text-win" : "font-bold text-lose"}>
                      {h.net >= 0 ? "+" : "-"}
                      {fmt(Math.abs(h.net))}
                    </span>
                  </div>
                ))
              )}
            </Card>
          </div>
        )}
      </SheetContent>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove friend?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {p ? (
              <>
                You&apos;ll no longer be friends with{" "}
                <b className="text-foreground">{p.display_name}</b>. You can send a
                new request anytime.
              </>
            ) : null}
          </p>
          <DialogFooter className="mt-2 flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmRemove(false)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={doRemove}
              disabled={removing}
            >
              <UserMinus className="size-4" /> Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
