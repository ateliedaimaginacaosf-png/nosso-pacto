
-- Fix: Remove overly permissive INSERT policy on familia
-- The handle_new_user trigger runs as SECURITY DEFINER so it bypasses RLS
-- No direct client INSERT should be allowed on familia
DROP POLICY "Responsaveis can insert familia" ON public.familia;
