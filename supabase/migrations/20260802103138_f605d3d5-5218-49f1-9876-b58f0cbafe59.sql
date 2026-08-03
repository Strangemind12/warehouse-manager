ALTER TABLE public.product_types ADD COLUMN IF NOT EXISTS image_url text;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory','transfers','transfer_items','stock_receipts','stock_receipt_items','products','activity_log','branches']
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;