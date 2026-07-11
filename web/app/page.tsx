"use client";

import { useEffect, useState } from "react";
import { Loader2, Spade, Heart, Diamond, Club } from "lucide-react";
import { api } from "@/lib/api";
import { initTelegram, startParam } from "@/lib/telegram";
import { AppProvider } from "@/lib/store";
import type { UserProfile } from "@/lib/types";
import { AppShell } from "@/components/app-shell";

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    api
      .authenticate()
      .then(setUser)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
        <Spade className="size-10 text-gold" />
        <p className="font-semibold">Couldn&apos;t sign in</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground">
          Open this app from the Telegram bot.
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <div className="flex gap-3 text-gold">
          <Spade className="size-7" />
          <Heart className="size-7 text-lose" />
          <Diamond className="size-7 text-lose" />
          <Club className="size-7" />
        </div>
        <div className="text-2xl font-extrabold tracking-widest text-gold">
          POKER CM
        </div>
        <Loader2 className="mt-2 size-7 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <AppProvider initialUser={user}>
      <AppShell startParam={startParam()} />
    </AppProvider>
  );
}
