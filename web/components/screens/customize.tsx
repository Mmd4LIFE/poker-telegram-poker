"use client";

import { useEffect, useState } from "react";
import { Check, Lock, Coins, Gem } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function CustomizeScreen() {
  const { user, refresh, go } = useApp();
  const [cat, setCat] = useState<any>(null);

  const load = () => api.cosmetics().then(setCat).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function act(kind: string, code: string, owned: boolean) {
    try {
      if (owned) {
        await api.equipCosmetic(kind, code);
        notify("success");
      } else {
        await api.buyCosmetic(kind, code);
        toast.success("Unlocked & equipped!");
        notify("success");
      }
      await refresh();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!user) return null;
  const previewColor = user.name_color || undefined;

  return (
    <>
      <PageHeader title="Customize" onBack={() => go("profile")} />

      {/* live preview */}
      <Card className="items-center p-6 text-center">
        <Avatar className="mx-auto size-20 border-2 border-gold/40">
          <AvatarFallback className="bg-secondary text-4xl">{user.avatar}</AvatarFallback>
        </Avatar>
        <div className="mt-2 text-xl font-extrabold" style={previewColor ? { color: previewColor } : undefined}>
          {user.display_name}
        </div>
        {user.handle && <div className="text-xs text-muted-foreground">{user.handle}</div>}
      </Card>

      <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Avatars
      </h2>
      <Card className="p-4">
        <div className="grid grid-cols-5 gap-2">
          {cat?.avatars.map((a: any) => (
            <button
              key={a.emoji}
              onClick={() => act("avatar", a.emoji, a.owned)}
              className={cn(
                "relative grid aspect-square place-items-center rounded-xl bg-secondary text-2xl active:scale-90",
                a.equipped && "ring-2 ring-gold",
              )}
            >
              {a.emoji}
              {a.equipped ? (
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-gold text-background">
                  <Check className="size-3" />
                </span>
              ) : !a.owned ? (
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 rounded-b-xl bg-black/60 py-0.5 text-[9px] font-bold">
                  {a.price_gems ? (
                    <>
                      <Gem className="size-2.5 text-gem" />
                      {a.price_gems}
                    </>
                  ) : (
                    <>
                      <Coins className="size-2.5 text-gold" />
                      {fmt(a.price_coins)}
                    </>
                  )}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </Card>

      <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Name Color
      </h2>
      <Card className="p-4">
        {cat?.colors.map((c: any) => (
          <button
            key={c.code || "classic"}
            onClick={() => act("color", c.code, c.owned)}
            className="flex w-full items-center gap-3 border-b border-white/5 py-2.5 last:border-0"
          >
            <span
              className="grid size-8 place-items-center rounded-full border border-white/10"
              style={{ background: c.css || "var(--muted)" }}
            >
              {c.equipped && <Check className="size-4 text-background" />}
            </span>
            <span className="flex-1 text-left font-bold" style={c.css ? { color: c.css } : undefined}>
              {c.label}
            </span>
            {c.equipped ? (
              <span className="text-xs text-gold">Equipped</span>
            ) : c.owned ? (
              <span className="text-xs text-muted-foreground">Owned</span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">
                <Lock className="size-3" />
                {c.price_gems ? (
                  <>
                    <Gem className="size-3 text-gem" /> {c.price_gems}
                  </>
                ) : (
                  <>
                    <Coins className="size-3 text-gold" /> {fmt(c.price_coins)}
                  </>
                )}
              </span>
            )}
          </button>
        ))}
      </Card>
    </>
  );
}
