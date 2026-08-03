import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { ProductImage } from "@/components/product-image";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: InventoryPage,
});

function InventoryPage() {
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("*").order("is_warehouse", { ascending: false })).data ?? [],
  });

  const { data: rows } = useQuery({
    queryKey: ["inventory-full"],
    queryFn: async () => (await supabase.from("inventory")
      .select("*, product:products(id, sku, name, unit, image_url, product_type:product_types(name, image_url)), branch:branches(id, name, is_warehouse)")
      .order("quantity")).data ?? [],
  });

  const filtered = useMemo(() => (rows ?? []).filter((r: any) => {
    if (branchFilter !== "all" && r.branch_id !== branchFilter) return false;
    if (q && !`${r.product?.name} ${r.product?.sku} ${r.branch?.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, q, branchFilter]);

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Inventory</h1>
        <p className="text-muted-foreground mt-1 text-sm">Live stock levels for every product at every location. The quantity here is the total <b>available</b> — it increases when stock is received, and decreases when a sale or outbound transfer is confirmed as <b>sent</b>.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search product, SKU or branch…" className="pl-9" />
        </div>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}{b.is_warehouse ? " (Warehouse)" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!filtered.length ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No stock records match your filters.</CardContent></Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r: any) => {
            const zero = r.quantity <= 0;
            return (
              <Card key={r.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-3 min-w-0">
                      <ProductImage path={r.product?.image_url ?? r.product?.product_type?.image_url} size={56} />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{r.product?.name}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{r.product?.sku}</p>
                        <p className="text-xs mt-1">
                          {r.branch?.name}
                          {r.branch?.is_warehouse && <Badge variant="outline" className="ml-2 text-[10px]">WH</Badge>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold">{r.quantity}</p>
                      <p className="text-[10px] text-muted-foreground">{r.product?.unit}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {zero ? <Badge variant="destructive">Out of stock</Badge> : <Badge className="bg-success text-success-foreground">In stock</Badge>}
                    <p className="text-[10px] text-muted-foreground">Updated {fmtDateTime(r.updated_at)}</p>
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
