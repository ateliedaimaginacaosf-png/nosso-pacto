
-- Tabela de recompensas padrão globais (seed para novos cadastros)
CREATE TABLE public.recompensa_padrao_global (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  custo_moedas integer NOT NULL DEFAULT 1,
  exige_aprovacao boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.recompensa_padrao_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read global rewards"
ON public.recompensa_padrao_global FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Inserir recompensas globais
INSERT INTO public.recompensa_padrao_global (nome, descricao, custo_moedas, exige_aprovacao) VALUES
('30 min extra de tela', '30 minutos extras de TV, tablet ou videogame', 10, false),
('1 hora extra de tela', '1 hora extra de TV, tablet ou videogame', 18, false),
('Escolher o filme da família', 'Escolher qual filme a família vai assistir juntos', 15, false),
('Jogar videogame com pai/mãe', 'Sessão de jogo junto com o responsável', 20, false),
('Noite de jogos de tabuleiro', 'Noite especial de jogos de tabuleiro em família', 15, false),
('Sobremesa especial', 'Ganhar uma sobremesa especial à escolha', 8, false),
('Escolher o lanche do dia', 'Escolher livremente o que comer no lanche', 10, false),
('Pedir pizza/hambúrguer', 'Pedir comida especial para a refeição', 25, false),
('Sorvete/açaí', 'Ganhar um sorvete ou açaí', 15, false),
('Preparar receita especial junto', 'Preparar uma receita escolhida junto com o responsável', 12, false),
('Passeio ao parque/praça', 'Passeio ao parque ou praça preferida', 20, false),
('Dormir mais tarde (30 min)', 'Dormir 30 minutos além do horário normal', 12, false),
('Convidar amigo para brincar', 'Convidar um amigo para brincar em casa', 15, false),
('Passeio especial (cinema, parque)', 'Passeio especial como cinema ou parque aquático', 50, false),
('Dia sem tarefas (folga)', 'Um dia inteiro de folga das tarefas', 40, false),
('Escolher atividade do fim de semana', 'Escolher a atividade principal do fim de semana', 30, false),
('Adesivos/figurinhas', 'Pacote de adesivos ou figurinhas à escolha', 8, false),
('Livro/revista à escolha', 'Escolher um livro ou revista para comprar', 20, false),
('Brinquedo pequeno', 'Ganhar um brinquedo pequeno à escolha', 35, false),
('Mesada extra (R$5)', 'Receber R$5 extras de mesada', 25, false),
('Mesada extra (R$10)', 'Receber R$10 extras de mesada', 45, false),
('Escolher o jantar da família', 'Decidir o cardápio do jantar', 12, false),
('Ficar acordado até mais tarde no FDS', 'Ficar acordado além do horário no fim de semana', 15, false),
('Folga de arrumar o quarto (1 dia)', 'Não precisar arrumar o quarto por 1 dia', 10, false),
('Passe livre para 1 pedido especial', 'Um coringa para fazer um pedido especial', 30, false),
('Ser o "chefe da casa" por 1 hora', 'Mandar na casa por 1 hora (dentro do razoável)', 20, false);

-- Atualizar trigger para incluir recompensas padrão
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
BEGIN
  _tipo := COALESCE((NEW.raw_user_meta_data->>'tipo_perfil')::app_role, 'responsavel');
  _nome := COALESCE(NEW.raw_user_meta_data->>'nome', 'Usuário');
  
  IF _tipo = 'responsavel' THEN
    INSERT INTO public.familia (nome) VALUES (_nome || '''s Family')
    RETURNING id INTO _familia_id;
  ELSE
    _familia_id := (NEW.raw_user_meta_data->>'familia_id')::UUID;
  END IF;
  
  INSERT INTO public.profiles (user_id, familia_id, nome, tipo_perfil)
  VALUES (NEW.id, _familia_id, _nome, _tipo);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _tipo);
  
  IF _tipo = 'crianca' THEN
    INSERT INTO public.configuracao_familia (familia_id, crianca_id)
    VALUES (_familia_id, NEW.id);
  END IF;
  
  IF _tipo = 'responsavel' THEN
    -- Inserir tarefas padrão globais
    INSERT INTO public.tarefa_padrao (familia_id, criada_por, nome, descricao, categoria, valor_moedas)
    SELECT _familia_id, NEW.id, g.nome, g.descricao, g.categoria, g.valor_moedas
    FROM public.tarefa_padrao_global g;
    
    -- Inserir recompensas padrão globais
    INSERT INTO public.recompensa (familia_id, nome, descricao, custo_moedas, exige_aprovacao)
    SELECT _familia_id, g.nome, g.descricao, g.custo_moedas, g.exige_aprovacao
    FROM public.recompensa_padrao_global g;
  END IF;
  
  RETURN NEW;
END;
$function$;
