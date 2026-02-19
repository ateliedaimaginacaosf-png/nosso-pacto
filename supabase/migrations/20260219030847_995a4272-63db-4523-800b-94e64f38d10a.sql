
-- Table for badge definitions
CREATE TABLE public.badge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  emoji text NOT NULL DEFAULT '🏅',
  criterio text NOT NULL, -- internal key used by code to check unlock
  meta_valor integer, -- target value (e.g., 100 for "100 moedas")
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table for unlocked badges per child
CREATE TABLE public.badge_desbloqueio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id uuid NOT NULL REFERENCES public.badge(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  familia_id uuid NOT NULL REFERENCES public.familia(id),
  desbloqueado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(badge_id, user_id)
);

-- Enable RLS
ALTER TABLE public.badge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_desbloqueio ENABLE ROW LEVEL SECURITY;

-- Badge definitions are readable by all authenticated users
CREATE POLICY "Authenticated users can read badges"
  ON public.badge FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can view their own family's unlocked badges
CREATE POLICY "Family members can view unlocked badges"
  ON public.badge_desbloqueio FOR SELECT
  USING (public.is_family_member(auth.uid(), familia_id));

-- Children can insert their own badge unlocks
CREATE POLICY "Users can unlock own badges"
  ON public.badge_desbloqueio FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_family_member(auth.uid(), familia_id));

-- Responsaveis can also insert badge unlocks for family members
CREATE POLICY "Responsaveis can unlock badges for family"
  ON public.badge_desbloqueio FOR INSERT
  WITH CHECK (public.is_family_member(auth.uid(), familia_id) AND public.has_role(auth.uid(), 'responsavel'));

-- Seed initial badge definitions
INSERT INTO public.badge (nome, descricao, emoji, criterio, meta_valor) VALUES
  ('Primeira Tarefa', 'Completou sua primeira tarefa!', '⭐', 'primeira_tarefa', 1),
  ('Primeiro Resgate', 'Fez seu primeiro resgate de recompensa!', '🎁', 'primeiro_resgate', 1),
  ('Colecionador de Moedas', 'Acumulou 100 moedas ao longo do tempo!', '💰', 'moedas_acumuladas', 100),
  ('Super Colecionador', 'Acumulou 500 moedas ao longo do tempo!', '💎', 'moedas_acumuladas', 500),
  ('Tarefeiro', 'Completou 10 tarefas!', '🔟', 'tarefas_concluidas', 10),
  ('Mestre das Tarefas', 'Completou 50 tarefas!', '🏆', 'tarefas_concluidas', 50),
  ('Deveres em Dia', 'Cumpriu todos os deveres por 7 dias seguidos!', '🏅', 'streak_deveres', 7),
  ('Mês Perfeito', 'Cumpriu todos os deveres por 30 dias seguidos!', '🔥', 'streak_deveres', 30),
  ('Dia Perfeito', 'Completou todas as tarefas do dia!', '🌟', 'dia_perfeito', 1),
  ('Semana Produtiva', 'Completou todas as tarefas por 5 dias!', '📅', 'dias_todas_tarefas', 5);

-- Enable realtime for badge unlocks
ALTER PUBLICATION supabase_realtime ADD TABLE public.badge_desbloqueio;
