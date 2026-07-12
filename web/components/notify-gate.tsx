"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, ChevronRight, Coins } from "lucide-react";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { openBotChat } from "@/lib/telegram";
import { Card } from "@/components/ui/card";

const BONUS = 2000;

/** Users who arrived through an invite deep link never pressed Start, so Telegram
 *  won't let the bot message them — no streak reminders, no announcements. This
 *  is the one nudge that fixes it, and it pays them to do it. */
export function NotifyGate() {
  const { user, refresh } = useApp();
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // They leave the app to press Start, so poll briefly for the flag to flip.
  useEffect(() => {
    if (!waiting) return;
    let ticks = 0;
    timer.current = setInterval(() => {
      ticks += 1;
      refresh();
      if (ticks > 20) setWaiting(false);
    }, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [waiting, refresh]);

  useEffect(() => {
    if (user?.bot_started) setWaiting(false);
  }, [user?.bot_started]);

  if (!user || user.bot_started) return null;

  return (
    <button
      className="mb-4 w-full"
      onClick={() => {
        setWaiting(true);
        openBotChat(user.bot_username, "notify");
      }}
    >
      <Card className="flex-row items-center gap-3 border-gold/40 bg-gradient-to-br from-gold/20 to-secondary p-4 active:scale-[0.99]">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold text-black">
          <Bell className="size-6" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-sm font-extrabold">
            {waiting ? "Waiting for you…" : "Turn on notifications"}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {waiting ? (
              "Press Start in the chat, then come back"
            ) : (
              <>
                Never miss your streak
                <span className="flex items-center gap-0.5 font-bold text-gold">
                  · <Coins className="size-3" /> +{fmt(BONUS)}
                </span>
              </>
            )}
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Card>
    </button>
  );
}
