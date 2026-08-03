
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'warehouse_manager', 'branch_staff');

-- Branches (must exist before profiles reference it)
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  location TEXT,
  is_warehouse BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX only_one_warehouse ON public.branches (is_warehouse) WHERE is_warehouse = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') $$;

-- Auto-create profile + first-user-becomes-admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'branch_staff');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  reorder_level INT NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Inventory per branch
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, branch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Stock receipts (warehouse in)
CREATE TABLE public.stock_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name TEXT NOT NULL,
  reference TEXT,
  received_by UUID REFERENCES auth.users(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_receipts TO authenticated;
GRANT ALL ON public.stock_receipts TO service_role;
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.stock_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.stock_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_receipt_items TO authenticated;
GRANT ALL ON public.stock_receipt_items TO service_role;
ALTER TABLE public.stock_receipt_items ENABLE ROW LEVEL SECURITY;

-- Transfers (warehouse -> branch)
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_branch_id UUID NOT NULL REFERENCES public.branches(id),
  to_branch_id UUID NOT NULL REFERENCES public.branches(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','cancelled')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  CHECK (from_branch_id <> to_branch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INT NOT NULL CHECK (quantity > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_items TO authenticated;
GRANT ALL ON public.transfer_items TO service_role;
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;

-- Sales (branch out)
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  customer TEXT,
  sold_by UUID REFERENCES auth.users(id),
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Inventory adjustment helper
CREATE OR REPLACE FUNCTION public.adjust_inventory(_product UUID, _branch UUID, _delta INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.inventory (product_id, branch_id, quantity, updated_at)
  VALUES (_product, _branch, _delta, now())
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET quantity = public.inventory.quantity + _delta, updated_at = now();
END; $$;

-- Trigger: receipt item -> add to warehouse
CREATE OR REPLACE FUNCTION public.apply_receipt_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wh UUID;
BEGIN
  SELECT id INTO wh FROM public.branches WHERE is_warehouse = true LIMIT 1;
  IF wh IS NULL THEN RAISE EXCEPTION 'No warehouse branch configured'; END IF;
  PERFORM public.adjust_inventory(NEW.product_id, wh, NEW.quantity);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_receipt_item AFTER INSERT ON public.stock_receipt_items
FOR EACH ROW EXECUTE FUNCTION public.apply_receipt_item();

-- Trigger: transfer item -> move stock
CREATE OR REPLACE FUNCTION public.apply_transfer_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t RECORD;
BEGIN
  SELECT from_branch_id, to_branch_id INTO t FROM public.transfers WHERE id = NEW.transfer_id;
  PERFORM public.adjust_inventory(NEW.product_id, t.from_branch_id, -NEW.quantity);
  PERFORM public.adjust_inventory(NEW.product_id, t.to_branch_id, NEW.quantity);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_transfer_item AFTER INSERT ON public.transfer_items
FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_item();

-- Trigger: sale item -> deduct from branch
CREATE OR REPLACE FUNCTION public.apply_sale_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b UUID;
BEGIN
  SELECT branch_id INTO b FROM public.sales WHERE id = NEW.sale_id;
  PERFORM public.adjust_inventory(NEW.product_id, b, -NEW.quantity);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_sale_item AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_item();

-- RLS POLICIES
-- Profiles: user sees own; admins see all; users update own
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "admin insert profiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- User roles: anyone authenticated can read (for UI badges); only admins write
CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Branches: all read; admin write
CREATE POLICY "read branches" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage branches" ON public.branches FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Products: all read; admin write
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage products" ON public.products FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Inventory: all read; admins can adjust manually
CREATE POLICY "read inventory" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write inventory" ON public.inventory FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Receipts: read all; warehouse_manager or admin write
CREATE POLICY "read receipts" ON public.stock_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "wm create receipts" ON public.stock_receipts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager'));
CREATE POLICY "read receipt items" ON public.stock_receipt_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "wm create receipt items" ON public.stock_receipt_items FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager'));

-- Transfers: read all; warehouse_manager or admin
CREATE POLICY "read transfers" ON public.transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "wm create transfers" ON public.transfers FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager'));
CREATE POLICY "read transfer items" ON public.transfer_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "wm create transfer items" ON public.transfer_items FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager'));

-- Sales: read all; branch_staff, warehouse_manager, admin write
CREATE POLICY "read sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff create sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'branch_staff'));
CREATE POLICY "read sale items" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff create sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'branch_staff'));
