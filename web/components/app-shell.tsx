"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { BottomNav } from "@/components/bottom-nav";
import { LobbyScreen } from "@/components/screens/lobby";
import { ProfileScreen } from "@/components/screens/profile";
import { LeaderboardScreen } from "@/components/screens/leaderboard";
import { ShopScreen } from "@/components/screens/shop";
import { QuestsScreen } from "@/components/screens/quests";
import { InviteScreen } from "@/components/screens/invite";
import { AdminScreen } from "@/components/screens/admin";
import { SquadScreen } from "@/components/screens/squad";
import { CreateRoomScreen } from "@/components/screens/create-room";
import { CustomizeScreen } from "@/components/screens/customize";
import { CardsScreen } from "@/components/screens/cards";
import { LeagueScreen } from "@/components/screens/league";
import { PokerTable } from "@/components/table/poker-table";
import { UserProfileSheet } from "@/components/user-profile-sheet";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function AppShell({ startParam }: { startParam: string | null }) {
  const { view, go, tableCode, enterTable } = useApp();

  useEffect(() => {
    const p = startParam;
    if (!p) return;
    if (p === "shop") go("shop");
    else if (p === "leaderboard") go("leaderboard");
    else if (p.startsWith("sq-")) {
      const code = p.split("-")[1];
      api.joinSquad(code).catch(() => {}).finally(() => go("squad"));
    } else if (p.startsWith("rm-")) {
      const code = p.split("-")[1];
      api.joinRoom(code, null).then(() => enterTable(code)).catch((e) => {
        toast.error((e as Error).message);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startParam]);

  return (
    <>
      {tableCode ? (
        <PokerTable code={tableCode} />
      ) : (
        <>
          <main className="mx-auto w-full max-w-md px-4 pb-24 pt-4">
            {view === "lobby" && <LobbyScreen />}
            {view === "leaderboard" && <LeaderboardScreen />}
            {view === "shop" && <ShopScreen />}
            {view === "quests" && <QuestsScreen />}
            {view === "profile" && <ProfileScreen />}
            {view === "invite" && <InviteScreen />}
            {view === "admin" && <AdminScreen />}
            {view === "squad" && <SquadScreen />}
            {view === "create" && <CreateRoomScreen />}
            {view === "customize" && <CustomizeScreen />}
            {view === "cards" && <CardsScreen />}
            {view === "league" && <LeagueScreen />}
          </main>
          <BottomNav />
        </>
      )}
      <UserProfileSheet />
      <LevelUpOverlay />
    </>
  );
}
