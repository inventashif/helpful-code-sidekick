DROP INDEX IF EXISTS public.console_sessions_user_external_idx;
ALTER TABLE public.console_sessions
  ADD CONSTRAINT console_sessions_user_external_key UNIQUE (user_id, external_id);