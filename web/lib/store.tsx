"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { api } from "./api";
import type { UserProfile, View } from "./types";

interface AppState {
  user: UserProfile | null;
  setUser: (u: UserProfile) => void;
  refresh: () => Promise<void>;
  view: View;
  go: (v: View) => void;
  profileId: number | null;
  openUser: (id: number) => void;
  closeUser: () => void;
  tableCode: string | null;
  enterTable: (code: string) => void;
  exitTable: () => void;
  levelUp: number | null;
  clearLevelUp: () => void;
  /** an unclaimed daily reward is waiting — drives the dot on the Shop tab */
  dailyReady: boolean;
  refreshDaily: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({
  initialUser,
  children,
}: {
  initialUser: UserProfile;
  children: React.ReactNode;
}) {
  const [user, setUserState] = useState<UserProfile>(initialUser);
  const [view, setView] = useState<View>("lobby");
  const [tableCode, setTableCode] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [dailyReady, setDailyReady] = useState(false);
  const levelRef = useRef(initialUser.level);

  const setUser = useCallback((u: UserProfile) => {
    if (u.level > levelRef.current) setLevelUp(u.level);
    levelRef.current = u.level;
    setUserState(u);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch {
      /* ignore */
    }
  }, [setUser]);

  // Tell the server which timezone this device is in, so the nightly reminder
  // lands at 21:00 *their* time. getTimezoneOffset() is minutes WEST of UTC.
  useEffect(() => {
    api.setTz(-new Date().getTimezoneOffset()).catch(() => {});
  }, []);

  const refreshDaily = useCallback(async () => {
    try {
      const d: { claimed_today?: boolean } = await api.dailyStatus();
      setDailyReady(!d.claimed_today);
    } catch {
      /* a badge is never worth breaking a screen over */
    }
  }, []);

  // Checked once on open — that's the whole point: you should see the dot the moment
  // you launch the app, without opening Shop to find out there was something there.
  useEffect(() => {
    refreshDaily();
  }, [refreshDaily]);

  const value: AppState = {
    user,
    setUser,
    refresh,
    view,
    go: setView,
    profileId,
    openUser: (id: number) => setProfileId(id),
    closeUser: () => setProfileId(null),
    tableCode,
    enterTable: setTableCode,
    exitTable: () => setTableCode(null),
    levelUp,
    dailyReady,
    refreshDaily,
    clearLevelUp: () => setLevelUp(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
