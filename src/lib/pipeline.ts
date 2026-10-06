import { getAllCsFiles } from "./github/getFiles";
import { getAdminClient } from "./supabase/admin";
import { parseCsFileForArchitect } from "./parser";
import { Octokit } from "@octokit/rest";
import { runArchitectAgent } from "./geminiArchitecture";
import { prepareCoderContext } from "./coderContextBuilder";
export async function ExecuteUpdatePlan(projectId: string): Promise<void> {
  //ユーザの要望を取得
  const userPrompt = "";
  //1 CSスクリプトを取得
  const { data: project, error } = await getAdminClient()
    .from("projects")
    .select("github_repo_name, user_id") // またはオーナー名を持つカラム
    .eq("id", projectId)
    .single();
  const repo = project?.github_repo_name; // 例: "unitycraft-some-game"
  const owner = process.env.GITHUB_OWNER || "your-github-username-or-org"; // 環境変数やユーザー情報から取得
  const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN; // 環境変数から取得

  if (!repo || !owner || !githubToken) {
    throw new Error("GitHubリポジトリ情報が不足しています。");
  }
  const csFiles = await getAllCsFiles(owner, repo, "main", githubToken);

  //2 CSスクリプトを解析して計画を作成
  const octokit = new Octokit({ auth: githubToken });
  const plan = await parseCsFileForArchitect(csFiles, octokit, owner, repo);

  //3 計画を実行
  const architectResponse = await runArchitectAgent(userPrompt, plan);

  //機械：JSONを見てファイル取得＋依存先収集
  const architectContext = prepareCoderContext(
    userPrompt,
    architectResponse,
    octokit,
    owner,
    repo,
    "main",
  );

  //コーダーAI：要望 ＋ このJSON ＋ ファイル全文 を受け取る

  //修正後の全文を出力
}
