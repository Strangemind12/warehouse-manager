import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TABLES = [
  "inventory",
  "transfers",
  "transfer_items",
  "stock_receipts",
  "stock_receipt_items",
  "products",
  "branches",
  "activity_log",
] as const;

/**
 * Keeps every screen live: any change to stock, transfers, receipts, products or
 * the activity log refreshes the open page immediately — no manual reload.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel("inventory-live");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void qc.invalidateQueries();
      });
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
