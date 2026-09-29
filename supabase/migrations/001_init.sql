-- 1. Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending','planning','generating','pushing','completed','failed'
  github_repo_name VARCHAR(255),
  github_repo_url TEXT,
  error_message TEXT,
  generated_files JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ path, content }] 画面でのプレビュー用(PRDへの追加カラム)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Agent logs (リアルタイム監視用)
CREATE TABLE public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  log_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX agent_logs_project_id_created_at_idx ON public.agent_logs (project_id, created_at);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;

-- RLS: 書き込みはservice role(サーバー側)のみ。anonは読み取りのみ許可。
-- 認証を入れていないデモ構成のため、プロジェクトIDを知っていれば誰でも閲覧できます。
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read projects" ON public.projects FOR SELECT TO anon USING (true);
CREATE POLICY "anon can read agent_logs" ON public.agent_logs FOR SELECT TO anon USING (true);
