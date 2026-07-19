"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Shield, LogOut, Table2, Share2, Copy, Users, Crown, Star, Send,
  Search, Trophy, ChevronUp, ChevronDown, UserX, Globe, Lock, Swords, Pencil,
  Loader2, Check, X, Play,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { api, fmt } from "@/lib/api";
import { useApp } from "@/lib/store";
import { shareInvite, inviteLink, notify } from "@/lib/telegram";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { OnlineDot } from "@/components/online-dot";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const RANK: Record<string, number> = { owner: 3, officer: 2, member: 1 };

function RoleBadge({ role }: { role: string }) {
  if (role === "owner") return <Crown className="size-3.5 text-gold" />;
  if (role === "officer") return <Star className="size-3.5 text-gem" />;
  return null;
}

export function ClubScreen() {
  const { go, enterTable, user, openUser } = useApp();
  const [club, setClub] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setClub(await api.myClub());
    } catch {
      setClub(null);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function leave() {
    await api.leaveClub();
    toast("Left club");
    load();
  }
  async function clubTable() {
    try {
      const room = await api.createRoom({ name: club.name + " Table", is_private: true, allow_bots: true });
      await api.joinRoom(room.code, 2000);
      enterTable(room.code);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!loaded) {
    return (
      <>
        <PageHeader title="Club" onBack={() => go("lobby")} />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </>
    );
  }

  if (!club) return <NoClub onChanged={load} go={go} />;

  const myRole = club.my_role;
  const pct = Math.round((club.level_progress || 0) * 100);

  return (
    <>
      <PageHeader title="Club" onBack={() => go("lobby")} />

      {/* header */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold/25 to-secondary">
            <Shield className="size-7 text-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-extrabold">
              {club.name} {club.tag && <span className="text-muted-foreground">[{club.tag}]</span>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>#{club.code}</span>
              <span className="flex items-center gap-0.5">
                {club.is_public ? <Globe className="size-3" /> : <Lock className="size-3" />}
                {club.is_public ? "Public" : "Private"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-lg font-extrabold text-gold">Lv {club.level}</div>
            <div className="text-[10px] text-muted-foreground">{club.member_count}/{club.max_members}</div>
            {myRole === "owner" && (
              <Button variant="outline" size="icon" className="size-7" onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-gold to-[var(--color-gem)]" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[10px] font-bold text-gold">{fmt(club.weekly_cp_total || 0)} CP this week</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => user && shareInvite(user, "club", club.code, `Join my poker club "${club.name}"!`)}>
            <Share2 className="size-4" /> Invite
          </Button>
          <Button variant="secondary" size="sm" onClick={clubTable}>
            <Table2 className="size-4" /> New table
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="members" className="mt-3">
        <TabsList className="no-scrollbar w-full justify-start overflow-x-auto">
          <TabsTrigger value="members" className="shrink-0"><Trophy className="mr-1 size-4" />Leaderboard</TabsTrigger>
          <TabsTrigger value="games" className="shrink-0"><Table2 className="mr-1 size-4" />Games</TabsTrigger>
          <TabsTrigger value="chat" className="shrink-0"><Send className="mr-1 size-4" />Chat</TabsTrigger>
          <TabsTrigger value="ranks" className="shrink-0"><Users className="mr-1 size-4" />Clubs</TabsTrigger>
          {(myRole === "owner" || myRole === "officer") && (
            <TabsTrigger value="requests" className="shrink-0">
              Requests{club.pending_requests > 0 ? ` (${club.pending_requests})` : ""}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="members">
          <div className="mb-2 px-1 text-[11px] text-muted-foreground">
            Ranked by <b className="text-gold">Club Points</b> earned this week — CP comes from
            playing well in club games, and resets every Monday.
          </div>
          <Card className="p-2">
            {club.members.map((m: any) => (
              <MemberRow key={m.id} m={m} myRole={myRole} meId={user?.id}
                onOpen={() => openUser(m.id)} onChanged={load} />
            ))}
          </Card>
          <button
            className="mt-3 flex w-full items-center justify-center gap-1 py-2 text-xs text-muted-foreground"
            onClick={async () => {
              if (!user) return;
              try { await navigator.clipboard.writeText(inviteLink(user, "club", club.code)); toast.success("Invite link copied"); notify("success"); } catch {}
            }}
          >
            <Copy className="size-3" /> Copy invite link
          </button>
          <Button variant="destructive" className="mt-1 w-full" onClick={leave}>
            <LogOut className="size-4" /> {myRole === "owner" ? "Leave (hands off leadership)" : "Leave Club"}
          </Button>
        </TabsContent>

        <TabsContent value="games">
          <ClubGames onPlay={clubTable} />
        </TabsContent>

        <TabsContent value="chat">
          <ClubChat meId={user?.id} />
        </TabsContent>

        <TabsContent value="ranks">
          <ClubRanks myCode={club.code} />
        </TabsContent>

        {(myRole === "owner" || myRole === "officer") && (
          <TabsContent value="requests">
            <ClubRequests onChanged={load} openUser={openUser} />
          </TabsContent>
        )}
      </Tabs>

      <EditClubDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        club={club}
        onSaved={() => { setEditOpen(false); load(); }}
      />
    </>
  );
}

function EditClubDialog({ open, onOpenChange, club, onSaved }: any) {
  const [name, setName] = useState(club.name);
  const [tag, setTag] = useState(club.tag || "");
  const [desc, setDesc] = useState(club.description || "");
  const [isPublic, setIsPublic] = useState(!!club.is_public);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(club.name); setTag(club.tag || "");
      setDesc(club.description || ""); setIsPublic(!!club.is_public);
    }
  }, [open, club]);

  async function save() {
    setBusy(true);
    try {
      await api.clubEdit({ name, tag, description: desc, is_public: isPublic });
      toast.success("Club updated");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Club</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input placeholder="Club name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="TAG" maxLength={6} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} />
          <Input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button
            onClick={() => setIsPublic((v) => !v)}
            className="flex w-full items-center gap-3 rounded-lg bg-secondary p-3 text-left"
          >
            {isPublic ? <Globe className="size-5 text-gold" /> : <Lock className="size-5 text-muted-foreground" />}
            <div className="flex-1">
              <div className="text-sm font-semibold">{isPublic ? "Public" : "Private"}</div>
              <div className="text-[11px] text-muted-foreground">
                {isPublic ? "Anyone can find and join from Browse" : "Invite-only (code/link). Still shown in Ranks."}
              </div>
            </div>
          </button>
          <Button className="w-full font-bold" disabled={busy || !name} onClick={save}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({ m, myRole, meId, onOpen, onChanged }: any) {
  const canManage = myRole && RANK[myRole] > RANK[m.role] && m.id !== meId;
  const iAmOwner = myRole === "owner";
  async function run(fn: () => Promise<any>) {
    try { await fn(); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
      <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{m.place}</span>
      <button className="relative shrink-0" onClick={onOpen}>
        <Avatar className="size-9 border border-white/10">
          <AvatarFallback className="bg-secondary text-gold">
            <AvatarIcon code={m.avatar} color={m.avatar_color} className="size-4" />
          </AvatarFallback>
        </Avatar>
        <OnlineDot online={m.online} className="absolute -bottom-0.5 -right-0.5" />
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex items-center gap-1 truncate text-sm font-semibold" style={m.name_color ? { color: m.name_color } : undefined}>
          {m.display_name} <RoleBadge role={m.role} />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded bg-white/10 px-1 font-semibold">{m.rank}</span>
          <span>{m.role_label}</span>
          <span>· {fmt(m.contributed)} total</span>
        </div>
      </button>
      <div className="shrink-0 text-right">
        <div className="text-sm font-extrabold tabular-nums text-gold">{fmt(m.weekly_cp)}</div>
        <div className="text-[9px] uppercase text-muted-foreground">CP wk</div>
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          {iAmOwner && m.role === "member" && (
            <Button variant="outline" size="icon" className="size-7" onClick={() => run(() => api.clubPromote(m.id))}>
              <ChevronUp className="size-3.5" />
            </Button>
          )}
          {iAmOwner && m.role === "officer" && (
            <Button variant="outline" size="icon" className="size-7" onClick={() => run(() => api.clubDemote(m.id))}>
              <ChevronDown className="size-3.5" />
            </Button>
          )}
          <Button variant="outline" size="icon" className="size-7 text-lose" onClick={() => run(() => api.clubKick(m.id))}>
            <UserX className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function ClubChat({ meId }: { meId?: number }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const lastId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const rows: any[] = await api.clubMessages(lastId.current);
      if (rows.length) {
        lastId.current = rows[rows.length - 1].id;
        setMsgs((m) => [...m, ...rows].slice(-200));
      }
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    try { await api.clubSend(t); poll(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Card className="flex h-[52vh] flex-col p-0">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.length === 0 && <p className="pt-8 text-center text-sm text-muted-foreground">No messages yet. Say hi!</p>}
        {msgs.map((m) => {
          const mine = m.user_id === meId;
          return (
            <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
              {!mine && (
                <Avatar className="size-7 shrink-0 border border-white/10">
                  <AvatarFallback className="bg-secondary text-gold">
                    <AvatarIcon code={m.avatar} color={m.avatar_color} className="size-3.5" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={cn("max-w-[75%] rounded-2xl px-3 py-1.5", mine ? "bg-gold/20" : "bg-secondary")}>
                {!mine && <div className="text-[11px] font-bold" style={m.name_color ? { color: m.name_color } : undefined}>{m.name}</div>}
                <div className="text-sm break-words">{m.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t border-white/10 p-2">
        <Input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message your club…" />
        <Button size="icon" onClick={send}><Send className="size-4" /></Button>
      </div>
    </Card>
  );
}

function ClubRanks({ myCode }: { myCode: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    api.clubLeaderboard().then(setRows as never).catch(() => setRows([]));
  }, []);
  return (
    <Card className="p-2">
      {!rows ? <p className="p-2 text-sm text-muted-foreground">Loading…</p> :
        rows.map((s: any) => (
          <div key={s.code} className={cn("flex items-center gap-3 rounded-lg px-2 py-2.5", s.code === myCode && "bg-gold/10")}>
            <div className="w-6 text-center text-sm font-bold text-muted-foreground">
              {s.rank <= 3 ? <Trophy className="mx-auto size-4 text-gold" /> : s.rank}
            </div>
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary">
              <Shield className="size-4 text-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{s.name} {s.tag && <span className="text-muted-foreground">[{s.tag}]</span>}</div>
              <div className="text-xs text-muted-foreground">Lv {s.level} · {s.members} members</div>
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-gold">{fmt(s.xp)} XP</span>
          </div>
        ))}
    </Card>
  );
}

function NoClub({ onChanged, go }: { onChanged: () => void; go: (v: any) => void }) {
  const { enterTable } = useApp();
  void enterTable;
  const [tab, setTab] = useState("browse");
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    if (tab !== "browse") return;
    const t = setTimeout(() => api.clubBrowse(q).then(setList as never).catch(() => setList([])), 300);
    return () => clearTimeout(t);
  }, [q, tab]);

  async function join(code: string) {
    try { await api.joinClub(code); notify("success"); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  async function create() {
    try { await api.createClub({ name, tag, emblem: "spade", is_public: isPublic }); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <PageHeader title="Clubs" onBack={() => go("lobby")} />
      <Card className="mb-3 flex-row items-center gap-3 bg-secondary/40 p-3">
        <Swords className="size-5 shrink-0 text-gold" />
        <p className="text-xs text-muted-foreground">
          Clubs are clans — join one to play together, climb the club ranks, and chat.
        </p>
      </Card>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="browse" className="flex-1">Browse</TabsTrigger>
          <TabsTrigger value="create" className="flex-1">Create</TabsTrigger>
          <TabsTrigger value="join" className="flex-1">Join</TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clubs" className="pl-9" />
          </div>
          <Card className="p-2">
            {!list ? <p className="p-2 text-sm text-muted-foreground">Loading…</p> :
              list.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No clubs found. Create one!</p> :
              list.map((s: any) => (
                <div key={s.code} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
                    <Shield className="size-4 text-gold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{s.name} {s.tag && <span className="text-muted-foreground">[{s.tag}]</span>}</div>
                    <div className="text-xs text-muted-foreground">Lv {s.level} · {s.members}/{s.max_members}</div>
                  </div>
                  <Button size="sm" disabled={s.members >= s.max_members} onClick={() => join(s.code)}>
                    {s.members >= s.max_members ? "Full" : "Join"}
                  </Button>
                </div>
              ))}
          </Card>
        </TabsContent>

        <TabsContent value="create">
          <Card className="gap-2 p-4">
            <Input placeholder="Club name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="TAG (short)" maxLength={6} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} />
            <label className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Public (listed in Browse)
            </label>
            <Button className="w-full font-bold" disabled={!name} onClick={create}>Create Club</Button>
          </Card>
        </TabsContent>

        <TabsContent value="join">
          <Card className="gap-2 p-4">
            <Input placeholder="SQUAD CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="text-center text-lg font-bold tracking-widest" />
            <Button className="w-full font-bold" disabled={joinCode.length < 4} onClick={() => join(joinCode)}>Join</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

/* club games: open club cash tables + a create button; every hand earns CP */
function ClubGames({ onPlay }: { onPlay: () => void }) {
  const { enterTable } = useApp();
  const [games, setGames] = useState<any[] | null>(null);
  const load = useCallback(() => api.clubGames().then((r: any) => setGames(r.games)).catch(() => setGames([])), []);
  useEffect(() => { load(); }, [load]);
  async function join(code: string) {
    try { await api.joinRoom(code, null); enterTable(code); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <>
      <Button className="mb-2 w-full" onClick={onPlay}><Table2 className="size-4" /> New club table</Button>
      <div className="mb-2 px-1 text-[11px] text-muted-foreground">
        Play these with your club — every hand earns <b className="text-gold">Club Points</b>.
      </div>
      {!games ? (
        <Loader2 className="mx-auto mt-4 size-5 animate-spin text-gold" />
      ) : games.length === 0 ? (
        <Card className="items-center gap-1 p-6 text-center">
          <Table2 className="size-6 text-muted-foreground" />
          <div className="text-sm font-semibold">No open club tables</div>
          <div className="text-xs text-muted-foreground">Start one — your clubmates can join.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {games.map((g) => (
            <Card key={g.code} className="flex-row items-center gap-3 p-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-gold"><Table2 className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{g.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {g.players}/{g.max_players} · {fmt(g.small_blind)}/{fmt(g.big_blind)}
                </div>
              </div>
              <Button size="sm" onClick={() => join(g.code)}><Play className="size-3.5" /> Join</Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/* pending join requests (owner/manager) */
function ClubRequests({ onChanged, openUser }: { onChanged: () => void; openUser: (id: number) => void }) {
  const [reqs, setReqs] = useState<any[] | null>(null);
  const load = useCallback(() => api.clubRequests().then((r: any) => setReqs(r.requests)).catch(() => setReqs([])), []);
  useEffect(() => { load(); }, [load]);
  async function act(fn: (id: number) => Promise<any>, id: number) {
    try { await fn(id); load(); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  if (!reqs) return <Loader2 className="mx-auto mt-4 size-5 animate-spin text-gold" />;
  if (reqs.length === 0)
    return (
      <Card className="items-center gap-1 p-6 text-center">
        <Users className="size-6 text-muted-foreground" />
        <div className="text-sm font-semibold">No pending requests</div>
      </Card>
    );
  return (
    <Card className="p-2">
      {reqs.map((r) => (
        <div key={r.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2">
          <button className="shrink-0" onClick={() => openUser(r.user_id)}>
            <Avatar className="size-9 border border-white/10">
              <AvatarFallback className="bg-secondary text-gold">
                <AvatarIcon code={r.avatar} color={r.avatar_color} className="size-4" />
              </AvatarFallback>
            </Avatar>
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold" style={r.name_color ? { color: r.name_color } : undefined}>{r.display_name}</div>
            <div className="text-[11px] text-muted-foreground">Level {r.level}</div>
          </div>
          <Button size="icon" className="size-8" onClick={() => act(api.clubApprove, r.user_id)}><Check className="size-4" /></Button>
          <Button size="icon" variant="outline" className="size-8 text-lose" onClick={() => act(api.clubReject, r.user_id)}><X className="size-4" /></Button>
        </div>
      ))}
    </Card>
  );
}
