REVOKE ALL ON FUNCTION public.log_activity(text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_transfers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_receipts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_products() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_branches() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_inventory() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_user_roles() FROM PUBLIC, anon, authenticated;