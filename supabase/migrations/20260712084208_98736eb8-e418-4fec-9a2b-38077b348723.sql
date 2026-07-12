
CREATE POLICY "manga_read_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'manga');
CREATE POLICY "manga_insert_uploader" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manga' AND (public.has_role(auth.uid(),'uploader') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "manga_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manga' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "manga_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manga' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
