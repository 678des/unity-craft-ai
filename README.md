# UnityCraft AI

自然言語でゲームの内容を書くと、Gemini が Unity C# スクリプトを生成し、新しい GitHub リポジトリに push します。

## セットアップ

1. 依存関係をインストール
   ```bash
   npm install
   ```
2. Supabase でプロジェクトを作成し、SQL Editor で `supabase/migrations/001_init.sql` を実行
3. `.env.local.example` を `.env.local` にコピーして値を入力
   - `GEMINI_API_KEY`: Google AI Studio で発行
   - `GITHUB_PERSONAL_ACCESS_TOKEN`: リポジトリ作成権限(classic なら `repo`、fine-grained なら Administration と Contents の書き込み)
4. 2つのターミナルで起動
   ```bash
   npm run dev       # Next.js (http://localhost:3000)
   npm run inngest   # Inngest Dev Server (http://localhost:8288)
   ```
5. http://localhost:3000 を開いてゲームの内容を入力

## 本番(Vercel)

- Vercel に環境変数を設定し、Inngest Cloud でアプリを同期(`/api/inngest`)
- `INNGEST_EVENT_KEY` と `INNGEST_SIGNING_KEY` を設定

## 構成

- `src/app/api/projects/route.ts` プロジェクト保存 + `project/create` イベント送信
- `src/lib/inngest/functions.ts` 計画→生成→push→完了 の7ステップ
- `src/lib/gemini.ts` 計画(JSON)とC#生成のプロンプト
- `src/lib/github.ts` リポジトリ作成と Git Data API での一括コミット
- `src/app/projects/[id]/page.tsx` Realtime ステータス、ログ、コードプレビュー

## 注意

- 認証を入れていないデモ構成です。公開する場合はログインとRLSの見直しが必要です。
- 生成コードは必ず Unity 上でコンパイル確認してください。

##　制作メモ

どんなプロンプトを出してClaudeに出力させたか

---

```markdown
# 🚀 PRD & CLI Development Prompt: AI-Powered Unity Code Generation & GitHub Automation Platform

## 1. Project Overview & Objective

- **Product Name:** UnityCraft AI (Temporary)
- **Goal:** A modern full-stack Web platform where users can input natural language game specifications (e.g., "Create a simple 3D coin pusher game"). An autonomous AI Agent processes the request in the background, generates clean, modular Unity C# scripts, constructs the directory structure (`Assets/Scripts/...`), creates a new GitHub repository, and pushes the generated assets automatically.
- **Target Architecture:** Non-blocking background job processing, LLM task decomposition, robust GitHub API integration, and real-time dashboard monitoring.
- **Cost Constraint:** 100% Free Tier compatible (Gemini Flash API, Inngest, Supabase, Vercel, GitHub API).

---

## 2. Tech Stack & Infrastructure

| Layer                    | Technology                                             |
| :----------------------- | :----------------------------------------------------- |
| **Framework**            | Next.js (App Router), TypeScript, React                |
| **Styling & UI**         | Tailwind CSS, shadcn/ui, Lucide Icons                  |
| **Database & Realtime**  | Supabase (PostgreSQL, Supabase Realtime)               |
| **Background Job Queue** | Inngest (Event-driven background execution)            |
| **LLM Engine**           | Google Gemini API (`@google/genai` / Gemini 1.5 Flash) |
| **GitHub Operations**    | Octokit (`@octokit/rest`)                              |

---

## 3. Core System Architecture & Workflow
```

[User Input (Prompt)]
│
▼ (1. POST /api/projects)
[Next.js API Route] ── (Save 'pending' record) ──> [Supabase DB]
│
▼ (2. Trigger Event: 'project/create')
[Inngest Background Worker]
│
├─► Step A: [Gemini Flash API] Task Planning
│ └─ Identify required Unity C# scripts (e.g., Coin.cs, Pusher.cs, ScoreManager.cs)
│
├─► Step B: [Gemini Flash API] Code Generation
│ └─ Generate clean, well-commented C# scripts with Unity best practices
│
├─► Step C: [Octokit] GitHub Repository & File Automation
│ ├─ Create a new GitHub Repository
│ ├─ Build directory tree (`Assets/Scripts/...`)
│ └─ Commit and push generated `.cs` files
│
└─► Step D: [Supabase DB] Update Status & Emit Realtime Events
└─ Update status to 'completed', attach GitHub Repo URL
│
▼ (3. Supabase Realtime Subscription)
[Next.js Dashboard UI] ── Real-time log stream & Repository link display

