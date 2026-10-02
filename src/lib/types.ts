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

/** シーン上の初期配置オブジェクトの定義 */
export interface SceneObjectPlan {
  name: string;
  type: string; // 例: "PrimitiveCube", "EmptyObject", "Camera", "Light" など
  position: [number, number, number];
  scale?: [number, number, number];
  components: string[]; // アタッチするスクリプト名のリスト
  description: string;
}

export interface ProjectPlan {
  repo_name: string;
  game_title: string;
  game_concept: string;
  scene_objects: SceneObjectPlan[];
  files: PlannedFile[];
}

// AI同士の共有データ

export interface ManifestObject {
  name: string;
  components: string[];
}

export interface SceneInfo {
  path: string;
  objects: ManifestObject[];
}

export interface ScriptInfo {
  path: string;
  responsibility: string;
  public_methods: string[]; // 例: "public void Move(Vector2 input)"
  dependencies: string[]; // 依存する他のクラス名など
}

export interface ProjectManifest {
  projectName: string;
  unityVersion: string;
  description: string;
  scenes: SceneInfo[];
  scripts: ScriptInfo[];
  updatedAt: string; // ISO 8601形式のタイムスタンプ
}
