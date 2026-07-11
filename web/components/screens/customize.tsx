"use client";

import { useEffect, useState } from "react";
import { Check, Lock, Coins, Gem, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="mt-3 gap-0 p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between p-4"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}

function PriceTag({ item }: { item: any }) {
  return (
    <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold">
      {item.price_gems ? (
        <>
          <Gem className="size-2.5 text-gem" /> {item.price_gems}
        </>
      ) : (
        <>
          <Coins className="size-2.5 text-gold" /> {fmt(item.price_coins)}
        </>
      )}
    </span>
  );
}

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
        toast.success("Unlocked!");
        notify("success");
      }
      await refresh();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!user) return null;

  return (
    <>
      <PageHeader title="Customize" onBack={() => go("profile")} />

      {/* live preview */}
      <Card className="items-center p-6 text-center">
        <Avatar className="mx-auto size-20 border-2 border-gold/40">
          <AvatarFallback className="bg-secondary text-gold">
            <AvatarIcon code={user.avatar} color={user.avatar_color} className="size-9" />
          </AvatarFallback>
        </Avatar>
        <div
          className="mt-2 text-xl font-extrabold"
          style={user.name_color ? { color: user.name_color } : undefined}
        >
          {user.display_name}
        </div>
        {user.handle && <div className="text-xs text-muted-foreground">{user.handle}</div>}
      </Card>

      {/* Avatars */}
      <Section title="Avatar" defaultOpen>
        <div className="grid grid-cols-5 gap-3">
          {cat?.avatars.map((a: any) => (
            <button
              key={a.code}
              onClick={() => act("avatar", a.code, a.owned)}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-xl bg-secondary text-gold active:scale-90",
                a.equipped && "ring-2 ring-gold",
                !a.owned && "opacity-80",
              )}
            >
              <AvatarIcon code={a.code} color={a.color} className="size-6" />
              {a.equipped && (
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-gold text-background">
                  <Check className="size-3" />
                </span>
              )}
              {!a.owned && !a.equipped && <PriceTag item={a} />}
            </button>
          ))}
        </div>
      </Section>

      {/* Name color — each swatch is YOUR name in that color */}
      <Section title="Name Color">
        <div className="grid grid-cols-2 gap-2">
          {cat?.colors.map((c: any) => (
            <button
              key={c.code || "classic"}
              onClick={() => act("color", c.code, c.owned)}
              className={cn(
                "relative flex items-center justify-center rounded-xl bg-secondary px-2 py-3 active:scale-95",
                c.equipped && "ring-2 ring-gold",
                !c.owned && "opacity-80",
              )}
            >
              <span
                className="truncate text-sm font-extrabold"
                style={c.css ? { color: c.css } : undefined}
              >
                {user.display_name}
              </span>
              {c.equipped && (
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-gold text-background">
                  <Check className="size-3" />
                </span>
              )}
              {!c.owned && !c.equipped && (
                <span className="absolute right-1 top-1">
                  <Lock className="size-3 text-muted-foreground" />
                </span>
              )}
              {!c.owned && !c.equipped && <PriceTag item={c} />}
            </button>
          ))}
        </div>
      </Section>

      {/* Avatar color — each swatch is YOUR avatar in that color (current avatar only) */}
      <Section title="Avatar Color">
        <p className="mb-3 text-xs text-muted-foreground">
          Colors your current avatar only — each avatar keeps its own color.
        </p>
        <div className="grid grid-cols-5 gap-3">
          {cat?.avatar_colors.map((c: any) => (
            <button
              key={(c.code || "classic") + "ac"}
              onClick={() => act("avatar_color", c.code, c.owned)}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-xl bg-secondary active:scale-90",
                c.equipped && "ring-2 ring-gold",
                !c.owned && "opacity-80",
              )}
            >
              <AvatarIcon
                code={cat?.current_avatar || user.avatar}
                color={c.css || "#f5c518"}
                className="size-6"
              />
              {c.equipped && (
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-gold text-background">
                  <Check className="size-3" />
                </span>
              )}
              {!c.owned && !c.equipped && <PriceTag item={c} />}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}
