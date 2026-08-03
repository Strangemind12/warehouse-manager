import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { FlaskConical } from "lucide-react";
import { DEFAULT_COMPANY_NAME } from "@/lib/roles";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/auth" });
  },
  pendingComponent: () => (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <FlaskConical className="h-8 w-8 animate-pulse text-primary" />
        <p className="text-sm">Loading {DEFAULT_COMPANY_NAME}…</p>
      </div>
    </div>
  ),
  component: () => null,
});
