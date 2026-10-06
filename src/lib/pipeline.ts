import { getAllCsFiles } from "./github/getFiles";
import { getAdminClient } from "./supabase/admin";
import { parseCsFileForArchitect } from "./parser";
import { Octokit } from "@octokit/rest";
import { runArchitectAgent } from "./geminiArchitecture";
import { prepareCoderContext } from "./coderContextBuilder";
import { runCoderAgent } from "./geminiCoder";
import { pushFilesToGitHub } from "./githubPush";
export async function ExecuteUpdatePlan(
  projectId: string,
  userPrompt: string,
): Promise<void> {
  //ユーザの要望
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
  console.log("★1", csFiles);

  //2 CSスクリプトを解析して計画を作成
  const octokit = new Octokit({ auth: githubToken });
  const plan = await parseCsFileForArchitect(csFiles, octokit, owner, repo);
  console.log("★2", plan);
  //3 計画を実行
  const architectResponse = await runArchitectAgent(userPrompt, plan);
  console.log("★3", architectResponse);
  //4 機械：JSONを見てファイルの全コード取得＋その他必要な情報をまとめる
  const architectContext = await prepareCoderContext(
    userPrompt,
    architectResponse,
    octokit,
    owner,
    repo,
    "main",
  );
  console.log("★4", architectContext);

  //5 コーダーAI：要望 ＋ JSON ＋ ファイル全文から、pathと全コードを返してもらう
  const coderResponse = await runCoderAgent(architectContext);
  console.log("★5", coderResponse);
  //6 githubにpush
  const commitSha = await pushFilesToGitHub({
    owner: owner,
    repo: repo,
    branch: "main",
    commitMessage: `feat: ${userPrompt} (by UnityCraft AI)`, // コミットメッセージ
    files: coderResponse.files, // コーダーAIが返したファイル配列をそのまま渡す
  });
  console.log("★6", commitSha);
}
