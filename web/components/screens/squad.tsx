"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Shield, LogOut, Table2, Share2, Copy, Users, Crown, Star, Send,
  Search, Trophy, ChevronUp, ChevronDown, UserX, Globe, Lock, Swords,
} from "lucide-react";
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

export function SquadScreen() {
  const { go, enterTable, user, openUser } = useApp();
  const [squad, setSquad] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setSquad(await api.mySquad());
    } catch {
      setSquad(null);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function leave() {
    await api.leaveSquad();
    toast("Left squad");
    load();
  }
  async function squadTable() {
    try {
      const room = await api.createRoom({ name: squad.name + " Table", is_private: true, allow_bots: true });
      await api.joinRoom(room.code, 2000);
      enterTable(room.code);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!loaded) {
    return (
      <>
        <PageHeader title="Squad" onBack={() => go("lobby")} />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </>
    );
  }

  if (!squad) return <NoSquad onChanged={load} go={go} />;

  const myRole = squad.my_role;
  const pct = Math.round((squad.level_progress || 0) * 100);

  return (
    <>
      <PageHeader title="Squad" onBack={() => go("lobby")} />

      {/* header */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold/25 to-secondary">
            <Shield className="size-7 text-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-extrabold">
              {squad.name} {squad.tag && <span className="text-muted-foreground">[{squad.tag}]</span>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>#{squad.code}</span>
              <span className="flex items-center gap-0.5">
                {squad.is_public ? <Globe className="size-3" /> : <Lock className="size-3" />}
                {squad.is_public ? "Public" : "Private"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-gold">Lv {squad.level}</div>
            <div className="text-[10px] text-muted-foreground">{squad.member_count}/{squad.max_members}</div>
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-gold to-[var(--color-gem)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => user && shareInvite(user, "squad", squad.code, `Join my poker squad "${squad.name}"!`)}>
            <Share2 className="size-4" /> Invite
          </Button>
          <Button variant="secondary" size="sm" onClick={squadTable}>
            <Table2 className="size-4" /> Squad Table
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="members" className="mt-3">
        <TabsList className="w-full">
          <TabsTrigger value="members" className="flex-1"><Users className="mr-1 size-4" />Members</TabsTrigger>
          <TabsTrigger value="chat" className="flex-1"><Send className="mr-1 size-4" />Chat</TabsTrigger>
          <TabsTrigger value="ranks" className="flex-1"><Trophy className="mr-1 size-4" />Ranks</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card className="p-2">
            {squad.members.map((m: any) => (
              <MemberRow key={m.id} m={m} myRole={myRole} meId={user?.id}
                onOpen={() => openUser(m.id)} onChanged={load} />
            ))}
          </Card>
          <button
            className="mt-3 flex w-full items-center justify-center gap-1 py-2 text-xs text-muted-foreground"
            onClick={async () => {
              if (!user) return;
              try { await navigator.clipboard.writeText(inviteLink(user, "squad", squad.code)); toast.success("Invite link copied"); notify("success"); } catch {}
            }}
          >
            <Copy className="size-3" /> Copy invite link
          </button>
          <Button variant="destructive" className="mt-1 w-full" onClick={leave}>
            <LogOut className="size-4" /> {myRole === "owner" ? "Leave (hands off leadership)" : "Leave Squad"}
          </Button>
        </TabsContent>

        <TabsContent value="chat">
          <SquadChat meId={user?.id} />
        </TabsContent>

        <TabsContent value="ranks">
          <SquadRanks myCode={squad.code} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function MemberRow({ m, myRole, meId, onOpen, onChanged }: any) {
  const canManage = myRole && RANK[myRole] > RANK[m.role] && m.id !== meId;
  const iAmOwner = myRole === "owner";
  async function run(fn: () => Promise<any>) {
    try { await fn(); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
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
        <div className="text-xs text-muted-foreground">Lvl {m.level} · {fmt(m.contributed)} contributed</div>
      </button>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          {iAmOwner && m.role === "member" && (
            <Button variant="outline" size="icon" className="size-7" onClick={() => run(() => api.squadPromote(m.id))}>
              <ChevronUp className="size-3.5" />
            </Button>
          )}
          {iAmOwner && m.role === "officer" && (
            <Button variant="outline" size="icon" className="size-7" onClick={() => run(() => api.squadDemote(m.id))}>
              <ChevronDown className="size-3.5" />
            </Button>
          )}
          <Button variant="outline" size="icon" className="size-7 text-lose" onClick={() => run(() => api.squadKick(m.id))}>
            <UserX className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function SquadChat({ meId }: { meId?: number }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const lastId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const rows: any[] = await api.squadMessages(lastId.current);
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
    try { await api.squadSend(t); poll(); } catch (e) { toast.error((e as Error).message); }
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
          onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message your squad…" />
        <Button size="icon" onClick={send}><Send className="size-4" /></Button>
      </div>
    </Card>
  );
}

function SquadRanks({ myCode }: { myCode: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    api.squadLeaderboard().then(setRows as never).catch(() => setRows([]));
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

function NoSquad({ onChanged, go }: { onChanged: () => void; go: (v: any) => void }) {
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
    const t = setTimeout(() => api.squadBrowse(q).then(setList as never).catch(() => setList([])), 300);
    return () => clearTimeout(t);
  }, [q, tab]);

  async function join(code: string) {
    try { await api.joinSquad(code); notify("success"); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  async function create() {
    try { await api.createSquad({ name, tag, emblem: "spade", is_public: isPublic }); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <PageHeader title="Squads" onBack={() => go("lobby")} />
      <Card className="mb-3 flex-row items-center gap-3 bg-secondary/40 p-3">
        <Swords className="size-5 shrink-0 text-gold" />
        <p className="text-xs text-muted-foreground">
          Squads are clans — join one to play together, climb the squad ranks, and chat.
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search squads" className="pl-9" />
          </div>
          <Card className="p-2">
            {!list ? <p className="p-2 text-sm text-muted-foreground">Loading…</p> :
              list.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No squads found. Create one!</p> :
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
            <Input placeholder="Squad name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="TAG (short)" maxLength={6} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} />
            <label className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Public (listed in Browse)
            </label>
            <Button className="w-full font-bold" disabled={!name} onClick={create}>Create Squad</Button>
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
