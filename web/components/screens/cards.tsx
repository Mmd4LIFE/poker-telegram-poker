"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Gem, Layers, Store, Tag, Loader2, Flame } from "lucide-react";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import {
  DEFAULT_DESIGN,
  RANKS,
  RARITY_COLOR,
  RARITY_RING,
  SUITS,
  SUIT_NAME,
  useSkins,
  type Design,
} from "@/lib/skins";
import { PlayingCard } from "@/components/table/playing-card";
import { WalletBar } from "@/components/wallet-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Price({ coins, gems }: { coins?: number; gems?: number }) {
  if (gems)
    return (
      <span className="flex items-center gap-1 font-bold">
        <Gem className="size-3.5 text-gem" /> {gems}
      </span>
    );
  return (
    <span className="flex items-center gap-1 font-bold">
      <Coins className="size-3.5 text-gold" /> {fmt(coins || 0)}
    </span>
  );
}

/* ---------------------------------------------------------------- collection */

function Collection({
  onPick,
}: {
  onPick: (card: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const load = useCallback(() => api.collection().then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Loader2 className="mx-auto mt-8 size-6 animate-spin text-gold" />;

  const byCard: Record<string, any> = {};
  for (const c of data.cards) byCard[c.card] = c;
  const pct = Math.round((100 * data.skinned) / data.deck_size);

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-extrabold">
              {data.skinned}
              <span className="text-base font-bold text-muted-foreground">
                /{data.deck_size}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">cards skinned</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-gold">{data.owned_total}</div>
            <div className="text-xs text-muted-foreground">skins owned</div>
          </div>
        </div>
        <Progress value={pct} className="mt-3" />
      </Card>

      {SUITS.map((s) => (
        <div key={s} className="mb-4">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {SUIT_NAME[s]}
          </h3>
          <div className="-mx-4 overflow-x-auto px-4 pb-1">
            <div className="flex gap-1.5">
              {RANKS.map((r) => {
                const code = r + s;
                const item = byCard[code];
                const skinned = item?.equipped !== DEFAULT_DESIGN;
                return (
                  <button
                    key={code}
                    onClick={() => onPick(code)}
                    className="relative shrink-0 active:scale-95"
                  >
                    <PlayingCard card={code} size="md" design={item?.equipped} />
                    {item?.owned?.length > 1 && (
                      <span className="absolute -right-1 -top-1 rounded-full bg-gold px-1 text-[9px] font-extrabold text-black">
                        {item.owned.length}
                      </span>
                    )}
                    {!skinned && (
                      <span className="absolute inset-0 rounded-md bg-black/45" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        Dimmed cards still use the classic look. Tap any card to skin it.
      </p>
    </>
  );
}

/* --------------------------------------------------------------------- shop */

function ShopTab({ onBought }: { onBought: () => void }) {
  const { reload } = useSkins();
  const { refresh } = useApp();
  const [designs, setDesigns] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null); // design detail
  const [cards, setCards] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.cardShop().then((r: any) => setDesigns(r.designs)).catch(() => {});
  }, []);

  async function openDesign(d: any) {
    setOpen(d);
    setCards(null);
    try {
      const r: any = await api.cardShop({ design: d.code });
      setCards(r.cards);
    } catch {
      setCards([]);
    }
  }

  async function buy(c: any) {
    if (!open) return;
    setBusy(c.card);
    try {
      const r: any = await api.buyCard(open.code, c.card, c.price_gems ? "gems" : "coins");
      toast.success(`${open.name} ${c.card} — serial #${r.skin.serial} is yours`);
      notify("success");
      await Promise.all([reload(), refresh()]);
      await openDesign(open);
      onBought();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!designs) return <Loader2 className="mx-auto mt-8 size-6 animate-spin text-gold" />;

  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        Every skin is minted in a fixed quantity. Higher cards cost more — an Ace
        runs about 4.5&times; a deuce. When a mint sells out, the market is the only
        way in.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {designs.map((d: any) => {
          const left = d.supply_total - d.minted_total;
          const pct = d.supply_total
            ? Math.round((100 * d.minted_total) / d.supply_total)
            : 0;
          return (
            <button key={d.code} onClick={() => openDesign(d)} className="text-left">
              <Card
                className={`gap-2 border p-3 active:scale-[0.98] ${RARITY_RING[d.rarity] || ""}`}
              >
                <div className="flex justify-center gap-1">
                  <PlayingCard card="Ah" size="sm" design={d.code} />
                  <PlayingCard card="Ks" size="sm" design={d.code} />
                </div>
                <div className="text-sm font-extrabold">{d.name}</div>
                <div
                  className={`text-[10px] font-bold uppercase ${RARITY_COLOR[d.rarity] || ""}`}
                >
                  {d.rarity}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  from <Price coins={d.from_coins} gems={d.from_gems} />
                </div>
                <Progress value={pct} className="h-1" />
                <div className="text-[10px] text-muted-foreground">
                  {left > 0 ? `${fmt(left)} of ${fmt(d.supply_total)} left` : "SOLD OUT"}
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {open?.name}
              <span
                className={`text-[10px] font-bold uppercase ${RARITY_COLOR[open?.rarity] || ""}`}
              >
                {open?.rarity}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[62vh] overflow-y-auto">
            {!cards ? (
              <Loader2 className="mx-auto my-6 size-5 animate-spin text-gold" />
            ) : (
              cards.map((c: any) => (
                <div
                  key={c.card}
                  className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0"
                >
                  <PlayingCard card={c.card} size="sm" design={open.code} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">
                      {c.remaining > 0 ? `${fmt(c.remaining)} left` : "sold out"}
                      {c.owned && <span className="ml-1 text-gold">· owned</span>}
                    </div>
                    <Price coins={c.price_coins} gems={c.price_gems} />
                  </div>
                  <Button
                    size="sm"
                    disabled={c.remaining <= 0 || busy === c.card}
                    onClick={() => buy(c)}
                  >
                    {busy === c.card ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : c.remaining > 0 ? (
                      "Mint"
                    ) : (
                      "Gone"
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------- market */

function MarketTab() {
  const { designs, reload } = useSkins();
  const { refresh } = useApp();
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [card, setCard] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState("price");
  const [mine, setMine] = useState<any>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const q: Record<string, string> = { sort };
    if (card) q.card = card;
    if (rarity) q.rarity = rarity;
    try {
      const r: any = await api.market(q);
      setRows(r.listings);
      setTotal(r.total);
    } catch {
      setRows([]);
    }
    api.marketMine().then(setMine).catch(() => {});
  }, [card, rarity, sort]);

  useEffect(() => {
    load();
  }, [load]);

  async function buy(l: any) {
    setBusy(l.id);
    try {
      await api.marketBuy(l.id);
      toast.success(`Bought ${l.design} ${l.card} #${l.serial}`);
      notify("success");
      await Promise.all([reload(), refresh()]);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel(l: any) {
    try {
      await api.marketCancel(l.id);
      toast("Listing cancelled");
      await reload();
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <select
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
          className="shrink-0 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs font-semibold"
        >
          <option value="">All rarities</option>
          {["common", "rare", "epic", "legendary", "mythic"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={card}
          onChange={(e) => setCard(e.target.value)}
          className="shrink-0 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs font-semibold"
        >
          <option value="">Any card</option>
          {SUITS.flatMap((s) =>
            RANKS.map((r) => (
              <option key={r + s} value={r + s}>
                {r === "T" ? "10" : r} {SUIT_NAME[s]}
              </option>
            )),
          )}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="shrink-0 rounded-lg border border-white/10 bg-secondary px-2 py-1.5 text-xs font-semibold"
        >
          <option value="price">Cheapest</option>
          <option value="-price">Priciest</option>
          <option value="recent">Newest</option>
          <option value="serial">Lowest serial</option>
        </select>
      </div>

      {mine?.active?.length > 0 && (
        <>
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Your listings
          </h3>
          <Card className="mb-4 p-3">
            {mine.active.map((l: any) => (
              <div
                key={l.id}
                className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0"
              >
                <PlayingCard card={l.card} size="sm" design={l.design} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {designs[l.design]?.name || l.design} #{l.serial}
                  </div>
                  <Price
                    coins={l.currency === "coins" ? l.price : 0}
                    gems={l.currency === "gems" ? l.price : 0}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => cancel(l)}>
                  Cancel
                </Button>
              </div>
            ))}
          </Card>
        </>
      )}

      <h3 className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <span>{total} on sale</span>
        <span className="font-normal normal-case">5% fee burned on each sale</span>
      </h3>

      {!rows ? (
        <Loader2 className="mx-auto mt-6 size-6 animate-spin text-gold" />
      ) : rows.length === 0 ? (
        <Card className="items-center gap-1 p-6 text-center">
          <Store className="size-7 text-muted-foreground" />
          <div className="text-sm font-semibold">Nothing listed yet</div>
          <div className="text-xs text-muted-foreground">
            Be the first — list a skin from your collection.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {rows.map((l: any) => {
            const d: Design | undefined = designs[l.design];
            return (
              <Card
                key={l.id}
                className={`items-center gap-1.5 border p-3 ${RARITY_RING[d?.rarity || "common"]}`}
              >
                <PlayingCard card={l.card} size="lg" design={l.design} />
                <div className="text-xs font-extrabold">{d?.name || l.design}</div>
                <div className="text-[10px] text-muted-foreground">
                  #{l.serial}
                  {d?.mint_per_card ? ` / ${fmt(d.mint_per_card)}` : ""}
                </div>
                <Price
                  coins={l.currency === "coins" ? l.price : 0}
                  gems={l.currency === "gems" ? l.price : 0}
                />
                {l.is_mine ? (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => cancel(l)}>
                    Cancel
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={busy === l.id}
                    onClick={() => buy(l)}
                  >
                    {busy === l.id ? <Loader2 className="size-3.5 animate-spin" /> : "Buy"}
                  </Button>
                )}
                <div className="text-[10px] text-muted-foreground">
                  {l.seller_name || "—"}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------- one-card detail sheet */

function CardSheet({
  card,
  onClose,
  onChange,
}: {
  card: string | null;
  onClose: () => void;
  onChange: () => void;
}) {
  const { designs, reload } = useSkins();
  const { refresh } = useApp();
  const [data, setData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [selling, setSelling] = useState<any>(null);
  const [price, setPrice] = useState("");
  const [cur, setCur] = useState("coins");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!card) return;
    setData(null);
    try {
      const c: any = await api.collection();
      const item = c.cards.find((x: any) => x.card === card);
      const shop: any = await api.cardShop({ card });
      setData({ item, shop: shop.designs });
    } catch {
      /* ignore */
    }
  }, [card]);

  useEffect(() => {
    load();
  }, [load]);

  async function equip(skinId: number | null) {
    if (!card) return;
    setBusy(true);
    try {
      await api.equipCard(card, skinId);
      await reload();
      await load();
      onChange();
      notify("light");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function mint(d: any) {
    if (!card) return;
    setBusy(true);
    try {
      const r: any = await api.buyCard(d.code, card, d.price_gems ? "gems" : "coins");
      toast.success(`Minted #${r.skin.serial}`);
      notify("success");
      await Promise.all([reload(), refresh()]);
      await load();
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openSell(s: any) {
    setSelling(s);
    setPrice("");
    setStats(null);
    try {
      setStats(await api.marketStats(s.design, card!));
    } catch {
      /* ignore */
    }
  }

  async function confirmSell() {
    if (!selling) return;
    const p = Number(price);
    if (!p || p <= 0) return toast.error("Enter a price");
    setBusy(true);
    try {
      await api.marketList(selling.id, p, cur);
      toast.success("Listed on the market");
      setSelling(null);
      await reload();
      await load();
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fee = Math.max(1, Math.floor((Number(price) || 0) * 0.05));

  return (
    <>
      <Dialog open={!!card && !selling} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skins for this card</DialogTitle>
          </DialogHeader>
          {!data ? (
            <Loader2 className="mx-auto my-6 size-5 animate-spin text-gold" />
          ) : (
            <div className="max-h-[64vh] overflow-y-auto">
              <div className="mb-4 flex justify-center">
                <PlayingCard
                  card={card!}
                  size="xl"
                  design={data.item?.equipped || DEFAULT_DESIGN}
                />
              </div>

              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Yours
              </h3>
              <button
                onClick={() => equip(null)}
                disabled={busy}
                className="mb-1.5 flex w-full items-center gap-3 rounded-lg border border-white/5 p-2"
              >
                <PlayingCard card={card!} size="sm" design={DEFAULT_DESIGN} />
                <span className="flex-1 text-left text-sm font-semibold">Classic</span>
                {data.item?.equipped === DEFAULT_DESIGN && (
                  <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-black">
                    WORN
                  </span>
                )}
              </button>
              {(data.item?.owned || []).map((s: any) => (
                <div
                  key={s.id}
                  className="mb-1.5 flex items-center gap-3 rounded-lg border border-white/5 p-2"
                >
                  <PlayingCard card={card!} size="sm" design={s.design} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {designs[s.design]?.name || s.design}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      serial #{s.serial}
                      {s.on_market && <span className="ml-1 text-gold">· listed</span>}
                    </div>
                  </div>
                  {data.item.equipped_id === s.id ? (
                    <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-black">
                      WORN
                    </span>
                  ) : (
                    !s.on_market && (
                      <Button size="sm" disabled={busy} onClick={() => equip(s.id)}>
                        Wear
                      </Button>
                    )
                  )}
                  {!s.on_market && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => openSell(s)}
                    >
                      <Tag className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}

              <h3 className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Mint a new one
              </h3>
              {data.shop.map((d: any) => (
                <div
                  key={d.code}
                  className="mb-1.5 flex items-center gap-3 rounded-lg border border-white/5 p-2"
                >
                  <PlayingCard card={card!} size="sm" design={d.code} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{d.name}</span>
                      <span
                        className={`text-[9px] font-bold uppercase ${RARITY_COLOR[d.rarity]}`}
                      >
                        {d.rarity}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.remaining > 0 ? `${fmt(d.remaining)} of ${fmt(d.mint_per_card)} left` : "sold out"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy || d.remaining <= 0}
                    onClick={() => mint(d)}
                  >
                    {d.remaining > 0 ? (
                      <Price coins={d.price_coins} gems={d.price_gems} />
                    ) : (
                      "Gone"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* list-for-sale */}
      <Dialog open={!!selling} onOpenChange={(o) => !o && setSelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sell on the market</DialogTitle>
          </DialogHeader>
          {selling && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <PlayingCard card={card!} size="lg" design={selling.design} />
                <div>
                  <div className="text-sm font-extrabold">
                    {designs[selling.design]?.name || selling.design}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    serial #{selling.serial}
                  </div>
                </div>
              </div>

              {stats && (
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary p-2 text-center">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Floor</div>
                    <div className="text-xs font-bold">
                      {stats.coins.floor ? fmt(stats.coins.floor) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Last sale</div>
                    <div className="text-xs font-bold">
                      {stats.coins.last ? fmt(stats.coins.last) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Listed</div>
                    <div className="text-xs font-bold">{stats.coins.listed}</div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {["coins", "gems"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCur(c)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-xs font-bold ${
                      cur === c ? "border-gold text-gold" : "border-white/10 text-muted-foreground"
                    }`}
                  >
                    {c === "coins" ? (
                      <Coins className="size-3.5" />
                    ) : (
                      <Gem className="size-3.5" />
                    )}
                    {c}
                  </button>
                ))}
              </div>

              <Input
                type="number"
                inputMode="numeric"
                placeholder={`Price in ${cur}`}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <div className="flex items-center justify-between rounded-lg bg-secondary p-2 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Flame className="size-3.5 text-lose" /> 5% fee burned
                </span>
                <span className="font-bold">
                  you get {fmt(Math.max(0, (Number(price) || 0) - fee))} {cur}
                </span>
              </div>

              <Button className="w-full" disabled={busy} onClick={confirmSell}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "List for sale"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                While listed, this skin comes off your card. Cancel any time.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* --------------------------------------------------------------------- root */

export function CardsScreen() {
  const [tab, setTab] = useState("collection");
  const [pick, setPick] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  return (
    <>
      <WalletBar />
      <h1 className="mb-3 flex items-center gap-2 text-2xl font-extrabold">
        <Layers className="size-6 text-gold" /> My Cards
      </h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="collection" className="flex-1">
            Collection
          </TabsTrigger>
          <TabsTrigger value="shop" className="flex-1">
            Shop
          </TabsTrigger>
          <TabsTrigger value="market" className="flex-1">
            Market
          </TabsTrigger>
        </TabsList>

        <TabsContent value="collection">
          <Collection key={nonce} onPick={setPick} />
        </TabsContent>
        <TabsContent value="shop">
          <ShopTab onBought={() => setNonce((n) => n + 1)} />
        </TabsContent>
        <TabsContent value="market">
          <MarketTab />
        </TabsContent>
      </Tabs>

      <CardSheet
        card={pick}
        onClose={() => setPick(null)}
        onChange={() => setNonce((n) => n + 1)}
      />
    </>
  );
}
