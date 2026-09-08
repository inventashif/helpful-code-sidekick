CREATE TABLE public.console_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id text,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX console_sessions_user_external_idx
  ON public.console_sessions (user_id, external_id)
  WHERE external_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.console_sessions TO authenticated;
GRANT ALL ON public.console_sessions TO service_role;
ALTER TABLE public.console_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sessions select" ON public.console_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own sessions insert" ON public.console_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sessions update" ON public.console_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sessions delete" ON public.console_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.model_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.console_sessions(id) ON DELETE SET NULL,
  model text,
  mode text,
  status integer,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX model_runs_user_created_idx ON public.model_runs (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_runs TO authenticated;
GRANT ALL ON public.model_runs TO service_role;
ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own runs select" ON public.model_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own runs insert" ON public.model_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own runs delete" ON public.model_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.console_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  model text,
  mode text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.console_preferences TO authenticated;
GRANT ALL ON public.console_preferences TO service_role;
ALTER TABLE public.console_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own prefs select" ON public.console_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.console_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.console_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);