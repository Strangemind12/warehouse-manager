import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ScrollText, ArrowLeftRight, Warehouse, Package, Building2, Boxes, UserCog, RotateCcw } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log — Warehouse Manager" },
      { name: "description", content: "Tamper-proof audit trail of every stock, product, location and user change with the exact date, time and the person who did it." },
      { property: "og:title", content: "Activity Log — Warehouse Manager" },
      { property: "og:description", content: "Tamper-proof audit trail of every stock, product, location and user change." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

type LogRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ENTITY_META: Record<string, { label: string; icon: typeof Package; hint: string }> = {
  transfer: { label: "Transfer", icon: ArrowLeftRight, hint: "Stock moved between the warehouse and a store" },
  receipt: { label: "Receiving", icon: Warehouse, hint: "Goods received into the warehouse" },
  product: { label: "Product", icon: Package, hint: "Item in your catalogue" },
  branch: { label: "Location", icon: Building2, hint: "Warehouse or store branch" },
  inventory: { label: "Stock level", icon: Boxes, hint: "Quantity available at a location" },
  user_role: { label: "User & role", icon: UserCog, hint: "Access rights for a team member" },
};

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  deleted: "Deleted",
  status_changed: "Status changed",
  stock_set: "Stock set",
  stock_changed: "Stock changed",
};

function actionTone(action: string) {
  if (action === "deleted") return "destructive" as const;
  if (action === "created" || action === "stock_set") return "default" as const;
  return "secondary" as const;
}

function ActivityPage() {
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");
  const [person, setPerson] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: people } = useQuery({
    queryKey: ["people-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      const m: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { m[p.id] = p.full_name || p.email || "Someone"; });
      return m;
    },
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
    refetchInterval: 30_000,
  });

  const who = (r: LogRow) => (r.actor_id && people?.[r.actor_id]) || r.actor_email || "System";

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (logs ?? []).filter(r => {
      if (entity !== "all" && r.entity_type !== entity) return false;
      if (action !== "all" && r.action !== action) return false;
      if (person !== "all" && r.actor_id !== person) return false;
      if (from && new Date(r.created_at) < new Date(`${from}T00:00:00`)) return false;
      if (to && new Date(r.created_at) > new Date(`${to}T23:59:59`)) return false;
      if (term) {
        const hay = `${r.summary} ${who(r)} ${r.entity_type} ${r.action} ${JSON.stringify(r.details ?? {})}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [logs, q, entity, action, person, from, to, people]);

  const grouped = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    rows.forEach(r => {
      const key = new Date(r.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [rows]);

  const actorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    (logs ?? []).forEach(r => { if (r.actor_id) seen.set(r.actor_id, (people?.[r.actor_id]) || r.actor_email || "Someone"); });
    return Array.from(seen.entries());
  }, [logs, people]);

  function resetFilters() {
    setQ(""); setEntity("all"); setAction("all"); setPerson("all"); setFrom(""); setTo("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" /> Activity Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          A permanent, tamper-proof record of everything that happens in your inventory: who did it, what changed and the exact
          date and time. Entries are written automatically by the system and cannot be edited or deleted by anyone.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search &amp; filter</CardTitle>
          <CardDescription>Find any action by keyword, type of record, person, or date range.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <Label className="text-xs">Keyword</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Invoice no, product, store, person…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Record type</Label>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All record types</SelectItem>
                {Object.entries(ENTITY_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">What happened</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {Object.entries(ACTION_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Performed by</Label>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {actorOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From date</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To date</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{rows.length}</span> of {logs?.length ?? 0} recorded activities
              (latest 500 kept in view).
            </p>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading activity…</p>}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-1">
            <ScrollText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No activity found</p>
            <p className="text-sm text-muted-foreground">
              Nothing matches your filters yet. Once your team receives goods, transfers stock or edits products, every step will
              appear here with a date and time stamp.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {grouped.map(([day, items]) => (
          <div key={day} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{day}</h2>
              <Badge variant="outline">{items.length} {items.length === 1 ? "activity" : "activities"}</Badge>
            </div>
            <div className="space-y-2">
              {items.map(r => {
                const meta = ENTITY_META[r.entity_type] ?? { label: r.entity_type, icon: ScrollText, hint: "System record" };
                const Icon = meta.icon;
                const details = Object.entries(r.details ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
                return (
                  <Card key={r.id}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex gap-3">
                        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={actionTone(r.action)}>{ACTION_LABEL[r.action] ?? r.action}</Badge>
                            <Badge variant="outline">{meta.label}</Badge>
                          </div>
                          <p className="text-sm font-medium break-words">{r.summary}</p>
                          <p className="text-xs text-muted-foreground">{meta.hint}</p>
                          <p className="text-xs text-muted-foreground">
                            Performed by <span className="font-medium text-foreground">{who(r)}</span> · {fmtDateTime(r.created_at)}
                          </p>
                          {details.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {details.map(([k, v]) => (
                                <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {k.replace(/_/g, " ")}: <span className="text-foreground">{String(v)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
