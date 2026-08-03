import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_COMPANY_NAME } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/company")({ component: CompanyPage });

function CompanyPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [form, setForm] = useState({ company_name: DEFAULT_COMPANY_NAME, address: "", phone: "", email: "" });

  useEffect(() => {
    if (me?.company) setForm({
      company_name: me.company.company_name || DEFAULT_COMPANY_NAME,
      address: me.company.address || "",
      phone: me.company.phone || "",
      email: me.company.email || me.email || "",
    });
  }, [me]);

  const save = useMutation({
    mutationFn: async () => {
      if (!me?.id) throw new Error("Sign in required");
      const payload = { owner_id: me.id, ...form, company_name: form.company_name.trim() || DEFAULT_COMPANY_NAME };
      const { error } = await (supabase as any).from("company_settings").upsert(payload, { onConflict: "owner_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Company details saved"); qc.invalidateQueries({ queryKey: ["current-user"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!me?.isAdmin) return <Card><CardContent className="p-10 text-center text-muted-foreground">Admin only.</CardContent></Card>;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" /> Company setup</h1>
        <p className="text-muted-foreground mt-1 text-sm">Set the company name and details shown throughout the website.</p>
      </div>
      <Card><CardContent className="pt-6 space-y-4">
        <div className="space-y-1.5"><Label>Company name</Label><Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save company details"}</Button>
      </CardContent></Card>
    </div>
  );
}