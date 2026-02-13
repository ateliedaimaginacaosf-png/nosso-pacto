
-- ============================
-- FASE 1: Schema Base
-- ============================

-- 1. Roles enum
CREATE TYPE public.app_role AS ENUM ('responsavel', 'crianca');

-- 2. Tabela familia
CREATE TABLE public.familia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.familia ENABLE ROW LEVEL SECURITY;

-- 3. Tabela profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  familia_id UUID NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo_perfil app_role NOT NULL,
  foto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Tabela user_roles (separada por segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Tabela configuracao_familia
CREATE TABLE public.configuracao_familia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE UNIQUE,
  limite_resgate_diario INTEGER NOT NULL DEFAULT 50,
  resgate_imediato BOOLEAN NOT NULL DEFAULT true,
  regras_ouro TEXT[] DEFAULT '{}',
  consequencias_naturais TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.configuracao_familia ENABLE ROW LEVEL SECURITY;

-- ============================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================

CREATE OR REPLACE FUNCTION public.get_user_familia_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT familia_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_member(_user_id UUID, _familia_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = _user_id AND familia_id = _familia_id
  );
$$;

-- ============================
-- RLS POLICIES
-- ============================

-- familia: members can see their family, responsaveis can manage
CREATE POLICY "Members can view own family"
  ON public.familia FOR SELECT TO authenticated
  USING (public.is_family_member(auth.uid(), id));

CREATE POLICY "Responsaveis can insert familia"
  ON public.familia FOR INSERT TO authenticated
  WITH CHECK (true); -- during signup, no familia exists yet

CREATE POLICY "Responsaveis can update own familia"
  ON public.familia FOR UPDATE TO authenticated
  USING (public.is_family_member(auth.uid(), id) AND public.has_role(auth.uid(), 'responsavel'));

-- profiles: family members can see each other, users manage own profile
CREATE POLICY "Family members can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_family_member(auth.uid(), familia_id));

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Responsaveis can insert child profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'responsavel') 
    AND public.is_family_member(auth.uid(), familia_id)
  );

-- user_roles: only viewable, inserted during signup flow
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own role"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- configuracao_familia: responsaveis only
CREATE POLICY "Responsaveis can view config"
  ON public.configuracao_familia FOR SELECT TO authenticated
  USING (public.is_family_member(auth.uid(), familia_id));

CREATE POLICY "Responsaveis can manage config"
  ON public.configuracao_familia FOR INSERT TO authenticated
  WITH CHECK (public.is_family_member(auth.uid(), familia_id) AND public.has_role(auth.uid(), 'responsavel'));

CREATE POLICY "Responsaveis can update config"
  ON public.configuracao_familia FOR UPDATE TO authenticated
  USING (public.is_family_member(auth.uid(), familia_id) AND public.has_role(auth.uid(), 'responsavel'));

-- ============================
-- TRIGGER: auto-update updated_at
-- ============================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_configuracao_updated_at
  BEFORE UPDATE ON public.configuracao_familia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================
-- TRIGGER: auto-create profile + role + familia on signup
-- ============================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  _familia_id UUID;
  _tipo app_role;
  _nome TEXT;
BEGIN
  _tipo := COALESCE((NEW.raw_user_meta_data->>'tipo_perfil')::app_role, 'responsavel');
  _nome := COALESCE(NEW.raw_user_meta_data->>'nome', 'Usuário');
  
  IF _tipo = 'responsavel' THEN
    -- Create new family
    INSERT INTO public.familia (nome) VALUES (_nome || '''s Family')
    RETURNING id INTO _familia_id;
    
    -- Create family config
    INSERT INTO public.configuracao_familia (familia_id) VALUES (_familia_id);
  ELSE
    -- Child must have familia_id in metadata
    _familia_id := (NEW.raw_user_meta_data->>'familia_id')::UUID;
  END IF;
  
  -- Create profile
  INSERT INTO public.profiles (user_id, familia_id, nome, tipo_perfil)
  VALUES (NEW.id, _familia_id, _nome, _tipo);
  
  -- Create role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _tipo);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
