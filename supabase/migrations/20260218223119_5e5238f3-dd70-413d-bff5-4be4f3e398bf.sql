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
    INSERT INTO public.tarefa_padrao (familia_id, criada_por, nome, descricao, categoria, valor_moedas)
    SELECT _familia_id, NEW.id, g.nome, g.descricao, g.categoria, g.valor_moedas
    FROM public.tarefa_padrao_global g;
    
    INSERT INTO public.recompensa (familia_id, nome, descricao, custo_moedas, exige_aprovacao)
    SELECT _familia_id, g.nome, g.descricao, g.custo_moedas, g.exige_aprovacao
    FROM public.recompensa_padrao_global g;
  END IF;
  
  RETURN NEW;
END;
$function$;