
-- Attach missing triggers
DROP TRIGGER IF EXISTS set_sale_invoice_trg ON public.sales;
CREATE TRIGGER set_sale_invoice_trg BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_sale_invoice();
DROP TRIGGER IF EXISTS confirm_sale_trg ON public.sales;
CREATE TRIGGER confirm_sale_trg BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.confirm_sale();
DROP TRIGGER IF EXISTS reverse_sale_trg ON public.sales;
CREATE TRIGGER reverse_sale_trg BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.reverse_sale();

DROP TRIGGER IF EXISTS set_transfer_invoice_trg ON public.transfers;
CREATE TRIGGER set_transfer_invoice_trg BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.set_transfer_invoice();
DROP TRIGGER IF EXISTS confirm_transfer_trg ON public.transfers;
CREATE TRIGGER confirm_transfer_trg BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.confirm_transfer();
DROP TRIGGER IF EXISTS reverse_transfer_trg ON public.transfers;
CREATE TRIGGER reverse_transfer_trg BEFORE DELETE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.reverse_transfer();

DROP TRIGGER IF EXISTS set_receipt_invoice_trg ON public.stock_receipts;
CREATE TRIGGER set_receipt_invoice_trg BEFORE INSERT ON public.stock_receipts FOR EACH ROW EXECUTE FUNCTION public.set_receipt_invoice();

DROP TRIGGER IF EXISTS apply_receipt_item_trg ON public.stock_receipt_items;
CREATE TRIGGER apply_receipt_item_trg AFTER INSERT ON public.stock_receipt_items FOR EACH ROW EXECUTE FUNCTION public.apply_receipt_item();

-- Reverse warehouse stock when receipt item is removed
CREATE OR REPLACE FUNCTION public.reverse_receipt_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wh UUID;
BEGIN
  SELECT id INTO wh FROM public.branches WHERE is_warehouse = true LIMIT 1;
  IF wh IS NOT NULL THEN
    PERFORM public.adjust_inventory(OLD.product_id, wh, -OLD.quantity);
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS reverse_receipt_item_trg ON public.stock_receipt_items;
CREATE TRIGGER reverse_receipt_item_trg BEFORE DELETE ON public.stock_receipt_items FOR EACH ROW EXECUTE FUNCTION public.reverse_receipt_item();

DROP TRIGGER IF EXISTS touch_products_trg ON public.products;
CREATE TRIGGER touch_products_trg BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cascade so product delete works even with historical children
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_product_id_fkey;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.transfer_items DROP CONSTRAINT IF EXISTS transfer_items_product_id_fkey;
ALTER TABLE public.transfer_items ADD CONSTRAINT transfer_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.stock_receipt_items DROP CONSTRAINT IF EXISTS stock_receipt_items_product_id_fkey;
ALTER TABLE public.stock_receipt_items ADD CONSTRAINT stock_receipt_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.stock_receipt_items DROP CONSTRAINT IF EXISTS stock_receipt_items_receipt_id_fkey;
ALTER TABLE public.stock_receipt_items ADD CONSTRAINT stock_receipt_items_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.stock_receipts(id) ON DELETE CASCADE;

-- Allow admin/wm to update & delete receipts
DROP POLICY IF EXISTS "admin manage receipts" ON public.stock_receipts;
CREATE POLICY "admin manage receipts" ON public.stock_receipts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse_manager'));
DROP POLICY IF EXISTS "admin manage receipt items" ON public.stock_receipt_items;
CREATE POLICY "admin manage receipt items" ON public.stock_receipt_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse_manager'));

-- Product types (Reagent / Machine / etc.)
CREATE TABLE IF NOT EXISTS public.product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_types TO authenticated;
GRANT ALL ON public.product_types TO service_role;
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read product types" ON public.product_types;
CREATE POLICY "read product types" ON public.product_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin manage product types" ON public.product_types;
CREATE POLICY "admin manage product types" ON public.product_types FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type_id uuid REFERENCES public.product_types(id) ON DELETE SET NULL;

-- First-login password reset flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Seed defaults so the picker isn't empty
INSERT INTO public.product_types (name) VALUES ('Reagent'), ('Machine')
  ON CONFLICT (name) DO NOTHING;
