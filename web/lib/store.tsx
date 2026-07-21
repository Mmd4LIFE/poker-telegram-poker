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
import { GATES, type GateKey, type OnboardingState } from "./gates";

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
  /** progressive onboarding: unlock state (null until first load) */
  onboarding: OnboardingState | null;
  refreshOnboarding: () => Promise<void>;
  /** true if a gated feature is available to this player (falls back to level pre-load) */
  isUnlocked: (key: GateKey) => boolean;
  /** the locked feature whose explainer sheet is open, if any */
  lockedInfo: GateKey | null;
  showLocked: (key: GateKey) => void;
  dismissLocked: () => void;
  /** mark reveal spotlights as seen so they never fire again */
  markRevealsSeen: (keys: string[]) => Promise<void>;
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
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [lockedInfo, setLockedInfo] = useState<GateKey | null>(null);
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

  // ---- onboarding / feature gating ----
  const refreshOnboarding = useCallback(async () => {
    try {
      setOnboarding(await api.onboarding());
    } catch {
      /* a gate fetch failing should never break the app; local level fallback applies */
    }
  }, []);
  // load on mount, and re-fetch whenever the level changes (a level-up can unlock features)
  useEffect(() => {
    refreshOnboarding();
  }, [refreshOnboarding, user.level]);

  const isUnlocked = useCallback(
    (key: GateKey): boolean => {
      if (onboarding) {
        if (onboarding.enabled === false) return true;
        return onboarding.features[key]?.unlocked ?? true;
      }
      // pre-load / offline fallback: gate purely on the player's level
      return (user?.level ?? 1) >= (GATES[key]?.level ?? 1);
    },
    [onboarding, user],
  );

  const markRevealsSeen = useCallback(async (keys: string[]) => {
    let last: OnboardingState | null = null;
    for (const k of keys) {
      try {
        last = await api.onboardingSeen(k);
      } catch {
        /* ignore */
      }
    }
    if (last) setOnboarding(last);
  }, []);

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
    onboarding,
    refreshOnboarding,
    isUnlocked,
    lockedInfo,
    showLocked: (key: GateKey) => setLockedInfo(key),
    dismissLocked: () => setLockedInfo(null),
    markRevealsSeen,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
