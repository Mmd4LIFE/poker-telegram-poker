"use client";

import { ArrowLeft, Spade, Heart, Diamond, Club } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";

export function TableSoon() {
  const { exitTable } = useApp();
  return (
    <div className="fixed inset-0 flex flex-col bg-[radial-gradient(circle_at_50%_35%,#142033,#0a0e16)]">
      <div className="p-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <Button variant="outline" size="sm" onClick={exitTable}>
          <ArrowLeft className="size-4" /> Back
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex gap-2 text-gold">
          <Spade className="size-7" />
          <Heart className="size-7 text-lose" />
          <Diamond className="size-7 text-lose" />
          <Club className="size-7" />
        </div>
        <h1 className="text-xl font-extrabold">Live table — porting now</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          The real-time poker table (with the always-visible hand tray, live
          win%, and animations) is the next screen being rebuilt in this new
          Next.js + shadcn UI.
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          For now you can play on the current app. This preview shows the new
          design system for the lobby, profile and menus.
        </p>
      </div>
    </div>
  );
}
