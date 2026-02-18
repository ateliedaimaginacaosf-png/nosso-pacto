
CREATE POLICY "Responsaveis can upload family member avatars"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND has_role(auth.uid(), 'responsavel'::app_role)
  AND is_family_member(auth.uid(), (SELECT familia_id FROM public.profiles WHERE user_id = (storage.foldername(name))[1]::uuid LIMIT 1))
);

CREATE POLICY "Responsaveis can update family member avatars"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND has_role(auth.uid(), 'responsavel'::app_role)
  AND is_family_member(auth.uid(), (SELECT familia_id FROM public.profiles WHERE user_id = (storage.foldername(name))[1]::uuid LIMIT 1))
);
