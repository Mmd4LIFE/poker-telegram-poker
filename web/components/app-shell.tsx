"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { BottomNav } from "@/components/bottom-nav";
import { LobbyScreen } from "@/components/screens/lobby";
import { ProfileScreen } from "@/components/screens/profile";
import { Placeholder } from "@/components/screens/placeholder";
import { TableSoon } from "@/components/screens/table-soon";

export function AppShell({ startParam }: { startParam: string | null }) {
  const { view, go, tableCode } = useApp();

  useEffect(() => {
    if (startParam === "shop") go("shop");
    else if (startParam === "leaderboard") go("leaderboard");
    // ref_* / room codes handled when the Table is ported
  }, [startParam, go]);

  if (tableCode) return <TableSoon />;

  return (
    <>
      <main className="mx-auto w-full max-w-md px-4 pb-24 pt-4">
        {view === "lobby" && <LobbyScreen />}
        {view === "profile" && <ProfileScreen />}
        {view === "shop" && <Placeholder title="Shop" />}
        {view === "quests" && <Placeholder title="Quests" />}
        {view === "leaderboard" && <Placeholder title="Leaderboard" />}
        {view === "invite" && <Placeholder title="Invite & Earn" />}
        {view === "admin" && <Placeholder title="Admin" />}
        {view === "squad" && <Placeholder title="Squad" />}
      </main>
      <BottomNav />
    </>
  );
}
