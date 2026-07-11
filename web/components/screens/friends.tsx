"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, UserPlus, Check, Trophy, ChevronRight, Users } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import type { FriendCard } from "@/lib/types";
import { WalletBar } from "@/components/wallet-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { OnlineDot } from "@/components/online-dot";

function Row({ f, action }: { f: FriendCard; action?: React.ReactNode }) {
  const { openUser } = useApp();
  return (
    <div className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0">
      <button className="relative" onClick={() => openUser(f.id)}>
        <Avatar className="size-10 border border-white/10">
          <AvatarFallback className="bg-secondary">{f.avatar}</AvatarFallback>
        </Avatar>
        <OnlineDot online={f.online} className="absolute -bottom-0.5 -right-0.5" />
      </button>
      <button className="flex-1 min-w-0 text-left" onClick={() => openUser(f.id)}>
        <div className="truncate text-sm font-semibold">{f.display_name}</div>
        <div className="text-xs text-muted-foreground">
          {f.online ? "Online" : "Offline"} · Lvl {f.level}
        </div>
      </button>
      {action ?? <ChevronRight className="size-4 text-muted-foreground" />}
    </div>
  );
}

export function FriendsScreen() {
  const { go } = useApp();
  const [data, setData] = useState<{
    friends: FriendCard[];
    incoming: FriendCard[];
    online_count: number;
  } | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FriendCard[] | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.friends());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setResults(await api.friendSearch(q.trim()));
      } catch {
        setResults([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function add(id: number) {
    try {
      const r = await api.friendRequest(id);
      toast.success(r.status === "friends" ? "You're now friends!" : "Request sent");
      notify("success");
      if (q) setResults(await api.friendSearch(q.trim()));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function accept(id: number) {
    try {
      await api.friendAccept(id);
      toast.success("Friend added");
      notify("success");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <WalletBar />
      <div className="mb-3 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Users className="size-6 text-gold" /> Friends
        </h1>
        <Button variant="outline" size="sm" onClick={() => go("leaderboard")}>
          <Trophy className="size-4" /> Ranks
        </Button>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players by @username"
          className="pl-9"
        />
      </div>

      {results !== null && (
        <Card className="mb-3 p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Search results
          </div>
          {results.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No players found.</p>
          ) : (
            results.map((f) => (
              <Row
                key={f.id}
                f={f}
                action={
                  f.relation === "friends" ? (
                    <span className="text-xs text-win">Friends</span>
                  ) : f.relation === "outgoing" ? (
                    <span className="text-xs text-muted-foreground">Requested</span>
                  ) : f.relation === "incoming" ? (
                    <Button size="sm" onClick={() => accept(f.id)}>
                      <Check className="size-4" /> Accept
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => add(f.id)}>
                      <UserPlus className="size-4" /> Add
                    </Button>
                  )
                }
              />
            ))
          )}
        </Card>
      )}

      {data?.incoming && data.incoming.length > 0 && (
        <>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Requests ({data.incoming.length})
          </h2>
          <Card className="mb-3 p-4">
            {data.incoming.map((f) => (
              <Row
                key={f.id}
                f={f}
                action={
                  <Button size="sm" onClick={() => accept(f.id)}>
                    <Check className="size-4" /> Accept
                  </Button>
                }
              />
            ))}
          </Card>
        </>
      )}

      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        My Friends {data ? `· ${data.online_count} online` : ""}
      </h2>
      <Card className="p-4">
        {!data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data.friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No friends yet — search a @username above to add someone.
          </p>
        ) : (
          data.friends.map((f) => <Row key={f.id} f={f} />)
        )}
      </Card>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Total won leaderboard among friends in {""}
        <button className="text-gold underline" onClick={() => go("leaderboard")}>
          Ranks → Friends
        </button>
      </p>
    </>
  );
}
