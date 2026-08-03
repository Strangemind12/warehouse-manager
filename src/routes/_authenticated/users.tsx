import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createStaffUser, resetStaffPassword, deleteStaffUser } from "@/lib/admin-users.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, KeyRound, Copy, Check, Eye, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { fmtDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

const ROLES = ["admin", "warehouse_manager", "branch_staff", "procurement"] as const;
type Role = typeof ROLES[number];
const NONE = "__none__";

function PasswordCell({ pw }: { pw: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <code className="text-[11px] font-mono bg-muted px-2 py-1 rounded border">
        {show ? pw : "•".repeat(Math.min(pw.length, 10))}
      </code>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShow(s => !s)}>
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7"
        onClick={async () => { await navigator.clipboard.writeText(pw); toast.success("Copied"); }}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function UsersPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const createStaff = useServerFn(createStaffUser);
  const resetPw = useServerFn(resetStaffPassword);
  const delUser = useServerFn(deleteStaffUser);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "branch_staff" as Role, branch_id: null as string | null });
  const [issued, setIssued] = useState<{ email: string; tempPassword: string; kind: "new" | "reset" } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ["users-and-roles"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }, { data: branches }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
        supabase.from("branches").select("*"),
      ]);
      const byUser = new Map<string, Role[]>();
      (roles ?? []).forEach(r => { byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role as Role]); });
      return { profiles: profiles ?? [], byUser, branches: branches ?? [] };
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error: del } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (del) throw del;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["users-and-roles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setBranch = useMutation({
    mutationFn: async ({ userId, branchId }: { userId: string; branchId: string | null }) => {
      const { error } = await supabase.from("profiles").update({ branch_id: branchId }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Branch assigned"); qc.invalidateQueries({ queryKey: ["users-and-roles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const invite = useMutation({
    mutationFn: async () => {
      const email = form.email.trim().toLowerCase();
      const full_name = form.full_name.trim();
      if (!email || !full_name) throw new Error("Full name and email are required");
      return await createStaff({ data: { email, full_name, role: form.role, branch_id: form.branch_id } });
    },
    onSuccess: (r) => {
      setIssued({ email: r.email, tempPassword: r.tempPassword, kind: "new" });
      setOpen(false);
      setForm({ email: "", full_name: "", role: "branch_staff", branch_id: null });
      qc.invalidateQueries({ queryKey: ["users-and-roles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: async (u: { userId: string; email: string }) => {
      const r = await resetPw({ data: { userId: u.userId } });
      return { email: u.email, tempPassword: r.tempPassword };
    },
    onSuccess: (r) => {
      setIssued({ email: r.email, tempPassword: r.tempPassword, kind: "reset" });
      qc.invalidateQueries({ queryKey: ["users-and-roles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => { await delUser({ data: { userId } }); },
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["users-and-roles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!me?.isAdmin) {
    return <Card><CardContent className="p-12 text-center text-muted-foreground">Admin only.</CardContent></Card>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Users & Roles</h1>
          <p className="text-muted-foreground mt-1 text-sm">Add supervisors or store officers, assign the store they work at, and manage their access. New accounts are created with a one-time password that the user is required to change the first time they sign in. As admin, you can view the current temporary password for any user who hasn't finished their reset, and you can generate a new one at any time.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add user</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {!data?.profiles.length ? (
            <div className="p-12 text-center"><Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No users yet.</p></div>
          ) : (
            <div className="divide-y">
              {data.profiles.map((u: any) => {
                const roles = data.byUser.get(u.id) ?? [];
                const currentRole: Role = (roles[0] ?? "branch_staff") as Role;
                const isSelf = u.id === me?.id;
                return (
                  <div key={u.id} className="p-4 space-y-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <p className="font-medium">{u.full_name || u.email} {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {roles.map(r => <Badge key={r} variant="secondary" className="text-[10px]">{roleLabel(r)}</Badge>)}
                          {u.must_change_password
                            ? <Badge variant="outline" className="text-[10px] border-warning text-warning">Awaiting password reset</Badge>
                            : u.password_updated_at
                              ? <Badge variant="outline" className="text-[10px]">Last changed {fmtDateTime(u.password_updated_at)}</Badge>
                              : null}
                        </div>
                      </div>
                      <Select value={currentRole} onValueChange={v => setRole.mutate({ userId: u.id, role: v as Role })}>
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={u.branch_id ?? "none"} onValueChange={v => setBranch.mutate({ userId: u.id, branchId: v === "none" ? null : v })}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="No branch" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— No branch —</SelectItem>
                          {data.branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-1">
                      {u.temp_password ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Temp password</span>
                          <PasswordCell pw={u.temp_password} />
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">User has set their own password.</span>
                      )}
                      <div className="ml-auto flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => reset.mutate({ userId: u.id, email: u.email })} disabled={reset.isPending}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset password
                        </Button>
                        {!isSelf && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {u.full_name || u.email}?</AlertDialogTitle>
                                <AlertDialogDescription>This permanently removes the user account. Their past activity records stay in the history.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove.mutate(u.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete user</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>The system creates the account and generates a temporary password. Share it with the person — they will be asked to set a new password the first time they sign in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Full name *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Grace Adeyemi" /></div>
            <div className="space-y-1.5"><Label>Work email *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="grace@laboria.ng" /></div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="warehouse_manager">Supervisor</SelectItem>
                  <SelectItem value="branch_staff">Store officer</SelectItem>
                  <SelectItem value="procurement">Procurement (view-only)</SelectItem>
                  <SelectItem value="admin">Store Officer Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned branch</Label>
              <Select value={form.branch_id ?? NONE} onValueChange={v => setForm({ ...form, branch_id: v === NONE ? null : v })}>
                <SelectTrigger><SelectValue placeholder="No branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— No branch —</SelectItem>
                  {data?.branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Store officers normally work from one store. Supervisors can be left unassigned.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => invite.mutate()} disabled={invite.isPending}>{invite.isPending ? "Creating…" : "Create account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={v => { if (!v) { setIssued(null); setCopied(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> {issued?.kind === "reset" ? "New temporary password" : "Temporary password"}</DialogTitle>
            <DialogDescription>Share this password with <b>{issued?.email}</b>. They will be forced to choose a new password on their next sign-in. You can always see it again on the user's row until they finish the reset.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted p-3 font-mono text-sm break-all">{issued?.tempPassword}</div>
            <Button
              onClick={async () => { if (issued) { await navigator.clipboard.writeText(issued.tempPassword); setCopied(true); toast.success("Copied"); } }}
              variant="outline" className="w-full"
            >
              {copied ? <><Check className="h-4 w-4 mr-1" /> Copied</> : <><Copy className="h-4 w-4 mr-1" /> Copy password</>}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => { setIssued(null); setCopied(false); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
