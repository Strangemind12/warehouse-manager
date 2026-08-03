
-- 1) Fix duplicate/wrong stock triggers so pending items don't move stock
DROP TRIGGER IF EXISTS trg_sale_item ON public.sale_items;
DROP TRIGGER IF EXISTS trg_transfer_item ON public.transfer_items;

-- Drop duplicate paired triggers (keep one of each)
DROP TRIGGER IF EXISTS trg_sale_invoice ON public.sales;
DROP TRIGGER IF EXISTS trg_reverse_sale ON public.sales;
DROP TRIGGER IF EXISTS trg_confirm_sale ON public.sales;

DROP TRIGGER IF EXISTS trg_transfer_invoice ON public.transfers;
DROP TRIGGER IF EXISTS trg_reverse_transfer ON public.transfers;
DROP TRIGGER IF EXISTS trg_confirm_transfer ON public.transfers;

DROP TRIGGER IF EXISTS trg_receipt_invoice ON public.stock_receipts;
DROP TRIGGER IF EXISTS trg_receipt_item ON public.stock_receipt_items;

DROP TRIGGER IF EXISTS touch_products_trg ON public.products;

-- 2) Profile columns for password reset visibility
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS temp_password text,
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz;

-- 3) Clear temp_password once user finishes their forced reset
CREATE OR REPLACE FUNCTION public.clear_temp_password_on_reset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.must_change_password = true AND NEW.must_change_password = false THEN
    NEW.temp_password := NULL;
    NEW.password_updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_clear_temp_pw ON public.profiles;
CREATE TRIGGER trg_clear_temp_pw BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.clear_temp_password_on_reset();

-- 4) Allow warehouse managers to create/edit products (needed since Products page is being removed
--    and new products are created inline from Receiving)
DROP POLICY IF EXISTS "admin manage products" ON public.products;
CREATE POLICY "wm manage products" ON public.products
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'warehouse_manager'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'warehouse_manager'));
