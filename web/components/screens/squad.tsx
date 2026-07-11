"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, LogOut, Table2, Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { shareInvite, inviteLink, notify } from "@/lib/telegram";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function SquadScreen() {
  const { go, enterTable, user } = useApp();
  const [squad, setSquad] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [joinCode, setJoinCode] = useState("");

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

  async function create() {
    try {
      await api.createSquad({ name, tag, emblem: "spade" });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function join() {
    try {
      await api.joinSquad(joinCode.trim().toUpperCase());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
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

  return (
    <>
      <PageHeader title="Squad" onBack={() => go("lobby")} />
      {squad ? (
        <>
          <Card className="items-center p-6 text-center">
            <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-gold/20 to-secondary">
              <Shield className="size-8 text-gold" />
            </div>
            <div className="mt-2 text-xl font-extrabold">
              {squad.name} {squad.tag && <span className="text-muted-foreground">[{squad.tag}]</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              #{squad.code} · {squad.members.length} members
            </div>
            <div className="mt-3 grid w-full grid-cols-2 gap-2">
              <Button
                onClick={() =>
                  user &&
                  shareInvite(
                    user,
                    "squad",
                    squad.code,
                    `Join my poker squad "${squad.name}" on Poker CM!`,
                  )
                }
              >
                <Share2 className="size-4" /> Invite
              </Button>
              <Button variant="secondary" onClick={squadTable}>
                <Table2 className="size-4" /> Squad Table
              </Button>
            </div>
            <button
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
              onClick={async () => {
                if (!user) return;
                try {
                  await navigator.clipboard.writeText(inviteLink(user, "squad", squad.code));
                  toast.success("Invite link copied");
                  notify("success");
                } catch {
                  /* ignore */
                }
              }}
            >
              <Copy className="size-3" /> Copy invite link
            </button>
          </Card>
          <Card className="mt-3 p-4">
            {squad.members.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0">
                <Avatar className="size-9 border border-white/10">
                  <AvatarFallback className="bg-secondary text-gold">
                    <AvatarIcon code={m.avatar} color={m.avatar_color} className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{m.display_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.role} · Lvl {m.level}
                  </div>
                </div>
              </div>
            ))}
          </Card>
          <Button variant="destructive" className="mt-3 w-full" onClick={leave}>
            <LogOut className="size-4" /> Leave Squad
          </Button>
        </>
      ) : (
        <>
          <Card className="gap-2 p-4">
            <div className="flex items-center gap-2 font-bold">
              <Shield className="size-4 text-gold" /> Create a Squad
            </div>
            <Input placeholder="Squad name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="TAG" maxLength={6} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} />
            <Button className="w-full font-bold" disabled={!name} onClick={create}>
              Create
            </Button>
          </Card>
          <Card className="mt-3 gap-2 p-4">
            <div className="font-bold">Join a Squad</div>
            <Input
              placeholder="SQUAD CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
            <Button variant="secondary" className="w-full font-bold" disabled={joinCode.length < 4} onClick={join}>
              Join
            </Button>
          </Card>
        </>
      )}
    </>
  );
}
