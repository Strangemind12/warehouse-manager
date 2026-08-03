-- Allow the app's Sent transfer status and keep older Completed records valid
ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_status_check;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_status_check CHECK (status IN ('pending', 'sent', 'completed', 'cancelled'));

-- Ensure confirming a transfer moves stock exactly once
DROP TRIGGER IF EXISTS confirm_transfer_trg ON public.transfers;
CREATE TRIGGER confirm_transfer_trg
BEFORE UPDATE OF status ON public.transfers
FOR EACH ROW
EXECUTE FUNCTION public.confirm_transfer();

DROP TRIGGER IF EXISTS reverse_transfer_trg ON public.transfers;
CREATE TRIGGER reverse_transfer_trg
BEFORE DELETE ON public.transfers
FOR EACH ROW
EXECUTE FUNCTION public.reverse_transfer();

-- Store officers can create pending transfer requests; admins/supervisors confirm and delete
DROP POLICY IF EXISTS "wm create transfers" ON public.transfers;
CREATE POLICY "team create pending transfers" ON public.transfers
FOR INSERT TO authenticated
WITH CHECK (
  status = 'pending'
  AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'branch_staff'))
);

DROP POLICY IF EXISTS "wm create transfer items" ON public.transfer_items;
CREATE POLICY "team create transfer items" ON public.transfer_items
FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager') OR public.has_role(auth.uid(),'branch_staff'));

DROP POLICY IF EXISTS "wm update transfers" ON public.transfers;
CREATE POLICY "admins supervisors confirm transfers" ON public.transfers
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager'))
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager'));

DROP POLICY IF EXISTS "wm delete transfers" ON public.transfers;
CREATE POLICY "admins supervisors delete transfers" ON public.transfers
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'warehouse_manager'));

-- Company settings for tenant-style self-service setup
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  company_name text NOT NULL DEFAULT 'Warehouse Manager',
  address text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company settings read own or admin" ON public.company_settings;
CREATE POLICY "company settings read own or admin" ON public.company_settings
FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "company settings create own" ON public.company_settings;
CREATE POLICY "company settings create own" ON public.company_settings
FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "company settings update own" ON public.company_settings;
CREATE POLICY "company settings update own" ON public.company_settings
FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "company settings delete own" ON public.company_settings;
CREATE POLICY "company settings delete own" ON public.company_settings
FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS touch_company_settings_updated_at ON public.company_settings;
CREATE TRIGGER touch_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS one_company_per_owner ON public.company_settings(owner_id);

-- New self-signups that are not created by an admin/temp-password flow become admins for their own company.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
  invited_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM auth.users;
  invited_role := COALESCE((NEW.raw_user_meta_data->>'assigned_role')::public.app_role, NULL);

  IF invited_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, invited_role)
    ON CONFLICT DO NOTHING;
  ELSIF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.company_settings (owner_id, company_name, email)
    VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name',''), 'Warehouse Manager'), NEW.email)
    ON CONFLICT (owner_id) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.company_settings (owner_id, company_name, email)
    VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name',''), 'Warehouse Manager'), NEW.email)
    ON CONFLICT (owner_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;