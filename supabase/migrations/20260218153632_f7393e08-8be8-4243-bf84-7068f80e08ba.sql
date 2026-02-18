
-- Tabela de tarefas padrão globais (seed para novos cadastros)
CREATE TABLE public.tarefa_padrao_global (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  categoria categoria_tarefa NOT NULL DEFAULT 'outros',
  valor_moedas integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Sem RLS pois é tabela de leitura global usada pelo sistema
ALTER TABLE public.tarefa_padrao_global ENABLE ROW LEVEL SECURITY;

-- Permitir leitura para todos autenticados
CREATE POLICY "Authenticated users can read global tasks"
ON public.tarefa_padrao_global FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Inserir as tarefas padrão globais
INSERT INTO public.tarefa_padrao_global (nome, descricao, categoria, valor_moedas) VALUES
-- Limpeza
('Arrumar a cama', 'Deixar a cama arrumada logo ao acordar', 'limpeza', 2),
('Guardar brinquedos', 'Guardar todos os brinquedos no lugar certo após brincar', 'limpeza', 2),
('Varrer o quarto', 'Varrer o chão do quarto inteiro', 'limpeza', 3),
('Limpar a mesa após refeição', 'Retirar pratos e limpar a mesa depois de comer', 'limpeza', 2),
('Ajudar a organizar a sala', 'Organizar almofadas, controles e objetos da sala', 'limpeza', 3),
('Passar pano no chão', 'Passar pano úmido no chão de um cômodo', 'limpeza', 4),
('Limpar o banheiro', 'Limpar pia e espelho do banheiro', 'limpeza', 5),
('Tirar o lixo', 'Levar o saco de lixo para fora', 'limpeza', 2),
-- Estudos
('Fazer lição de casa', 'Completar todas as lições do dia', 'estudos', 3),
('Ler por 20 minutos', 'Leitura de livro ou revista por pelo menos 20 minutos', 'estudos', 3),
('Estudar para prova', 'Revisar matéria e se preparar para avaliação', 'estudos', 5),
('Praticar tabuada', 'Treinar cálculos e tabuada por 10 minutos', 'estudos', 3),
('Revisar matéria do dia', 'Reler anotações e conteúdo visto na escola', 'estudos', 3),
('Atividade extra de leitura/redação', 'Fazer uma atividade extra como redação ou leitura adicional', 'estudos', 4),
('Organizar mochila e material escolar', 'Verificar e arrumar mochila para o próximo dia', 'estudos', 2),
-- Exercício
('Brincar ao ar livre por 30 min', 'Atividade física ao ar livre por pelo menos 30 minutos', 'exercicio', 3),
('Fazer alongamento/yoga', 'Sessão de alongamento ou yoga infantil', 'exercicio', 2),
('Andar de bicicleta', 'Passeio de bicicleta pela vizinhança', 'exercicio', 3),
('Ir ao treino/aula esportiva', 'Participar da aula de esporte ou treino agendado', 'exercicio', 4),
('Pular corda por 10 min', 'Exercício de pular corda por pelo menos 10 minutos', 'exercicio', 2),
('Dançar/atividade física livre', 'Dançar ou fazer atividade física escolhida livremente', 'exercicio', 2),
-- Higiene
('Escovar os dentes 3x ao dia', 'Escovar os dentes após café, almoço e antes de dormir', 'higiene', 2),
('Tomar banho sem reclamar', 'Tomar banho no horário combinado sem resistência', 'higiene', 2),
('Cortar/limpar unhas', 'Manter as unhas limpas e cortadas', 'higiene', 2),
('Pentear o cabelo', 'Pentear e arrumar o cabelo sozinho(a)', 'higiene', 1),
('Guardar roupa suja no cesto', 'Colocar roupas usadas no cesto de roupa suja', 'higiene', 1),
('Lavar as mãos antes das refeições', 'Lavar bem as mãos com sabão antes de comer', 'higiene', 1),
-- Alimentação
('Comer frutas/verduras sem reclamar', 'Comer as frutas e verduras servidas sem resistência', 'alimentacao', 3),
('Ajudar a preparar lanche', 'Participar do preparo do lanche ou refeição simples', 'alimentacao', 3),
('Beber água suficiente no dia', 'Beber pelo menos 5 copos de água durante o dia', 'alimentacao', 2),
('Comer a refeição completa', 'Terminar toda a refeição servida sem desperdício', 'alimentacao', 2),
('Ajudar a colocar a mesa', 'Colocar pratos, talheres e copos na mesa', 'alimentacao', 2),
('Ajudar a lavar a louça', 'Lavar ou secar a louça após a refeição', 'alimentacao', 4),
-- Organização
('Organizar guarda-roupa', 'Dobrar e organizar as roupas no armário', 'organizacao', 4),
('Separar roupas para lavar', 'Separar roupas claras e escuras para lavagem', 'organizacao', 2),
('Guardar compras do mercado', 'Ajudar a guardar as compras nos armários', 'organizacao', 3),
('Organizar estante de livros', 'Arrumar livros e materiais na estante', 'organizacao', 3),
('Dobrar roupas limpas', 'Dobrar as roupas limpas e empilhar', 'organizacao', 3),
('Guardar sapatos no lugar', 'Colocar os sapatos no sapateiro ou lugar certo', 'organizacao', 1),
('Organizar mesa de estudo', 'Deixar a mesa de estudo arrumada após usar', 'organizacao', 2),
-- Outros
('Cuidar do pet', 'Dar água e comida para o animal de estimação', 'outros', 3),
('Regar as plantas', 'Regar as plantas da casa ou jardim', 'outros', 2),
('Ajudar irmão mais novo', 'Ajudar o irmão/irmã mais novo com alguma atividade', 'outros', 4),
('Fazer um ato de gentileza', 'Praticar um ato de gentileza voluntariamente', 'outros', 3),
('Ter paciência (não brigar no dia)', 'Passar o dia inteiro sem brigas ou conflitos', 'outros', 5),
('Seguir a rotina sem ser lembrado', 'Cumprir toda a rotina do dia sem precisar de lembretes', 'outros', 5);

-- Atualizar o trigger handle_new_user para inserir tarefas padrão para novos responsáveis
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
  
  -- Inserir tarefas padrão globais para novos responsáveis
  IF _tipo = 'responsavel' THEN
    INSERT INTO public.tarefa_padrao (familia_id, criada_por, nome, descricao, categoria, valor_moedas)
    SELECT _familia_id, NEW.id, g.nome, g.descricao, g.categoria, g.valor_moedas
    FROM public.tarefa_padrao_global g;
  END IF;
  
  RETURN NEW;
END;
$function$;
