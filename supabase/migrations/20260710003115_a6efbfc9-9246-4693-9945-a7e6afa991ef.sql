
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_branch_id_fkey;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;
