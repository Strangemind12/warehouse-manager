import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowLeftRight, ArrowRight, Send, Pencil, Search, FileText, Check, X } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { fmtDateTime } from "@/lib/format";
import { SearchableProductSelect } from "@/components/searchable-product-select";

export const Route = createFileRoute("/_authenticated/transfers")({
  component: TransfersPage,
});

type Line = { product_id: string; quantity: number };

function statusBadge(status: string) {
  if (status === "sent") return <Badge className="bg-success text-success-foreground">Sent</Badge>;
  if (status === "pending") return <Badge className="bg-warning text-warning-foreground">Pending approval</Badge>;
  if (status === "draft") return <Badge variant="outline">Draft</Badge>;
  if (status === "returned") return <Badge className="bg-destructive text-destructive-foreground">Returned — needs correction</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function TransfersPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<string>("draft");
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: 1 }]);
  const [q, setQ] = useState("");

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: async () => (await supabase.from("branches").select("*").order("is_warehouse", { ascending: false })).data ?? [] });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: async () => (await supabase.from("products").select("id, name, sku, unit").order("name")).data ?? [] });
  const { data: inv } = useQuery({ queryKey: ["inventory-map"], queryFn: async () => (await supabase.from("inventory").select("product_id, branch_id, quantity")).data ?? [] });
  const availAt = (pid: string, bid: string) => inv?.find(r => r.product_id === pid && r.branch_id === bid)?.quantity ?? 0;

  const { data: transfers } = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => (await supabase.from("transfers")
      .select("*, from_branch:branches!transfers_from_branch_id_fkey(name), to_branch:branches!transfers_to_branch_id_fkey(name), items:transfer_items(*, product:products(name, unit))")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = useMemo(() => (transfers ?? []).filter((t: any) => {
    if (!q) return true;
    const hay = `${t.invoice_no ?? ""} ${t.from_branch?.name} ${t.to_branch?.name} ${t.status}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [transfers, q]);

  const warehouse = branches?.find(b => b.is_warehouse);
  const canCreateTransfer = !!me?.isBranchStaff;
  const canDelete = !!me?.isWarehouseManager;
  const isAdmin = !!me?.isAdmin;

  function openNew() {
    setEditingId(null); setInitialStatus("draft");
    setFromBranch(me?.profile?.branch_id ?? warehouse?.id ?? branches?.[0]?.id ?? ""); setToBranch(""); setNotes("");
    setLines([{ product_id: "", quantity: 1 }]); setOpen(true);
  }
  function openEdit(t: any) {
    setEditingId(t.id); setInitialStatus(t.status);
    setFromBranch(t.from_branch_id); setToBranch(t.to_branch_id); setNotes(t.notes ?? "");
    setLines(t.items?.length ? t.items.map((i: any) => ({ product_id: i.product_id, quantity: i.quantity })) : [{ product_id: "", quantity: 1 }]);
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async (mode: "draft" | "submit") => {
      if (!fromBranch || !toBranch) throw new Error("Choose source and destination");
      if (fromBranch === toBranch) throw new Error("Source and destination must differ");
      const valid = lines.filter(l => l.product_id && l.quantity > 0);
      if (!valid.length) throw new Error("Add at least one line");
      // Store Officer Admins complete transfers themselves: the stock moves as
      // soon as it is saved, with no separate approval step.
      // Store Officer Admins complete transfers themselves: the stock moves as
      // soon as it is saved, with no separate approval step. The record is always
      // written first and only then flipped to "sent", so stock is deducted once.
      const target = mode === "draft" ? "draft" : isAdmin ? "sent" : "pending";
      const status = target === "sent" ? "draft" : target;

      let id = editingId;
      if (editingId) {
        const { error: uErr } = await supabase.from("transfers")
          .update({ from_branch_id: fromBranch, to_branch_id: toBranch, notes, status })
          .eq("id", editingId);
        if (uErr) throw uErr;
        await supabase.from("transfer_items").delete().eq("transfer_id", editingId);
        const { error: iErr } = await supabase.from("transfer_items")
          .insert(valid.map(l => ({ transfer_id: editingId, ...l })));
        if (iErr) throw iErr;
      } else {
        const { data: t, error } = await supabase.from("transfers").insert({
          from_branch_id: fromBranch, to_branch_id: toBranch, notes, created_by: me?.id, status,
        }).select().single();
        if (error) throw error;
        id = t.id;
        const { error: e2 } = await supabase.from("transfer_items").insert(valid.map(l => ({ transfer_id: t.id, ...l })));
        if (e2) throw e2;
      }
      if (target === "sent" && id) {
        const { error: sErr } = await supabase.from("transfers").update({ status: "sent" }).eq("id", id);
        if (sErr) throw sErr;
      }
      return target;
    },
    onSuccess: (status) => {
      toast.success(status === "draft" ? "Saved as draft — submit whenever you're ready" : status === "sent" ? "Transfer sent — stock moved immediately" : "Submitted for approval");
      qc.invalidateQueries(); setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const submitDraft = useMutation({
    mutationFn: async (id: string) => {
      const next = isAdmin ? "sent" : "pending";
      const { error } = await supabase.from("transfers").update({ status: next }).eq("id", id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => { toast.success(next === "sent" ? "Transfer sent — stock moved immediately" : "Draft submitted for approval"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const payload: any = approve
        ? { status: "sent", return_comment: null }
        : { status: "returned", return_comment: "Declined by Store Officer Admin — please correct and resubmit." };
      const { error } = await supabase.from("transfers").update(payload).eq("id", id);
      if (error) throw error;
      return approve;
    },
    onSuccess: (approve) => { toast.success(approve ? "Approved — stock moved" : "Declined and sent back"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });


  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transfers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transfer deleted"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Transfers</h1>
          <p className="text-muted-foreground mt-1 text-sm">{isAdmin
            ? "As a Store Officer Admin you move stock directly: saving a transfer sends it immediately and the quantities are deducted from the source and added to the destination on the spot. Requests submitted by supervisors or store officers can be approved or declined right here on the card."
            : "Request stock movement between locations. Save a partial request as a Draft to finish later, or submit it — the transfer stays Pending until a Store Officer Admin approves it. If it's declined with a comment, edit and resubmit."}</p>
        </div>
        {canCreateTransfer && <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New transfer</Button>}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by invoice, branch or status…" className="pl-9" />
      </div>

      {!filtered.length ? (
        <Card><CardContent className="p-10 text-center">
          <ArrowLeftRight className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">No transfers yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((t: any) => {
            const editable = (t.status === "draft" || t.status === "returned") && t.created_by === me?.id;
            const canSubmit = t.status === "draft" && (t.created_by === me?.id || isAdmin);
            const decidable = isAdmin && t.status === "pending";
            const isDeletable = canDelete || ((t.status === "draft" || t.status === "returned") && t.created_by === me?.id);
            return (
              <Card key={t.id} className={t.status === "returned" ? "border-destructive/40" : t.status === "draft" ? "border-dashed" : ""}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">{t.invoice_no ?? "—"}</span>
                        {statusBadge(t.status)}
                      </div>
                      <div className="flex items-center gap-2 font-medium mt-1 flex-wrap">
                        <span>{t.from_branch?.name}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span>{t.to_branch?.name}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Created {fmtDateTime(t.created_at)}{t.confirmed_at ? ` · Sent ${fmtDateTime(t.confirmed_at)}` : ""}</p>
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
                  {t.notes && <p className="text-xs text-muted-foreground italic">{t.notes}</p>}
                  {t.return_comment && (
                    <div className="text-xs bg-destructive/10 border border-destructive/30 rounded-md p-2">
                      <b>Admin comment:</b> {t.return_comment}
                    </div>
                  )}
                  {(editable || canSubmit || isDeletable || decidable) && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {decidable && (
                        <>
                          <Button size="sm" onClick={() => decide.mutate({ id: t.id, approve: true })} disabled={decide.isPending}><Check className="h-3.5 w-3.5 mr-1" /> Approve & send</Button>
                          <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: t.id, approve: false })} disabled={decide.isPending}><X className="h-3.5 w-3.5 mr-1" /> Decline</Button>
                        </>
                      )}
                      {editable && <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>}
                      {canSubmit && <Button size="sm" onClick={() => submitDraft.mutate(t.id)} disabled={submitDraft.isPending}><Send className="h-3.5 w-3.5 mr-1" /> {isAdmin ? "Send now" : "Submit for approval"}</Button>}
                      {isDeletable && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete transfer?</AlertDialogTitle>
                              <AlertDialogDescription>{t.status === "sent" ? "Stock will be reversed — added back to source, removed from destination." : "This transfer will be removed permanently."}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? (initialStatus === "returned" ? "Correct returned transfer" : "Edit draft transfer") : "New transfer"}</DialogTitle>
            <DialogDescription>
              {initialStatus === "returned"
                ? "The admin sent this back for correction. Fix the details and submit again."
                : "Save as a draft to finish later, or submit for admin approval."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Select value={fromBranch} onValueChange={setFromBranch}>
                  <SelectTrigger><SelectValue placeholder="Source location" /></SelectTrigger>
                  <SelectContent>{branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}{b.is_warehouse ? " (Warehouse)" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Select value={toBranch} onValueChange={setToBranch}>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>{branches?.filter(b => b.id !== fromBranch).map(b => <SelectItem key={b.id} value={b.id}>{b.name}{b.is_warehouse ? " (Warehouse)" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div>
              <Label>Items</Label>
              <div className="space-y-2 mt-2">
                {lines.map((l, i) => {
                  const avail = fromBranch && l.product_id ? availAt(l.product_id, fromBranch) : null;
                  const over = avail !== null && l.quantity > avail;
                  return (
                    <div key={i} className="space-y-1 rounded-md border p-2 sm:p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_auto] gap-2">
                        <SearchableProductSelect
                          products={products ?? []}
                          value={l.product_id || null}
                          onChange={v => setLines(ls => ls.map((x, j) => j === i ? { ...x, product_id: v } : x))}
                        />
                        <Input type="number" min={1} value={l.quantity} onChange={e => setLines(ls => ls.map((x, j) => j === i ? {...x, quantity: +e.target.value} : x))} />
                        <Button variant="ghost" size="icon" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                      {l.product_id && fromBranch && (
                        <p className={`text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}>Available at source: <b>{avail}</b>{over ? " — not enough to send" : ""}</p>
                      )}
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, { product_id: "", quantity: 1 }])}><Plus className="h-4 w-4 mr-1" /> Add line</Button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={() => save.mutate("draft")} disabled={save.isPending}>
              <FileText className="h-4 w-4 mr-1" /> Save as draft
            </Button>
            <Button onClick={() => save.mutate("submit")} disabled={save.isPending}>
              <Send className="h-4 w-4 mr-1" /> {isAdmin ? "Send now" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
