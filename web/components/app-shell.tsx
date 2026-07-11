"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { BottomNav } from "@/components/bottom-nav";
import { LobbyScreen } from "@/components/screens/lobby";
import { ProfileScreen } from "@/components/screens/profile";
import { FriendsScreen } from "@/components/screens/friends";
import { UserProfileScreen } from "@/components/screens/user-profile";
import { LeaderboardScreen } from "@/components/screens/leaderboard";
import { ShopScreen } from "@/components/screens/shop";
import { QuestsScreen } from "@/components/screens/quests";
import { InviteScreen } from "@/components/screens/invite";
import { AdminScreen } from "@/components/screens/admin";
import { SquadScreen } from "@/components/screens/squad";
import { CreateRoomScreen } from "@/components/screens/create-room";
import { JoinRoomScreen } from "@/components/screens/join-room";
import { PokerTable } from "@/components/table/poker-table";

export function AppShell({ startParam }: { startParam: string | null }) {
  const { view, go, tableCode } = useApp();

  useEffect(() => {
    if (startParam === "shop") go("shop");
    else if (startParam === "leaderboard") go("leaderboard");
  }, [startParam, go]);

  if (tableCode) return <PokerTable code={tableCode} />;

  return (
    <>
      <main className="mx-auto w-full max-w-md px-4 pb-24 pt-4">
        {view === "lobby" && <LobbyScreen />}
        {view === "friends" && <FriendsScreen />}
        {view === "user" && <UserProfileScreen />}
        {view === "leaderboard" && <LeaderboardScreen />}
        {view === "shop" && <ShopScreen />}
        {view === "quests" && <QuestsScreen />}
        {view === "profile" && <ProfileScreen />}
        {view === "invite" && <InviteScreen />}
        {view === "admin" && <AdminScreen />}
        {view === "squad" && <SquadScreen />}
        {view === "create" && <CreateRoomScreen />}
        {view === "join" && <JoinRoomScreen />}
      </main>
      <BottomNav />
    </>
  );
}
