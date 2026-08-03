import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes, Package, Building2, AlertTriangle, TrendingUp, Warehouse, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [products, branches, inventory, transfers, receipts] = await Promise.all([
        supabase.from("products").select("id"),
        supabase.from("branches").select("id, name, is_warehouse"),
        supabase.from("inventory").select("product_id, branch_id, quantity, product:products(name, unit), branch:branches(name, is_warehouse)"),
        supabase.from("transfers").select("id, invoice_no, created_at, status, from_branch:branches!transfers_from_branch_id_fkey(name), to_branch:branches!transfers_to_branch_id_fkey(name)").order("created_at", { ascending: false }).limit(6),
        supabase.from("stock_receipts").select("id, invoice_no, received_at, supplier_name").order("received_at", { ascending: false }).limit(6),
      ]);
      const inv = inventory.data ?? [];
      const outOfStock = inv.filter((i: any) => i.quantity <= 0);
      return {
        productCount: products.data?.length ?? 0,
        branchCount: branches.data?.length ?? 0,
        warehouseStock: inv.filter((i: any) => i.branch?.is_warehouse).reduce((a: number, b: any) => a + b.quantity, 0),
        branchStock: inv.filter((i: any) => !i.branch?.is_warehouse).reduce((a: number, b: any) => a + b.quantity, 0),
        outOfStock,
        recentTransfers: transfers.data ?? [],
        recentReceipts: receipts.data ?? [],
      };
    },
  });

  const stats = [
    { label: "Products", value: data?.productCount ?? "—", icon: Package, hint: "SKUs in catalog" },
    { label: "Locations", value: data?.branchCount ?? "—", icon: Building2, hint: "Warehouse + stores" },
    { label: "Warehouse quantity", value: data?.warehouseStock ?? "—", icon: Warehouse, hint: "Main stock on hand" },
    { label: "Store quantity", value: data?.branchStock ?? "—", icon: Boxes, hint: "Distributed across stores" },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Operations dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">A live snapshot of stock across every location. All amounts are in Naira.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                    <p className="font-display text-2xl sm:text-3xl font-bold mt-1">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{s.hint}</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0"><Icon className="h-5 w-5" /></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-warning" /> Out of stock</CardTitle>
            <Link to="/inventory" className="text-xs text-primary hover:underline">View all →</Link>
          </CardHeader>
          <CardContent>
            {!data?.outOfStock.length && <p className="text-sm text-muted-foreground">All locations have stock on hand.</p>}
            <ul className="divide-y">
              {data?.outOfStock.slice(0, 8).map((row: any, i: number) => (
                <li key={i} className="py-2 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.product?.name}</p>
                    <p className="text-xs text-muted-foreground">{row.branch?.name}</p>
                  </div>
                  <Badge variant="destructive">0 {row.product?.unit}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-success" /> Recent activity</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1 flex items-center gap-1"><ArrowLeftRight className="h-3 w-3" /> Transfers</p>
              {data?.recentTransfers.map((t: any) => (
                <div key={t.id} className="flex justify-between gap-2 py-1">
                  <span className="truncate">{t.from_branch?.name} → {t.to_branch?.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{fmtDateTime(t.created_at)}</span>
                </div>
              ))}
              {!data?.recentTransfers.length && <p className="text-muted-foreground text-xs">No transfers yet.</p>}
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1 flex items-center gap-1"><Warehouse className="h-3 w-3" /> Receipts</p>
              {data?.recentReceipts.map((r: any) => (
                <div key={r.id} className="flex justify-between gap-2 py-1">
                  <span className="truncate">{r.supplier_name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{fmtDateTime(r.received_at)}</span>
                </div>
              ))}
              {!data?.recentReceipts.length && <p className="text-muted-foreground text-xs">No receipts yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
