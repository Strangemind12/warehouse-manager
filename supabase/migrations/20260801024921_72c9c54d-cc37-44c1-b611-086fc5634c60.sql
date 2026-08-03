CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read activity log"
ON public.activity_log FOR SELECT TO authenticated USING (true);

CREATE INDEX activity_log_created_at_idx ON public.activity_log (created_at DESC);
CREATE INDEX activity_log_entity_idx ON public.activity_log (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.log_activity(_action text, _entity_type text, _entity_id uuid, _summary text, _details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.activity_log (actor_id, actor_email, action, entity_type, entity_id, summary, details)
  VALUES (auth.uid(), _email, _action, _entity_type, _entity_id, _summary, coalesce(_details, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_transfers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from text; _to text;
BEGIN
  SELECT name INTO _from FROM public.branches WHERE id = coalesce(NEW.from_branch_id, OLD.from_branch_id);
  SELECT name INTO _to FROM public.branches WHERE id = coalesce(NEW.to_branch_id, OLD.to_branch_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity('created', 'transfer', NEW.id,
      format('Transfer %s created (%s → %s), status %s', coalesce(NEW.invoice_no, ''), coalesce(_from,'?'), coalesce(_to,'?'), NEW.status),
      jsonb_build_object('status', NEW.status, 'invoice_no', NEW.invoice_no));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_activity('status_changed', 'transfer', NEW.id,
        format('Transfer %s %s → %s (%s → %s)', coalesce(NEW.invoice_no,''), OLD.status, NEW.status, coalesce(_from,'?'), coalesce(_to,'?')),
        jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status, 'invoice_no', NEW.invoice_no));
    ELSE
      PERFORM public.log_activity('updated', 'transfer', NEW.id,
        format('Transfer %s updated', coalesce(NEW.invoice_no,'')), jsonb_build_object('invoice_no', NEW.invoice_no));
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.log_activity('deleted', 'transfer', OLD.id,
      format('Transfer %s deleted', coalesce(OLD.invoice_no,'')), jsonb_build_object('invoice_no', OLD.invoice_no));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER audit_transfers_trg
AFTER INSERT OR UPDATE OR DELETE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.audit_transfers();

CREATE OR REPLACE FUNCTION public.audit_receipts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity('created', 'receipt', NEW.id,
      format('Receipt %s recorded from %s, status %s', coalesce(NEW.invoice_no,''), coalesce(NEW.supplier_name,'supplier'), NEW.status),
      jsonb_build_object('status', NEW.status, 'invoice_no', NEW.invoice_no, 'supplier', NEW.supplier_name));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_activity('status_changed', 'receipt', NEW.id,
        format('Receipt %s %s → %s', coalesce(NEW.invoice_no,''), OLD.status, NEW.status),
        jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status, 'invoice_no', NEW.invoice_no));
    ELSE
      PERFORM public.log_activity('updated', 'receipt', NEW.id,
        format('Receipt %s updated', coalesce(NEW.invoice_no,'')), jsonb_build_object('invoice_no', NEW.invoice_no));
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.log_activity('deleted', 'receipt', OLD.id,
      format('Receipt %s deleted', coalesce(OLD.invoice_no,'')), jsonb_build_object('invoice_no', OLD.invoice_no));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER audit_receipts_trg
AFTER INSERT OR UPDATE OR DELETE ON public.stock_receipts
FOR EACH ROW EXECUTE FUNCTION public.audit_receipts();

CREATE OR REPLACE FUNCTION public.audit_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity('created', 'product', NEW.id, format('Product "%s" created', NEW.name), jsonb_build_object('name', NEW.name));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_activity('updated', 'product', NEW.id, format('Product "%s" updated', NEW.name), jsonb_build_object('name', NEW.name));
    RETURN NEW;
  ELSE
    PERFORM public.log_activity('deleted', 'product', OLD.id, format('Product "%s" deleted', OLD.name), jsonb_build_object('name', OLD.name));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER audit_products_trg
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.audit_products();

CREATE OR REPLACE FUNCTION public.audit_branches()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity('created', 'branch', NEW.id,
      format('%s "%s" created', CASE WHEN NEW.is_warehouse THEN 'Warehouse' ELSE 'Branch' END, NEW.name), jsonb_build_object('name', NEW.name));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_activity('updated', 'branch', NEW.id, format('Location "%s" updated', NEW.name), jsonb_build_object('name', NEW.name));
    RETURN NEW;
  ELSE
    PERFORM public.log_activity('deleted', 'branch', OLD.id, format('Location "%s" deleted', OLD.name), jsonb_build_object('name', OLD.name));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER audit_branches_trg
AFTER INSERT OR UPDATE OR DELETE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.audit_branches();

CREATE OR REPLACE FUNCTION public.audit_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product text; _branch text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN
    RETURN NEW;
  END IF;
  SELECT name INTO _product FROM public.products WHERE id = coalesce(NEW.product_id, OLD.product_id);
  SELECT name INTO _branch FROM public.branches WHERE id = coalesce(NEW.branch_id, OLD.branch_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity('stock_set', 'inventory', NEW.id,
      format('%s at %s set to %s', coalesce(_product,'Product'), coalesce(_branch,'location'), NEW.quantity),
      jsonb_build_object('product', _product, 'location', _branch, 'quantity', NEW.quantity));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_activity('stock_changed', 'inventory', NEW.id,
      format('%s at %s: %s → %s', coalesce(_product,'Product'), coalesce(_branch,'location'), OLD.quantity, NEW.quantity),
      jsonb_build_object('product', _product, 'location', _branch, 'from', OLD.quantity, 'to', NEW.quantity, 'change', NEW.quantity - OLD.quantity));
    RETURN NEW;
  ELSE
    PERFORM public.log_activity('deleted', 'inventory', OLD.id,
      format('Stock record for %s at %s removed', coalesce(_product,'Product'), coalesce(_branch,'location')), '{}'::jsonb);
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER audit_inventory_trg
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.audit_inventory();

CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = coalesce(NEW.user_id, OLD.user_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity('created', 'user_role', NEW.id,
      format('Role %s granted to %s', NEW.role, coalesce(_email,'user')), jsonb_build_object('role', NEW.role, 'user_email', _email));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_activity('updated', 'user_role', NEW.id,
      format('Role for %s changed %s → %s', coalesce(_email,'user'), OLD.role, NEW.role), jsonb_build_object('role', NEW.role, 'user_email', _email));
    RETURN NEW;
  ELSE
    PERFORM public.log_activity('deleted', 'user_role', OLD.id,
      format('Role %s removed from %s', OLD.role, coalesce(_email,'user')), jsonb_build_object('role', OLD.role, 'user_email', _email));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER audit_user_roles_trg
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();