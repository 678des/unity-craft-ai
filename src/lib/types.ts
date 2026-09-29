export type ProjectStatus =
  | "pending"
  | "planning"
  | "generating"
  | "pushing"
  | "completed"
  | "failed";

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface Project {
  id: string;
  prompt: string;
  status: ProjectStatus;
  github_repo_name: string | null;
  github_repo_url: string | null;
  error_message: string | null;
  generated_files: GeneratedFile[];
  created_at: string;
  updated_at: string;
}

export interface AgentLog {
  id: string;
  project_id: string;
  step_name: string;
  log_message: string;
  created_at: string;
}

export interface PlannedFile {
  path: string;
  description: string;
}

export interface ProjectPlan {
  repo_name: string;
  files: PlannedFile[];
}
