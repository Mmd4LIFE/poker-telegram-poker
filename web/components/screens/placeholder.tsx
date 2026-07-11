"use client";

import { Sparkles } from "lucide-react";
import { WalletBar } from "@/components/wallet-bar";

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <WalletBar />
      <div className="mt-24 flex flex-col items-center gap-3 text-center">
        <Sparkles className="size-9 text-gold" />
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          This screen is being polished in the new Next.js + shadcn UI. Coming
          right up.
        </p>
      </div>
    </>
  );
}
