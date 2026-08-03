import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Building2, Warehouse, ArrowLeftRight, Users, FlaskConical,
  LogOut, Boxes, Menu, X, History, Tag, KeyRound, Settings, CheckSquare, ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DEFAULT_COMPANY_NAME, roleLabel } from "@/lib/roles";

function Pending() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <FlaskConical className="h-8 w-8 animate-pulse text-primary" />
        <p className="text-sm">Checking your session…</p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  pendingComponent: Pending,
  component: AuthedLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean; managerOnly?: boolean };
const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/catalog", label: "Brands & Categories", icon: Tag, adminOnly: true },
  { to: "/branches", label: "Branches", icon: Building2 },
  { to: "/receiving", label: "Receiving", icon: Warehouse },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/transfer-approvals", label: "Transfer & Receiving Approvals", icon: CheckSquare, adminOnly: true },
  { to: "/history", label: "History", icon: History },
  { to: "/activity", label: "Activity Log", icon: ScrollText },

  { to: "/company", label: "Company Setup", icon: Settings, adminOnly: true },
  { to: "/users", label: "Users & Roles", icon: Users, adminOnly: true },
];

function AuthedLayout() {
  const { data: me } = useCurrentUser();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: s => s.location.pathname });
  useRealtimeSync();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  if (me?.profile?.must_change_password) {
    return <ForceReset onDone={() => qc.invalidateQueries({ queryKey: ["current-user"] })} onSignOut={signOut} />;
  }



  return (
    <div className="min-h-screen bg-background flex">
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform lg:translate-x-0 lg:static",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-2 font-display font-bold text-lg">
            <FlaskConical className="h-5 w-5 text-sidebar-primary" />
            {me?.companyName || DEFAULT_COMPANY_NAME}
          </Link>
          <button className="lg:hidden text-sidebar-foreground/70" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.filter(n => (!n.adminOnly || me?.isAdmin) && (!n.managerOnly || me?.isWarehouseManager)).map(item => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to as string} onClick={() => setOpen(false)} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">{me?.profile?.full_name || me?.email}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {me?.roles.map(r => <Badge key={r} variant="secondary" className="text-[10px]">{roleLabel(r)}</Badge>)}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 sm:h-16 border-b bg-card/50 backdrop-blur px-3 sm:px-4 flex items-center gap-3 sticky top-0 z-20">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="flex-1" />
          <div className="text-xs text-muted-foreground hidden sm:block">{me?.companyName || DEFAULT_COMPANY_NAME} · Inventory</div>
        </header>
        <main className="flex-1 p-3 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

function ForceReset({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw1 !== pw2) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase.from("profiles").update({ must_change_password: false }).eq("id", auth.user.id);
      }
      toast.success("Password updated");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Set a new password</CardTitle>
          <CardDescription>You signed in with a one-time password. Please choose a new password to keep your account secure. You will use this new password from now on.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1.5"><Label>New password</Label><Input type="password" value={pw1} onChange={e => setPw1(e.target.value)} autoFocus /></div>
            <div className="space-y-1.5"><Label>Confirm password</Label><Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></div>
            <p className="text-[11px] text-muted-foreground">Use at least 8 characters. Mix letters, numbers and a symbol.</p>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save & continue"}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={onSignOut}><LogOut className="h-4 w-4 mr-1" /> Sign out instead</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

