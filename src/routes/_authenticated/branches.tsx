import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Warehouse, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/branches")({
  component: BranchesPage,
});

function BranchesPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", is_warehouse: false });

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("*").order("is_warehouse", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("branches").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Branch added");
      qc.invalidateQueries({ queryKey: ["branches"] });
      setOpen(false);
      setForm({ name: "", location: "", is_warehouse: false });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("branches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Branch deleted");
      qc.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hasWarehouse = branches?.some(b => b.is_warehouse);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Branches</h1>
          <p className="text-muted-foreground mt-1">The main warehouse supplies every branch store.</p>
        </div>
        {me?.isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add branch</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New branch</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Main Warehouse, Ikeja Branch..." /></div>
                <div className="space-y-1.5"><Label>Location</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="City, address" /></div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Main warehouse</p>
                    <p className="text-xs text-muted-foreground">Only one warehouse allowed. It supplies all branches.</p>
                  </div>
                  <Switch checked={form.is_warehouse} disabled={hasWarehouse && !form.is_warehouse} onCheckedChange={v => setForm({...form, is_warehouse: v})} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!hasWarehouse && me?.isAdmin && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="pt-6 flex items-center gap-3">
            <Warehouse className="h-5 w-5 text-warning" />
            <div className="flex-1">
              <p className="font-medium text-sm">No main warehouse set</p>
              <p className="text-xs text-muted-foreground">Create a branch and toggle "Main warehouse" to enable receiving and transfers.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches?.map(b => (
          <Card key={b.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className={`rounded-lg p-2.5 ${b.is_warehouse ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                  {b.is_warehouse ? <Warehouse className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                </div>
                {b.is_warehouse && <Badge>Main warehouse</Badge>}
              </div>
              <h3 className="font-display font-semibold text-lg mt-4">{b.name}</h3>
              <p className="text-sm text-muted-foreground">{b.location || "No location set"}</p>
              {me?.isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="mt-3 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {b.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the {b.is_warehouse ? "warehouse" : "branch"} and its inventory records. Sales, transfers, and receipts referencing it will block deletion.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(b.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
