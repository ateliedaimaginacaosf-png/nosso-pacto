
-- Create periodicidade enum
CREATE TYPE public.periodicidade_tarefa AS ENUM ('diaria', 'semanal', 'quinzenal', 'mensal');

-- Add periodicidade column to tarefa table
ALTER TABLE public.tarefa ADD COLUMN periodicidade public.periodicidade_tarefa NOT NULL DEFAULT 'diaria';
