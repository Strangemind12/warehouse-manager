import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ImageIcon, Upload, Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Renders a stored product-images path as a signed image URL. */
export function ProductImage({ path, size = 40, className }: { path: string | null | undefined; size?: number; className?: string }) {
  const { data } = useQuery({
    queryKey: ["product-image", path],
    enabled: !!path,
    staleTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("product-images").createSignedUrl(path!, 60 * 60);
      if (error) return null;
      return data.signedUrl;
    },
  });
  const s = { width: size, height: size };
  if (!path) return <div style={s} className={`rounded bg-muted flex items-center justify-center shrink-0 ${className ?? ""}`}><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>;
  if (!data) return <div style={s} className={`rounded bg-muted animate-pulse shrink-0 ${className ?? ""}`} />;
  return <img src={data} alt="" style={s} className={`rounded object-cover border shrink-0 ${className ?? ""}`} loading="lazy" />;
}

export async function uploadProductImage(file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

/**
 * Image picker with two entry points: take a photo with the device camera, or
 * choose an existing picture from the gallery / files.
 */
export function ImagePicker({
  value, onChange, size = 72, busy, compact,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  size?: number;
  busy?: boolean;
  compact?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      {size > 0 && <ProductImage path={value} size={size} />}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ""; }} />
      <input ref={galRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ""; }} />
      <div className={compact ? "flex gap-1" : "flex flex-wrap gap-2"}>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => camRef.current?.click()}>
          <Camera className="h-4 w-4 mr-1" /> {busy ? "Uploading…" : "Camera"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => galRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1" /> Gallery
        </Button>
        {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Remove</Button>}
      </div>
    </div>
  );

  async function handle(file: File) {
    try {
      const path = await uploadProductImage(file);
      onChange(path);
      toast.success("Image saved");
    } catch (e: any) {
      toast.error(e.message ?? "Could not upload the image");
    }
  }
}
