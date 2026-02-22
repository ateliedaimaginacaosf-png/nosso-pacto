
-- Allow nullable familia_id for pre-activations (before user registers)
ALTER TABLE public.assinatura ALTER COLUMN familia_id DROP NOT NULL;

-- Drop existing FK constraint and re-add allowing NULL
ALTER TABLE public.assinatura DROP CONSTRAINT IF EXISTS assinatura_familia_id_fkey;
ALTER TABLE public.assinatura ADD CONSTRAINT assinatura_familia_id_fkey 
  FOREIGN KEY (familia_id) REFERENCES public.familia(id) ON DELETE SET NULL;

-- Update handle_new_user to check for pre-activations
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _familia_id UUID;
  _tipo app_role;
  _nome TEXT;
  _data_nascimento DATE;
  _pre_activation RECORD;
BEGIN
  _tipo := COALESCE((NEW.raw_user_meta_data->>'tipo_perfil')::app_role, 'responsavel');
  _nome := COALESCE(NEW.raw_user_meta_data->>'nome', 'Usuário');
  _data_nascimento := (NEW.raw_user_meta_data->>'data_nascimento')::DATE;
  
  IF _tipo = 'responsavel' THEN
    INSERT INTO public.familia (nome) VALUES (_nome || '''s Family')
    RETURNING id INTO _familia_id;
  ELSE
    _familia_id := (NEW.raw_user_meta_data->>'familia_id')::UUID;
  END IF;
  
  INSERT INTO public.profiles (user_id, familia_id, nome, tipo_perfil, data_nascimento)
  VALUES (NEW.id, _familia_id, _nome, _tipo, _data_nascimento);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _tipo);
  
  IF _tipo = 'crianca' THEN
    INSERT INTO public.configuracao_familia (familia_id, crianca_id)
    VALUES (_familia_id, NEW.id);
  END IF;
  
  IF _tipo = 'responsavel' THEN
    -- Copy global task templates
    INSERT INTO public.tarefa_padrao (familia_id, criada_por, nome, descricao, categoria, valor_moedas)
    SELECT _familia_id, NEW.id, g.nome, g.descricao, g.categoria, g.valor_moedas
    FROM public.tarefa_padrao_global g;
    
    -- Copy global reward templates
    INSERT INTO public.recompensa (familia_id, nome, descricao, custo_moedas, exige_aprovacao)
    SELECT _familia_id, g.nome, g.descricao, g.custo_moedas, g.exige_aprovacao
    FROM public.recompensa_padrao_global g;
    
    -- Check for pre-activation: find any active subscription for this email
    SELECT * INTO _pre_activation
    FROM public.assinatura
    WHERE email_comprador = LOWER(NEW.email)
      AND status = 'ativa'
      AND familia_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF _pre_activation.id IS NOT NULL THEN
      -- Activate the family
      UPDATE public.familia SET ativo = true WHERE id = _familia_id;
      
      -- Link the subscription to the family
      UPDATE public.assinatura 
      SET familia_id = _familia_id, updated_at = now()
      WHERE id = _pre_activation.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
