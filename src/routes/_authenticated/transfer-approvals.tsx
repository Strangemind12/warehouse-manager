import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, ArrowRight, ClipboardCheck, Undo2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { money, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transfer-approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [returnFor, setReturnFor] = useState<{ kind: "transfer" | "receipt"; id: string; label: string } | null>(null);
  const [comment, setComment] = useState("");

  const { data: transfers } = useQuery({
    queryKey: ["transfer-approvals"],
    queryFn: async () => (await supabase.from("transfers")
      .select("*, creator:profiles(full_name,email), from_branch:branches!transfers_from_branch_id_fkey(name), to_branch:branches!transfers_to_branch_id_fkey(name), items:transfer_items(*, product:products(name, unit))")
      .eq("status", "pending")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const { data: receipts } = useQuery({
    queryKey: ["receipt-approvals"],
    queryFn: async () => (await supabase.from("stock_receipts")
      .select("*, receiver:profiles(full_name,email), items:stock_receipt_items(*, product:products(name, unit))")
      .eq("status", "pending")
      .order("received_at", { ascending: false })).data ?? [],
  });

  const confirmTransfer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transfers").update({ status: "sent" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transfer approved — stock moved"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const approveReceipt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("stock_receipts") as any).update({ status: "approved", approved_by: me?.id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Receipt approved — warehouse stock updated"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const returnItem = useMutation({
    mutationFn: async () => {
      if (!returnFor) return;
      if (!comment.trim()) throw new Error("Please add a comment so the submitter knows what to fix");
      const table = returnFor.kind === "transfer" ? "transfers" : "stock_receipts";
      const { error } = await (supabase.from(table) as any)
        .update({ status: "returned", return_comment: comment.trim() })
        .eq("id", returnFor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Returned for correction with your comment");
      qc.invalidateQueries(); setReturnFor(null); setComment("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!me?.isAdmin) return <Card><CardContent className="p-10 text-center text-muted-foreground">Store Officer Admin only.</CardContent></Card>;

  const tCount = transfers?.length ?? 0;
  const rCount = receipts?.length ?? 0;

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> Transfer &amp; Receiving Approvals</h1>
        <p className="text-muted-foreground mt-1 text-sm">Review pending transfer requests from store officers and pending receiving records from supervisors. Approve to complete the transaction and update stock automatically, or return with a comment so the submitter can correct it.</p>
      </div>

      <Tabs defaultValue="transfers">
        <TabsList>
          <TabsTrigger value="transfers">Transfers <Badge variant="secondary" className="ml-2">{tCount}</Badge></TabsTrigger>
          <TabsTrigger value="receipts">Receiving <Badge variant="secondary" className="ml-2">{rCount}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="transfers" className="space-y-3 pt-4">
          {!tCount ? (
            <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No pending transfers need approval.</CardContent></Card>
          ) : transfers!.map((t: any) => (
            <Card key={t.id}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{t.invoice_no ?? "—"}</span>
                      <Badge className="bg-warning text-warning-foreground">Pending</Badge>
                    </div>
                    <div className="flex items-center gap-2 font-medium mt-1 flex-wrap">
                      <span>{t.from_branch?.name}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /><span>{t.to_branch?.name}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Requested {fmtDateTime(t.created_at)}{t.creator ? ` · by ${t.creator.full_name || t.creator.email}` : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setReturnFor({ kind: "transfer", id: t.id, label: t.invoice_no ?? "transfer" }); setComment(t.return_comment ?? ""); }}>
                      <Undo2 className="h-3.5 w-3.5 mr-1" /> Return
                    </Button>
                    <Button size="sm" onClick={() => confirmTransfer.mutate(t.id)} disabled={confirmTransfer.isPending}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve &amp; send
                    </Button>
                  </div>
                </div>
                <div className="divide-y">
                  {t.items?.map((it: any) => (
                    <div key={it.id} className="py-1.5 flex justify-between text-sm gap-3">
                      <span className="min-w-0 truncate">{it.product?.name}</span>
                      <span className="text-muted-foreground shrink-0">{it.quantity} {it.product?.unit}</span>
                    </div>
                  ))}
                </div>
                {t.notes && <p className="text-xs italic text-muted-foreground">{t.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="receipts" className="space-y-3 pt-4">
          {!rCount ? (
            <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No pending receipts need approval.</CardContent></Card>
          ) : receipts!.map((r: any) => {
            const total = r.items?.reduce((a: number, b: any) => a + b.quantity * Number(b.unit_cost), 0) ?? 0;
            return (
              <Card key={r.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{r.invoice_no ?? "—"}</span>
                        <Badge className="bg-warning text-warning-foreground">Pending</Badge>
                      </div>
                      <p className="font-semibold mt-1 flex items-center gap-1"><Warehouse className="h-4 w-4 text-muted-foreground" /> {r.supplier_name}</p>
                      <p className="text-[11px] text-muted-foreground">Received {fmtDateTime(r.received_at)}{r.receiver ? ` · by ${r.receiver.full_name || r.receiver.email}` : ""}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <p className="font-display text-base font-bold">{money(total)}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setReturnFor({ kind: "receipt", id: r.id, label: r.invoice_no ?? "receipt" }); setComment(r.return_comment ?? ""); }}>
                          <Undo2 className="h-3.5 w-3.5 mr-1" /> Return
                        </Button>
                        <Button size="sm" onClick={() => approveReceipt.mutate(r.id)} disabled={approveReceipt.isPending}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y">
                    {r.items?.map((it: any) => (
                      <div key={it.id} className="py-1.5 flex justify-between text-sm gap-3">
                        <span className="min-w-0 truncate">{it.product?.name}</span>
                        <span className="text-muted-foreground shrink-0">{it.quantity} {it.product?.unit} × {money(it.unit_cost)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <Dialog open={!!returnFor} onOpenChange={v => { if (!v) { setReturnFor(null); setComment(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return {returnFor?.label} for correction</DialogTitle>
            <DialogDescription>Add a comment so the submitter knows what to fix. Their record moves to <b>Returned</b> and they can edit and resubmit it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Comment *</Label>
            <Textarea rows={4} value={comment} onChange={e => setComment(e.target.value)} placeholder="e.g. Quantities don't match the delivery note — please recount box 3." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReturnFor(null); setComment(""); }}>Cancel</Button>
            <Button onClick={() => returnItem.mutate()} disabled={returnItem.isPending}>Send back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
