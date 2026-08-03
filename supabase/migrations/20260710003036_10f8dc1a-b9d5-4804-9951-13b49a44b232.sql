
-- 1) Grant admin to current user
INSERT INTO public.user_roles (user_id, role)
VALUES ('a89edbd1-608c-44f1-8445-4ed8420a408b', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2) Add image column to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

-- 3) Storage policies for product-images bucket (authenticated read/write, admin delete)
CREATE POLICY "Authenticated can read product images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(),'admin'));

-- 4) Allow admins to delete branches
CREATE POLICY "Admins can delete branches"
ON public.branches FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));
