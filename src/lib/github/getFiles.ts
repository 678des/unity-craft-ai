import { Octokit } from "@octokit/rest";

export async function getAllCsFiles(
  owner: string,
  repo: string,
  branch: string = "main",
  githubToken: string,
) {
  const octokit = new Octokit({ auth: githubToken });

  // 1. Git Tree API でリポジトリ全体のファイルツリーを再帰的に取得
  const treeResponse = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "true",
  });

  // 2. 「.cs」ファイルのみを抽出
  const csFiles = treeResponse.data.tree.filter(
    (item) => item.path && item.path.endsWith(".cs") && item.type === "blob",
  );
  return csFiles;
}

// [
//   {
//     "path": "src/Program.cs",
//     "mode": "100644",
//     "type": "blob",
//     "sha": "a1b2c3d4e5f67890123456789abcdef012345678",
//     "size": 1250,
//     "url": "https://api.github.com/repos/owner/repo/git/blobs/a1b2c3d4e5f67890123456789abcdef012345678"
//   },
//   {
//     "path": "src/Controllers/HomeController.cs",
//     "mode": "100644",
//     "type": "blob",
//     "sha": "f9e8d7c6b5a43210987654321fedcba098765432",
//     "size": 3400,
//     "url": "https://api.github.com/repos/owner/repo/git/blobs/f9e8d7c6b5a43210987654321fedcba098765432"
//   }
// ]
