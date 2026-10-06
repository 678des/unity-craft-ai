import { Octokit } from "@octokit/rest";

// プログラマーAIが返すファイルの型定義
export interface CoderOutputFile {
  path: string;
  content: string;
}

export interface PushToGitHubParams {
  owner: string; // リポジトリのオーナー名（ユーザー名または組織名）
  repo: string; // リポジトリ名
  branch?: string; // プッシュ先のブランチ（デフォルト: main）
  commitMessage: string; // コミットメッセージ
  files: CoderOutputFile[]; // コーダーAIの出力するファイル配列
}

/**
 * プログラマーAIが生成した複数ファイルをGitHubへ一括コミット・プッシュする関数
 */
export async function pushFilesToGitHub(
  params: PushToGitHubParams,
): Promise<string> {
  const octokit = new Octokit({
    auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN, // GitHub Personal Access Token (Repo権限が必要)
  });

  const owner = params.owner;
  const repo = params.repo;
  const branch = params.branch || "main";
  const commitMessage =
    params.commitMessage || "feat: Update Unity scripts via UnityCraft AI";

  try {
    // 1. 最新のブランチのコミットSHA（HEAD）と、そこから派生するツリーSHAを取得する
    const refResponse = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const latestCommitSha = refResponse.data.object.sha;

    const commitResponse = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });
    const baseTreeSha = commitResponse.data.tree.sha;

    // 2. 各ファイルのBlob（実データ）をGitHub上に作成する
    const treeItems = await Promise.all(
      params.files.map(async (file) => {
        const blobResponse = await octokit.git.createBlob({
          owner,
          repo,
          content: file.content,
          encoding: "utf-8",
        });

        return {
          path: file.path,
          mode: "100644" as const, // 通常のファイル権限
          type: "blob" as const,
          sha: blobResponse.data.sha,
        };
      }),
    );

    // 3. 新しいTree（ファイル構成）を作成する
    const newTreeResponse = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    });
    const newTreeSha = newTreeResponse.data.sha;

    // 4. コミットを作成する（親は現在の最新コミット）
    const newCommitResponse = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTreeSha,
      parents: [latestCommitSha],
    });
    const newCommitSha = newCommitResponse.data.sha;

    // 5. ブランチの参照先（HEAD）を新しく作成したコミットに更新する（Fast-forward push）
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommitSha,
    });

    console.log(
      `Successfully pushed to GitHub: ${owner}/${repo} (${branch}) at commit ${newCommitSha}`,
    );
    return newCommitSha;
  } catch (error) {
    console.error("Failed to push files to GitHub:", error);
    throw new Error(
      `GitHubへのプッシュに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
