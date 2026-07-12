"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, UserPlus, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/telegram";
import type { FriendCard } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarIcon } from "@/lib/avatars";
import { OnlineDot } from "@/components/online-dot";
import { cn } from "@/lib/utils";

function Row({ f, action }: { f: FriendCard; action?: React.ReactNode }) {
  const { openUser } = useApp();
  return (
    <div className="flex items-center gap-3 py-2">
      <button className="relative shrink-0" onClick={() => openUser(f.id)}>
        <Avatar className="size-9 border border-white/10">
          <AvatarFallback className="bg-secondary text-gold">
            <AvatarIcon code={f.avatar} color={f.avatar_color} className="size-4" />
          </AvatarFallback>
        </Avatar>
        <OnlineDot online={f.online} className="absolute -bottom-0.5 -right-0.5" />
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => openUser(f.id)}>
        <div
          className="truncate text-sm font-semibold"
          style={f.name_color ? { color: f.name_color } : undefined}
        >
          {f.display_name}
        </div>
        <div className="text-xs text-muted-foreground">Level {f.level}</div>
      </button>
      {action}
    </div>
  );
}

/** Friend management (search / add / requests). Lives inside Ranks → Friends. */
export function FriendsPanel() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FriendCard[] | null>(null);
  const [incoming, setIncoming] = useState<FriendCard[]>([]);

  const loadRequests = useCallback(async () => {
    try {
      const d = await api.friends();
      setIncoming(d.incoming || []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setResults(await api.friendSearch(q.trim()));
      } catch {
        setResults([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function add(id: number) {
    try {
      const r = await api.friendRequest(id);
      toast.success(r.status === "friends" ? "You're now friends!" : "Request sent");
      notify("success");
      if (q) setResults(await api.friendSearch(q.trim()));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function accept(id: number) {
    try {
      await api.friendAccept(id);
      toast.success("Friend added");
      notify("success");
      loadRequests();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="mb-3 gap-0 p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between p-3"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Search className="size-4 text-gold" /> Find players
          {incoming.length > 0 && (
            <span className="rounded-full bg-gold px-1.5 text-[10px] font-bold text-background">
              {incoming.length}
            </span>
          )}
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by @username"
              className="pl-9"
            />
          </div>

          {results !== null && (
            <div className="mt-2">
              {results.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No players found.</p>
              ) : (
                results.map((f) => (
                  <Row
                    key={f.id}
                    f={f}
                    action={
                      f.relation === "friends" ? (
                        <span className="text-xs text-win">Friends</span>
                      ) : f.relation === "outgoing" ? (
                        <span className="text-xs text-muted-foreground">Requested</span>
                      ) : f.relation === "incoming" ? (
                        <Button size="sm" onClick={() => accept(f.id)}>
                          <Check className="size-4" /> Accept
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => add(f.id)}>
                          <UserPlus className="size-4" /> Add
                        </Button>
                      )
                    }
                  />
                ))
              )}
            </div>
          )}

          {incoming.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Requests
              </div>
              {incoming.map((f) => (
                <Row
                  key={f.id}
                  f={f}
                  action={
                    <Button size="sm" onClick={() => accept(f.id)}>
                      <Check className="size-4" /> Accept
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
