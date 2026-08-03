
-- ============ Brands & Categories ============
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read brands" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage brands" ON public.brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ Product columns ============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ============ Invoice numbers ============
CREATE SEQUENCE IF NOT EXISTS public.invoice_seq START 1000;

CREATE OR REPLACE FUNCTION public.gen_invoice(prefix text)
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT prefix || '-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.invoice_seq')::text, 5, '0')
$$;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS invoice_no text UNIQUE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.stock_receipts
  ADD COLUMN IF NOT EXISTS invoice_no text UNIQUE;

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS invoice_no text UNIQUE,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.transfers ALTER COLUMN status SET DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.set_sale_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN IF NEW.invoice_no IS NULL THEN NEW.invoice_no := public.gen_invoice('SO'); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_sale_invoice ON public.sales;
CREATE TRIGGER trg_sale_invoice BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_sale_invoice();

CREATE OR REPLACE FUNCTION public.set_receipt_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN IF NEW.invoice_no IS NULL THEN NEW.invoice_no := public.gen_invoice('GRN'); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_receipt_invoice ON public.stock_receipts;
CREATE TRIGGER trg_receipt_invoice BEFORE INSERT ON public.stock_receipts FOR EACH ROW EXECUTE FUNCTION public.set_receipt_invoice();

CREATE OR REPLACE FUNCTION public.set_transfer_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN IF NEW.invoice_no IS NULL THEN NEW.invoice_no := public.gen_invoice('TR'); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_transfer_invoice ON public.transfers;
CREATE TRIGGER trg_transfer_invoice BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.set_transfer_invoice();

-- ============ Gate stock movement on status = sent ============
DROP TRIGGER IF EXISTS apply_sale_item ON public.sale_items;
DROP TRIGGER IF EXISTS trg_apply_sale_item ON public.sale_items;
DROP TRIGGER IF EXISTS apply_transfer_item ON public.transfer_items;
DROP TRIGGER IF EXISTS trg_apply_transfer_item ON public.transfer_items;

CREATE OR REPLACE FUNCTION public.confirm_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it RECORD; avail int;
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS DISTINCT FROM 'sent') THEN
    FOR it IN SELECT product_id, quantity FROM public.sale_items WHERE sale_id = NEW.id LOOP
      SELECT quantity INTO avail FROM public.inventory WHERE product_id = it.product_id AND branch_id = NEW.branch_id;
      IF COALESCE(avail,0) < it.quantity THEN
        RAISE EXCEPTION 'Insufficient stock at source branch for one of the items (have %, need %)', COALESCE(avail,0), it.quantity;
      END IF;
    END LOOP;
    FOR it IN SELECT product_id, quantity FROM public.sale_items WHERE sale_id = NEW.id LOOP
      PERFORM public.adjust_inventory(it.product_id, NEW.branch_id, -it.quantity);
    END LOOP;
    NEW.confirmed_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_confirm_sale ON public.sales;
CREATE TRIGGER trg_confirm_sale BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.confirm_sale();

CREATE OR REPLACE FUNCTION public.reverse_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it RECORD;
BEGIN
  IF OLD.status = 'sent' THEN
    FOR it IN SELECT product_id, quantity FROM public.sale_items WHERE sale_id = OLD.id LOOP
      PERFORM public.adjust_inventory(it.product_id, OLD.branch_id, it.quantity);
    END LOOP;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_reverse_sale ON public.sales;
CREATE TRIGGER trg_reverse_sale BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.reverse_sale();

CREATE OR REPLACE FUNCTION public.confirm_transfer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it RECORD; avail int;
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS DISTINCT FROM 'sent') THEN
    FOR it IN SELECT product_id, quantity FROM public.transfer_items WHERE transfer_id = NEW.id LOOP
      SELECT quantity INTO avail FROM public.inventory WHERE product_id = it.product_id AND branch_id = NEW.from_branch_id;
      IF COALESCE(avail,0) < it.quantity THEN
        RAISE EXCEPTION 'Insufficient stock at source branch for one of the items (have %, need %)', COALESCE(avail,0), it.quantity;
      END IF;
    END LOOP;
    FOR it IN SELECT product_id, quantity FROM public.transfer_items WHERE transfer_id = NEW.id LOOP
      PERFORM public.adjust_inventory(it.product_id, NEW.from_branch_id, -it.quantity);
      PERFORM public.adjust_inventory(it.product_id, NEW.to_branch_id, it.quantity);
    END LOOP;
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_confirm_transfer ON public.transfers;
CREATE TRIGGER trg_confirm_transfer BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.confirm_transfer();

CREATE OR REPLACE FUNCTION public.reverse_transfer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it RECORD;
BEGIN
  IF OLD.status = 'sent' THEN
    FOR it IN SELECT product_id, quantity FROM public.transfer_items WHERE transfer_id = OLD.id LOOP
      PERFORM public.adjust_inventory(it.product_id, OLD.from_branch_id, it.quantity);
      PERFORM public.adjust_inventory(it.product_id, OLD.to_branch_id, -it.quantity);
    END LOOP;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_reverse_transfer ON public.transfers;
CREATE TRIGGER trg_reverse_transfer BEFORE DELETE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.reverse_transfer();

-- Products updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_products_touch ON public.products;
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Extra policies ============
-- Sale items writable by staff (needed for editing lines)
DROP POLICY IF EXISTS "staff update sale items" ON public.sale_items;
CREATE POLICY "staff update sale items" ON public.sale_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'branch_staff') OR public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (true);
DROP POLICY IF EXISTS "staff delete sale items" ON public.sale_items;
CREATE POLICY "staff delete sale items" ON public.sale_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'branch_staff') OR public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "staff update sales" ON public.sales;
CREATE POLICY "staff update sales" ON public.sales FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'branch_staff') OR public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (true);
DROP POLICY IF EXISTS "staff delete sales" ON public.sales;
CREATE POLICY "staff delete sales" ON public.sales FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'branch_staff') OR public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "wm update transfers" ON public.transfers;
CREATE POLICY "wm update transfers" ON public.transfers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (true);
DROP POLICY IF EXISTS "wm delete transfers" ON public.transfers;
CREATE POLICY "wm delete transfers" ON public.transfers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'admin'));
