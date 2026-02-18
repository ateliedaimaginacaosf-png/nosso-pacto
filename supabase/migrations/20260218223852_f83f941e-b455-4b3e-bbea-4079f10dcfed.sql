-- Allow responsaveis to delete child profiles from their family
CREATE POLICY "Responsaveis can delete child profiles"
ON public.profiles
FOR DELETE
USING (
  is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'responsavel'::app_role)
  AND tipo_perfil = 'crianca'
);

-- Allow responsaveis to delete child roles
CREATE POLICY "Responsaveis can delete child roles"
ON public.user_roles
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
    AND p.tipo_perfil = 'crianca'
    AND is_family_member(auth.uid(), p.familia_id)
    AND has_role(auth.uid(), 'responsavel'::app_role)
  )
);

-- Allow responsaveis to delete child config
CREATE POLICY "Responsaveis can delete child config"
ON public.configuracao_familia
FOR DELETE
USING (
  is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'responsavel'::app_role)
);