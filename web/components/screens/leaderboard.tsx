"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal, Crown } from "lucide-react";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { WalletBar } from "@/components/wallet-bar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { OnlineDot } from "@/components/online-dot";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "total_won", label: "Winnings" },
  { key: "level", label: "Level" },
  { key: "hands_won", label: "Wins" },
];

interface Row {
  rank: number;
  id?: number;
  display_name: string;
  name_color?: string;
  avatar: string;
  level: number;
  degree: string;
  value: number;
  online?: boolean;
  is_me?: boolean;
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="size-5 text-gold" />;
  if (rank === 2) return <Medal className="size-5 text-zinc-300" />;
  if (rank === 3) return <Medal className="size-5 text-amber-700" />;
  return <span className="w-5 text-center text-sm font-bold text-muted-foreground">{rank}</span>;
}

function Board({ scope }: { scope: "global" | "friends" }) {
  const { openUser } = useApp();
  const [metric, setMetric] = useState("total_won");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    setRows(null);
    const p = scope === "friends" ? api.friendsLeaderboard(metric) : api.leaderboard(metric);
    p.then(setRows as never).catch(() => setRows([]));
  }, [metric, scope]);

  return (
    <>
      <div className="mb-3 flex gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold",
              metric === m.key ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <Card className="p-4">
        {!rows ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          rows.map((r) => (
            <button
              key={`${r.rank}-${r.display_name}`}
              onClick={() => r.id && openUser(r.id)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-white/5 py-2.5 text-left last:border-0",
                r.is_me && "-mx-2 rounded-lg bg-gold/10 px-2",
              )}
            >
              <div className="flex w-6 justify-center">
                <RankIcon rank={r.rank} />
              </div>
              <div className="relative">
                <Avatar className="size-9 border border-white/10">
                  <AvatarFallback className="bg-secondary text-gold">
                    <AvatarIcon code={r.avatar} className="size-4" />
                  </AvatarFallback>
                </Avatar>
                {r.online !== undefined && (
                  <OnlineDot online={r.online} className="absolute -bottom-0.5 -right-0.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="truncate text-sm font-semibold"
                  style={r.name_color ? { color: r.name_color } : undefined}
                >
                  {r.display_name} {r.is_me && <span className="text-xs text-gold">(you)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Lvl {r.level} · {r.degree}
                </div>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-gold">
                {fmt(r.value)}
              </span>
            </button>
          ))
        )}
      </Card>
    </>
  );
}

export function LeaderboardScreen() {
  return (
    <>
      <WalletBar />
      <h1 className="mb-3 flex items-center gap-2 text-2xl font-extrabold">
        <Trophy className="size-6 text-gold" /> Leaderboard
      </h1>
      <Tabs defaultValue="global">
        <TabsList className="mb-3 w-full">
          <TabsTrigger value="global" className="flex-1">
            Global
          </TabsTrigger>
          <TabsTrigger value="friends" className="flex-1">
            Friends
          </TabsTrigger>
        </TabsList>
        <TabsContent value="global">
          <Board scope="global" />
        </TabsContent>
        <TabsContent value="friends">
          <Board scope="friends" />
        </TabsContent>
      </Tabs>
    </>
  );
}
