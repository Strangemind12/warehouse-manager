import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { DEFAULT_COMPANY_NAME } from "@/lib/roles";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

const emailSchema = z.string().trim().email().max(255);
const passwordSchema = z.string().min(8, "At least 8 characters").max(72);

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      emailSchema.parse(email);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName, company_name: companyName || DEFAULT_COMPANY_NAME },
        },
      });
      if (error) throw error;
      toast.success("Account created. You can sign in now.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setLoading(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) { toast.error(res.error.message); setLoading(false); return; }
    if (res.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold">
          <FlaskConical className="h-6 w-6 text-sidebar-primary" />
          {DEFAULT_COMPANY_NAME}
        </Link>
        <div className="space-y-4">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Precision inventory for biomedical operations.
          </h1>
          <p className="text-sidebar-foreground/70 max-w-md">
            Track reagents and lab instruments across the central warehouse and every store — from receiving to transfer approval, in one place.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">© {DEFAULT_COMPANY_NAME}</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <div className="lg:hidden flex items-center gap-2 mb-6 font-display text-xl font-bold">
            <FlaskConical className="h-6 w-6 text-primary" /> {DEFAULT_COMPANY_NAME}
          </div>
          <h2 className="font-display text-2xl font-bold">Sign in to {DEFAULT_COMPANY_NAME}</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your inventory operations.</p>

          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" disabled={loading} className="w-full">Sign in</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label>Full name</Label>
                  <Input value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={100} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Company name</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} required maxLength={120} placeholder="Your company name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                </div>
                <Button type="submit" disabled={loading} className="w-full">Create account</Button>
                <p className="text-xs text-muted-foreground text-center">
                  Self-signups become admin for their own company. Staff should sign in with the password their admin gave them.
                </p>
              </form>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs uppercase text-muted-foreground">or</span>
            <div className="h-px bg-border flex-1" />
          </div>
          <Button type="button" variant="outline" onClick={google} disabled={loading} className="w-full">
            Continue with Google
          </Button>
        </Card>
      </div>
    </div>
  );
}
