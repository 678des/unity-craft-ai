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
  sceneName: string;
  path: string;
  description: string; // 例: "タイトル画面、UIとメインコントローラーを配置"
  keyObjects: string[]; // 主要なオブジェクト名のリスト（例: ["GameManager", "Player"]）
}

export interface ScriptInfo {
  path: string;
  responsibility: string; // クラスの役割
  public_methods: string[]; // 例: ["public void TakeDamage(int dmg)"]
  dependencies: string[]; // 依存する他のクラス名
}

export interface ProjectManifest {
  projectName: string;
  unityVersion: string;
  description: string;
  scenes: SceneInfo[];
  scripts: ScriptInfo[];
  // ▼ 追加：人間やUnityエディター側での手動作業・注意点
  humanSetupInstructions: string[];
  updatedAt: string; // ISO 8601形式
}
export interface ChangePlan {
  summaryOfChanges: string; // 今回の変更の概要
  targetFiles: {
    path: string; // 変更または新規作成するファイルのパス（例: Assets/Scripts/GameManager.cs）
    action: "create" | "modify"; // 新規作成か修正か
    reason: string; // なぜこのファイルをどう変更するかの理由
    plannedMethods: string[]; // 追加・修正される主要な public_methods のシグネチャ一覧
  }[];
}
