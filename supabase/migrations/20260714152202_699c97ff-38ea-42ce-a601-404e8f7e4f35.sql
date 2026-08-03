-- Products: pack size
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pack_size integer NOT NULL DEFAULT 1;

-- Transfers: draft + returned + return_comment
ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_status_check;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_status_check
  CHECK (status = ANY (ARRAY['draft','pending','sent','completed','cancelled','returned']));
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS return_comment text;

DROP POLICY IF EXISTS "team create pending transfers" ON public.transfers;
CREATE POLICY "team create transfers" ON public.transfers FOR INSERT TO authenticated
WITH CHECK (
  status IN ('draft','pending') AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'warehouse_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'branch_staff'::public.app_role)
  )
);

DROP POLICY IF EXISTS "submitter edit own transfers" ON public.transfers;
CREATE POLICY "submitter edit own transfers" ON public.transfers FOR UPDATE TO authenticated
USING (created_by = auth.uid() AND status IN ('draft','returned','pending'))
WITH CHECK (created_by = auth.uid() AND status IN ('draft','pending'));

DROP POLICY IF EXISTS "submitter delete own drafts" ON public.transfers;
CREATE POLICY "submitter delete own drafts" ON public.transfers FOR DELETE TO authenticated
USING (created_by = auth.uid() AND status IN ('draft','returned'));

DROP POLICY IF EXISTS "submitter manage own transfer items" ON public.transfer_items;
CREATE POLICY "submitter manage own transfer items" ON public.transfer_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.created_by = auth.uid() AND t.status IN ('draft','pending','returned')))
WITH CHECK (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.created_by = auth.uid() AND t.status IN ('draft','pending','returned')));

-- Stock receipts approval
ALTER TABLE public.stock_receipts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS return_comment text;

ALTER TABLE public.stock_receipts DROP CONSTRAINT IF EXISTS stock_receipts_status_check;
ALTER TABLE public.stock_receipts ADD CONSTRAINT stock_receipts_status_check
  CHECK (status = ANY (ARRAY['pending','approved','returned']));

UPDATE public.stock_receipts SET status='approved', approved_at = COALESCE(approved_at, received_at) WHERE status = 'pending';

DROP TRIGGER IF EXISTS apply_receipt_item_trg ON public.stock_receipt_items;
DROP TRIGGER IF EXISTS reverse_receipt_item_trg ON public.stock_receipt_items;

CREATE OR REPLACE FUNCTION public.approve_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wh uuid; it record;
BEGIN
  IF NEW.status='approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT id INTO wh FROM public.branches WHERE is_warehouse LIMIT 1;
    IF wh IS NULL THEN RAISE EXCEPTION 'No warehouse branch configured'; END IF;
    FOR it IN SELECT product_id, quantity FROM public.stock_receipt_items WHERE receipt_id=NEW.id LOOP
      PERFORM public.adjust_inventory(it.product_id, wh, it.quantity);
    END LOOP;
    NEW.approved_at := now();
  ELSIF OLD.status='approved' AND NEW.status <> 'approved' THEN
    SELECT id INTO wh FROM public.branches WHERE is_warehouse LIMIT 1;
    IF wh IS NOT NULL THEN
      FOR it IN SELECT product_id, quantity FROM public.stock_receipt_items WHERE receipt_id=NEW.id LOOP
        PERFORM public.adjust_inventory(it.product_id, wh, -it.quantity);
      END LOOP;
    END IF;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS approve_receipt_trg ON public.stock_receipts;
CREATE TRIGGER approve_receipt_trg BEFORE UPDATE OF status ON public.stock_receipts
FOR EACH ROW EXECUTE FUNCTION public.approve_receipt();

CREATE OR REPLACE FUNCTION public.reverse_receipt_on_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wh uuid; it record;
BEGIN
  IF OLD.status='approved' THEN
    SELECT id INTO wh FROM public.branches WHERE is_warehouse LIMIT 1;
    IF wh IS NOT NULL THEN
      FOR it IN SELECT product_id, quantity FROM public.stock_receipt_items WHERE receipt_id=OLD.id LOOP
        PERFORM public.adjust_inventory(it.product_id, wh, -it.quantity);
      END LOOP;
    END IF;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS reverse_receipt_on_delete_trg ON public.stock_receipts;
CREATE TRIGGER reverse_receipt_on_delete_trg BEFORE DELETE ON public.stock_receipts
FOR EACH ROW EXECUTE FUNCTION public.reverse_receipt_on_delete();

DROP POLICY IF EXISTS "wm create receipts" ON public.stock_receipts;
CREATE POLICY "team create receipts" ON public.stock_receipts FOR INSERT TO authenticated
WITH CHECK (
  status='pending' AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'warehouse_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'branch_staff'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement'::public.app_role)
  )
);

DROP POLICY IF EXISTS "submitter edit own receipts" ON public.stock_receipts;
CREATE POLICY "submitter edit own receipts" ON public.stock_receipts FOR UPDATE TO authenticated
USING (received_by = auth.uid() AND status IN ('pending','returned'))
WITH CHECK (received_by = auth.uid() AND status IN ('pending','returned'));

DROP POLICY IF EXISTS "admin approve receipts" ON public.stock_receipts;
CREATE POLICY "admin approve receipts" ON public.stock_receipts FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "submitter manage own receipt items" ON public.stock_receipt_items;
CREATE POLICY "submitter manage own receipt items" ON public.stock_receipt_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.stock_receipts r WHERE r.id = receipt_id AND r.received_by = auth.uid() AND r.status IN ('pending','returned')))
WITH CHECK (EXISTS (SELECT 1 FROM public.stock_receipts r WHERE r.id = receipt_id AND r.received_by = auth.uid() AND r.status IN ('pending','returned')));