````

---

## 4. Database Schema (Supabase PostgreSQL)

```sql
-- 1. Projects Table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'planning', 'generating', 'pushing', 'completed', 'failed'
  github_repo_name VARCHAR(255),
  github_repo_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Agent Logs Table (For Real-time Monitoring)
CREATE TABLE public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  log_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Supabase Realtime for agent_logs and projects
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;

````

---

## 5. Agentic Logic & Prompt Engineering Specification

### Phase 1: Planning Step (Structured JSON Output)

Prompt Gemini Flash to output a valid JSON array specifying file paths and roles:

```json
{
  "repo_name": "unity-coin-pusher-3d",
  "files": [
    {
      "path": "Assets/Scripts/Coin.cs",
      "description": "Handles coin collision, score trigger, and lifecycle."
    },
    {
      "path": "Assets/Scripts/Pusher.cs",
      "description": "Handles back-and-forth ping-pong movement of the pusher platform."
    },
    {
      "path": "Assets/Scripts/ScoreManager.cs",
      "description": "Manages game score state and updates UI."
    }
  ]
}
```

### Phase 2: Script Generation Step

For each planned file, send a strict prompt demanding raw C# code without markdown wrapper clutter when parsed. Ensure Unity best practices:

- Avoid `GetComponent` in `Update()`.
- Use cached references, proper `[SerializeField]`, and memory-efficient patterns.

---

## 6. Detailed Implementation Tasks for Claude Code

### Task 1: Environment & Project Setup

- Initialize a Next.js App Router project with TypeScript and Tailwind CSS.
- Install required dependencies:
  `npm install @supabase/supabase-js inngest @google/genai @octokit/rest lucide-react class-variance-authority clsx tailwind-merge`
- Setup `.env.local` template:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GITHUB_PERSONAL_ACCESS_TOKEN=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

```

### Task 2: Supabase Client & Helper Setup

- Create `@/lib/supabase/client.ts` (browser client) and `@/lib/supabase/admin.ts` (service role client).

### Task 3: Inngest Client & Function Definitions

- Create `@/lib/inngest/client.ts`.
- Create `@/app/api/inngest/route.ts` handling Inngest serve endpoint.
- Define `generateUnityProject` Inngest function using `step.run()` for retry resilience:

1. **Step 1: DB Log Init & Status Update** -> 'planning'
2. **Step 2: Gemini Flash Planner** -> Generate file architecture JSON.
3. **Step 3: DB Status Update** -> 'generating'
4. **Step 4: Gemini Flash Code Writer** -> Generate C# scripts concurrently/sequentially.
5. **Step 5: DB Status Update** -> 'pushing'
6. **Step 6: Octokit Integration** -> Create GitHub repo, create blobs/tree, commit & push to `main` branch.
7. **Step 7: DB Status Update** -> 'completed' with repository URL.

### Task 4: GitHub API Integration Module (`@/lib/github.ts`)

- Implement an Octokit wrapper to:
- Create a public repository under the authenticated user account.
- Create multiple files within `Assets/Scripts/` via Git Data API (Tree & Commit) or single file creation API.

### Task 5: Web UI Implementation

1. **Home / Generator Page (`/`):**

- Prompt input form with pre-filled suggestion cards (e.g., "3D Coin Pusher Game", "Endless Runner Controller", "FPS Shooting Gallery").
- POST request to `/api/projects` -> Trigger Inngest event -> Redirect to `/projects/[id]`.

2. **Dashboard / Project Detail Page (`/projects/[id]`):**

- Live Status Badge (Pending / Processing / Completed / Failed) using Supabase Realtime subscription on `projects`.
- Real-time Execution Log Console displaying `agent_logs` stream.
- Once completed: Prominent "Open in GitHub" button with repository link and preview of generated C# files in an accordion or tabs UI.

---

## 7. Execution Instructions

Please read this PRD carefully and execute the implementation step-by-step. Begin by initializing the project files and directory structure, followed by installing dependencies and implementing core library files.

