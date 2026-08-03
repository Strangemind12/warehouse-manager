import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Trash2, Tag, FolderTree, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { fmtDateTime } from "@/lib/format";
import { ImagePicker, ProductImage } from "@/components/product-image";

export const Route = createFileRoute("/_authenticated/catalog")({
  component: CatalogPage,
});

type CatalogTable = "brands" | "categories" | "product_types";

function List({ table, icon: Icon, title, desc, addLabel, withImage }: { table: CatalogTable; icon: typeof Tag; title: string; desc: string; addLabel: string; withImage?: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: [table],
    queryFn: async () => (await supabase.from(table).select("*").order("name")).data ?? [],
  });
  const create = useMutation({
    mutationFn: async () => {
      const v = name.trim();
      if (!v) throw new Error("Name is required");
      const payload: any = withImage ? { name: v, image_url: image } : { name: v };
      const { error } = await (supabase.from(table) as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${addLabel} added`); qc.invalidateQueries({ queryKey: [table] }); setName(""); setImage(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const setItemImage = useMutation({
    mutationFn: async ({ id, image_url }: { id: string; image_url: string | null }) => {
      const { error } = await (supabase.from(table) as any).update({ image_url }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: [table] }); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-primary" /> {title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
          <div className="flex gap-2">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={`New ${addLabel.toLowerCase()}…`} />
            <Button type="submit" disabled={create.isPending}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
          {withImage && (
            <div className="rounded-md border p-2 space-y-1.5">
              <Label className="text-xs">Photo of this {addLabel.toLowerCase()} (optional)</Label>
              <ImagePicker value={image} onChange={setImage} size={56} compact />
              <p className="text-[10px] text-muted-foreground">Snap it with the device camera or pick from the gallery. The photo is saved together with the {addLabel.toLowerCase()} and shows up during receiving and in Inventory.</p>
            </div>
          )}
        </form>
        <div className="divide-y rounded-md border">
          {!data?.length && <p className="p-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
          {data?.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-3 min-w-0">
                {withImage && <ProductImage path={item.image_url} size={44} />}
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground">Added {fmtDateTime(item.created_at)}</p>
                  {withImage && (
                    <div className="mt-1">
                      <ImagePicker
                        value={item.image_url ?? null}
                        onChange={image_url => setItemImage.mutate({ id: item.id, image_url })}
                        size={0}
                        compact
                      />
                    </div>
                  )}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                    <AlertDialogDescription>Products currently using this {addLabel.toLowerCase()} will simply lose the label — nothing else is affected.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CatalogPage() {
  const { data: me } = useCurrentUser();
  if (!me?.isAdmin) return <p className="text-muted-foreground">Only admins can manage brands, categories and product types.</p>;
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Brands, Categories & Types</h1>
        <p className="text-muted-foreground mt-1 text-sm">Set up the brands you carry, the categories used for grouping, and the product types — every reagent or machine name lives here, with a photo so it can be recognised instantly during receiving and in Inventory.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <List table="product_types" icon={FlaskConical} title="Reagents & Machines (Product types)" addLabel="Type" desc="Every reagent or machine name you stock, each with its own photo. These names are the only options offered when creating a new item during receiving, so nothing gets duplicated." withImage />
        <List table="brands" icon={Tag} title="Brands" addLabel="Brand" desc="Manufacturers / suppliers whose items are stocked. Picked from a searchable list when recording a stock receipt." />
        <List table="categories" icon={FolderTree} title="Categories" addLabel="Category" desc="Finer product grouping — e.g. Haematology, Chemistry, Immunoassay, Analyser." />
      </div>
    </div>
  );
}
