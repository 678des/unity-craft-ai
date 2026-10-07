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
    .select("github_repo_name") // またはオーナー名を持つカラム
    .eq("id", projectId)
    .single();
  console.log(projectId, project, error);
  const repo = project?.github_repo_name; // 例: "unitycraft-some-game"
  const owner = process.env.GITHUB_OWNER || "your-github-username-or-org"; // 環境変数やユーザー情報から取得
  const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN; // 環境変数から取得
  console.log(repo, owner, githubToken);
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
  // 【追加】コーダーAIが返したコード内のエスケープされた改行を、実際の改行に確実に置換する
  const formattedFiles = coderResponse.files.map((file) => {
    // 文字列としての "\\n" が含まれている場合に備えて確実に改行に変換
    const unescapedContent = file.content
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");

    return {
      path: file.path,
      content: unescapedContent,
    };
  });
  //6 githubにpush
  const commitSha = await pushFilesToGitHub({
    owner: owner,
    repo: repo,
    branch: "main",
    commitMessage: `feat: ${userPrompt} (by UnityCraft AI)`, // コミットメッセージ
    files: formattedFiles, // コーダーAIが返したファイル配列をそのまま渡す
  });
  console.log("★6", commitSha);
}
