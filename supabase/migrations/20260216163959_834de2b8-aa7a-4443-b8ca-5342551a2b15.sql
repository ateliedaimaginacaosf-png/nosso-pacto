-- Add new status for dispensa request
ALTER TYPE public.status_tarefa ADD VALUE IF NOT EXISTS 'dispensa_solicitada';
