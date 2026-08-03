import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowLeftRight, Warehouse, History as HistoryIcon } from "lucide-react";
import { money, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

type Row = {
  kind: "transfer" | "receipt";
  id: string; invoice_no: string; date: string; status?: string;
  title: string; subtitle: string; by: string | null;
  amount?: number; items: { name: string; qty: number; unit: string; price?: number }[];
};

function HistoryPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
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
  const who = (id: string | null | undefined) => (id && people?.[id]) || null;

  const { data: transfers } = useQuery({
    queryKey: ["transfers-history"],
    queryFn: async () => (await supabase.from("transfers")
      .select("id, invoice_no, created_at, status, created_by, from_branch:branches!transfers_from_branch_id_fkey(name), to_branch:branches!transfers_to_branch_id_fkey(name), items:transfer_items(quantity, product:products(name, unit))")
      .order("created_at", { ascending: false })).data ?? [],
  });
  const { data: receipts } = useQuery({
    queryKey: ["receipts-history"],
    queryFn: async () => (await supabase.from("stock_receipts")
      .select("id, invoice_no, received_at, supplier_name, received_by, items:stock_receipt_items(quantity, unit_cost, product:products(name, unit))")
      .order("received_at", { ascending: false })).data ?? [],
  });

  const rows = useMemo<Row[]>(() => {
    const t: Row[] = (transfers ?? []).map((r: any) => ({
      kind: "transfer", id: r.id, invoice_no: r.invoice_no, date: r.created_at, status: r.status,
      title: `${r.from_branch?.name ?? "—"} → ${r.to_branch?.name ?? "—"}`, subtitle: "Internal stock transfer", by: who(r.created_by),
      items: (r.items ?? []).map((i: any) => ({ name: i.product?.name, qty: i.quantity, unit: i.product?.unit })),
    }));
    const g: Row[] = (receipts ?? []).map((r: any) => ({
      kind: "receipt", id: r.id, invoice_no: r.invoice_no, date: r.received_at,
      title: r.supplier_name, subtitle: "Warehouse receipt", by: who(r.received_by),
      amount: r.items?.reduce((a: number, b: any) => a + b.quantity * Number(b.unit_cost), 0) ?? 0,
      items: (r.items ?? []).map((i: any) => ({ name: i.product?.name, qty: i.quantity, unit: i.product?.unit, price: Number(i.unit_cost) })),
    }));
    return [...t, ...g].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [transfers, receipts, people]);


  const filtered = rows.filter(r => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (from && r.date < new Date(from).toISOString()) return false;
    if (to && r.date > new Date(new Date(to).getTime() + 86400000).toISOString()) return false;
    if (q) {
      const hay = `${r.invoice_no} ${r.title} ${r.subtitle} ${r.status ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const icon = (k: Row["kind"]) => k === "transfer" ? ArrowLeftRight : Warehouse;
  const label = (k: Row["kind"]) => k === "transfer" ? "Transfer" : "Receipt";

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2"><HistoryIcon className="h-6 w-6 text-primary" /> Activity history</h1>
        <p className="text-muted-foreground mt-1 text-sm">Every transfer and receipt remains in one timeline with invoice number, date, time, and the user who created it. Search by invoice number, supplier, store or status.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search invoice, name, status…" className="pl-9" />
        </div>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="transfer">Transfers</SelectItem>
            <SelectItem value="receipt">Receipts</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      {!filtered.length ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No activity matches your filters.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const Icon = icon(r.kind);
            return (
              <Card key={`${r.kind}-${r.id}`}>
                <CardContent className="pt-5 space-y-2">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0 flex items-start gap-3">
                      <div className="rounded-md p-2 bg-primary/10 text-primary shrink-0"><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{r.invoice_no}</span>
                          <Badge variant="outline" className="text-[10px]">{label(r.kind)}</Badge>
                          {r.status && <Badge className={r.status === "sent" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>{r.status === "sent" ? "Sent" : "Pending"}</Badge>}
                        </div>
                        <p className="font-semibold mt-1 truncate">{r.title}</p>
                        <p className="text-[11px] text-muted-foreground">{r.subtitle} · {fmtDateTime(r.date)}{r.by ? ` · by ${r.by}` : ""}</p>
                      </div>
                    </div>
                    {r.amount !== undefined && <p className="font-display text-base font-bold">{money(r.amount)}</p>}
                  </div>

                  <div className="divide-y">
                    {r.items.map((it, i) => (
                      <div key={i} className="py-1.5 flex justify-between text-sm gap-3">
                        <span className="min-w-0 truncate">{it.name}</span>
                        <span className="text-muted-foreground shrink-0">{it.qty} {it.unit}{it.price !== undefined ? ` × ${money(it.price)}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