```
---



- 1
  ・ClaudeにMVPを作らせた。作りたいゲームを入力したら、コード生成が始まってGithubまでpushする流れが一気にできた
  ・最初はAsset/Scriptだけだった。到底これではUnityでそのまま開けない
- 2
  ・もとからProjectSettingなど必要なファイルを初期に生成するようにした。そうしたら、クローンするだけでそのままUnityエディターで開けるようになった。できるかわからなかったができた
- 3
  このままでは一回作っただけで終わり。継続的に修正させる必要がある。そこで、どうすればいいのか壁打ちで考えた。Geminiと。バイブコーディング(無課金)も。なんのコードを修正or新規作成すればいのか考える「プランナーAI」と実際にコードを出力させる「コーディングAI」に分けたほうがいいのではという結論に至った。ただユーザー自身がコードを書き換えてリポジトリに挙げることもしたい。どうやってAIにすべてを把握して続きを作ってもらうかという問題ができた。
- 4 .「人間側が手を加えた変更や、Unity特有のオブジェクト・Prefab・manifestの構造を、どうやってAIに全コンテキストとして渡して 同期し続けるか」という、システム間のデータ整合性やステート管理の難しさ
  manifest.jsonに、コードの役割とpublic関数などをまとめて、その一覧をプランナーAIに渡すことを考えた。でも何のオブジェクトやprefabを実際にユーザーが作ればいいのか。セットアップの仕様書も作成、更新が必要か。ユーザーが追加したオブジェクトをどうAIが認識すればいいのか。かなり管理が難しい。しかも完全無料でやりたい。そこは絶対に譲れない。多すぎない行のプロンプトで悪くない出力をさせるにはどうすればいいのか
- 5
  人間がUnityエディター側でPrefabを配置したり、AIがスクリプトを追加・修正したりする変更を、最小限のトークン数かつ高精度でAIに理解させるためのマニフェスト構造をGeminiに提案してもらった
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
- 6
  これをプランナーに渡して、どこを変更すべきかを判断してもらう！そしてその案をもとにコーダーが直して出力！
  ある程度の役割と流れが決まった。
  プランナーAIがproject-manifest.jsonをもとに提案→その提案をもとにコーダーAIが更新→全体調整用AIが差分を見てjsonを更新し、人間が見るようのセットアップ手順書も更新させる。
- 7
  セットアップ手順のREADMEはどうしようか。あと、コードがどんどん増えていき、肥大化するから、渡す差分だけをREADME＆json作成AIに渡すようにしなければ。でも、インディーゲームの~50ファイルくらいならflashシリーズは余裕で読めるとGeminiは言っていたが、限界を公式で詳しく調べる必要がある。AIに今のREADME+コードを読み込ませて更新させるのと、コードだけを渡すのどっちが正確だろう。インプットはコードだけ渡す方が当然少なくなるが、AIは書き換えるのと新しくつくるのどっちが得意？新しく作る方らしい。それに全コードでも余裕で読めるらしい？
- 8
  ファイルが大きくなってきて、全ファイルを一度にAIに渡すのが限界に来ている。無料で全部を自動化するのは限界があったか、いやまて！順番が逆転している。普通なら、プランナーAIが大まかに計画して、マニフェストを厳格に決めて、それをもとにプログラマーAIがやるはずなのに、、、実際の開発の流れとかなり違う部分があるから限界だったのでは？次は流れに沿ってやってみる。人間が依頼→プランナーAIが仕様企画→システム設計インタフェースAIがmanifest.json書く→それをもとにコーダーAIが書く→最新のmanifest、README更新→レベルデザインセットアップ自分→テストプレイデバッグ自分。他のAIに聞くと、アーキテクトとプログラマーの2体＋自動でREADME+チェックがいいらしい。ブランチもわけるべきか？いろいろ考慮しても絶対に公開しない選択は存在しないからとにかく決めたい
- 9
  考えを改めなおした。無理かもしれない。「スキーマが複雑」「50個の管理が無理」「依存関係が厳しい」の壁。「AIに完璧なシステム（厳密な依存管理）を作らせようとした代償」そもそもmanifest.jsonを作ること自体複雑すぎて管理も大変だったのかもしれない。
- 10 ユーザが要望→対象ファイルをAIに決めさせる→機械が依存先を読み取る→依存先と対象ファイルの全文を取得→プログラマーAIが修正→バリデーションチェックなど→Githubにpush→という流れ

```
