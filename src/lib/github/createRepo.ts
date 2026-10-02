import { Octokit } from "@octokit/rest";
import type { GeneratedFile } from "../types";

interface PushParams {
  repoName: string;
  description: string;
  projectId: string;
  files: GeneratedFile[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 認証ユーザー配下に公開リポジトリを作成し、Git Data API(blob→tree→commit→ref)で
 * 生成ファイルを1コミットにまとめてpushする。
 * Inngestのリトライで再実行されても同じリポジトリを再利用できるよう、
 * descriptionにプロジェクトIDのマーカーを埋め込んでいる。
 */
export async function createRepoAndPush({
  repoName,
  description,
  projectId,
  files,
}: PushParams): Promise<{ name: string; url: string }> {
  const octokit = new Octokit({
    auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
  });
  const { data: me } = await octokit.rest.users.getAuthenticated();
  const owner = me.login;
  const marker = `[unitycraft:${projectId}]`;
  const fullDescription = `${description.slice(0, 200)} ${marker}`;

  // 1. リポジトリの確保(既存なら自分の作ったものだけ再利用)
  const candidates = [repoName, `${repoName}-${projectId.slice(0, 6)}`];
  let repo: { name: string; html_url: string; default_branch: string } | null =
    null;

  for (const name of candidates) {
    try {
      const { data } = await octokit.rest.repos.get({ owner, repo: name });
      if (data.description?.includes(marker)) {
        repo = data;
        break;
      }
      continue; // 他人(別プロジェクト)のリポジトリ名と衝突 → 次の候補へ
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name,
      description: fullDescription,
      private: false,
      auto_init: true, // 空リポジトリだとGit Data APIが使えないため初期コミットを作る
    });
    repo = data;
    break;
  }
  if (!repo) throw new Error("利用可能なリポジトリ名が見つかりませんでした。");

  // 2. 初期コミットのrefが見えるまで少し待つ
  const branch = repo.default_branch || "main";
  let baseSha = "";
  for (let i = 0; i < 6; i++) {
    try {
      const { data } = await octokit.rest.git.getRef({
        owner,
        repo: repo.name,
        ref: `heads/${branch}`,
      });
      baseSha = data.object.sha;
      break;
    } catch (e: any) {
      if (e.status !== 404 && e.status !== 409) throw e;
      await sleep(1000 * (i + 1));
    }
  }
  if (!baseSha) throw new Error("デフォルトブランチを取得できませんでした。");

  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner,
    repo: repo.name,
    commit_sha: baseSha,
  });

  // 3. blob → tree → commit
  const allFiles: GeneratedFile[] = [
    ...files,
    {
      path: "README.md",
      content: `# ${repo.name}\n\nUnityCraft AI で自動生成された Unity C# スクリプトです。\n\n## 使い方\n\n\`Assets/Scripts/\` を Unity プロジェクトの同じ場所にコピーして、各スクリプトをシーン上のオブジェクトにアタッチしてください。\n`,
    },
  ];

  const tree = await Promise.all(
    allFiles.map(async (f) => {
      const { data } = await octokit.rest.git.createBlob({
        owner,
        repo: repo!.name,
        content: f.content,
        encoding: "utf-8",
      });
      return {
        path: f.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: data.sha,
      };
    }),
  );

  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo: repo.name,
    base_tree: baseCommit.tree.sha,
    tree,
  });

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo: repo.name,
    message: "Add generated Unity scripts (UnityCraft AI)",
    tree: newTree.sha,
    parents: [baseSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo: repo.name,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });

  return { name: repo.name, url: repo.html_url };
}
