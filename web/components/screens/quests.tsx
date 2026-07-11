"use client";

import { useEffect, useState } from "react";
import { Target, Check, Coins, Gem } from "lucide-react";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/* eslint-disable @typescript-eslint/no-explicit-any */

function QuestList({ items }: { items: any[] | null }) {
  if (!items) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing here.</p>;
  return (
    <Card className="p-4">
      {items.map((c) => {
        const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
        return (
          <div key={c.code} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0">
            <div className="grid size-9 place-items-center rounded-lg bg-secondary text-lg">
              {c.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {c.title}
                {c.period ? (
                  <span className="ml-1 text-xs text-muted-foreground">({c.period})</span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">{c.description}</div>
              <Progress value={pct} className="mt-1.5 h-1.5" />
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>
                  {c.progress}/{c.target}
                </span>
                <span className="flex items-center gap-0.5">
                  <Coins className="size-3 text-gold" /> {fmt(c.reward_coins)}
                </span>
                {c.reward_gems ? (
                  <span className="flex items-center gap-0.5">
                    <Gem className="size-3 text-gem" /> {c.reward_gems}
                  </span>
                ) : null}
              </div>
            </div>
            {c.completed && (
              <div className="grid size-6 place-items-center rounded-full bg-win text-background">
                <Check className="size-3.5" />
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export function QuestsScreen() {
  const { go } = useApp();
  const [challenges, setChallenges] = useState<any[] | null>(null);
  const [achievements, setAchievements] = useState<any[] | null>(null);

  useEffect(() => {
    api.challenges().then(setChallenges as never).catch(() => setChallenges([]));
    api.achievements().then(setAchievements as never).catch(() => setAchievements([]));
  }, []);

  return (
    <>
      <PageHeader title="Quests" onBack={() => go("profile")} />
      <Tabs defaultValue="challenges">
        <TabsList className="mb-3 w-full">
          <TabsTrigger value="challenges" className="flex-1">
            <Target className="mr-1 size-4" /> Challenges
          </TabsTrigger>
          <TabsTrigger value="achievements" className="flex-1">
            Achievements
          </TabsTrigger>
        </TabsList>
        <TabsContent value="challenges">
          <QuestList items={challenges} />
        </TabsContent>
        <TabsContent value="achievements">
          <QuestList items={achievements} />
        </TabsContent>
      </Tabs>
    </>
  );
}
