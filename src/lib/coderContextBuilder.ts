import { Octokit } from "@octokit/rest";
import { ArchitectResponse } from "./geminiArchitecture"; // 先ほどのアーキテククトの型定義

/**
 * コーダーAIに渡す「ファイルごとの詳細データ」の型定義
 */
export interface CoderFileContext {
  path: string;
  action: "create" | "modify" | "delete";
  reason: string;
  /** 既存ファイルの場合はGitHubから取得したコード全文。新規・削除の場合は空文字またはnull */
  currentContent: string | null;
}

export interface CoderPromptContext {
  userPrompt: string;
  filesToProcess: CoderFileContext[];
}

/**
 * アーキテククトAIの計画（ArchitectResponse）に基づき、
 * GitHubから対象ファイルのコード全文を取得・集約してプログラマーAIへのインプットを組み立てる
 */
export async function prepareCoderContext(
  userPrompt: string,
  architectResponse: ArchitectResponse,
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string = "main",
): Promise<CoderPromptContext> {
  const filesToProcess: CoderFileContext[] = [];

  for (const actionItem of architectResponse.files) {
    const { path, action, reason } = actionItem;
    let currentContent: string | null = null;

    // "modify" または "delete" の場合は、GitHubから既存のコード全文を取得する
    if (action === "modify" || action === "delete") {
      try {
        const response = await octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
        });

        // GitHub APIの仕様上、ファイル単体の場合は content（Base64エンコード）が返る
        if (
          !Array.isArray(response.data) &&
          response.data.type === "file" &&
          response.data.content
        ) {
          // Base64をUTF-8文字列にデコード
          currentContent = Buffer.from(
            response.data.content,
            "base64",
          ).toString("utf-8");
        }
      } catch (error: any) {
        // ファイルが実際には存在しなかった場合などのフォールバック
        if (error.status === 404) {
          console.warn(
            `[Warning] 修正対象として指定されたファイルが見つかりませんでした: ${path}`,
          );
          currentContent = null;
        } else {
          throw error;
        }
      }
    }

    // "create" の場合は基本的にコードはまだ存在しないため null / 空文字
    filesToProcess.push({
      path,
      action,
      reason,
      currentContent,
    });
  }

  return {
    userPrompt,
    filesToProcess,
  };
}

//returnで返される例
// {
//   "userPrompt": "敵がプレイヤーを追いかけてくるカオスな挙動を追加して、ついでにGameManagerのスコア加算処理をそれに合わせて修正して",
//   "filesToProcess": [
//     {
//       "path": "Assets/Scripts/EnemyController.cs",
//       "action": "create",
//       "reason": "新規にプレイヤーを追跡する敵のAI挙動を実装するため",
//       "currentContent": null
//     },
//     {
//       "path": "Assets/Scripts/GameManager.cs",
//       "action": "modify",
//       "reason": "敵撃破時に加算されるスコアの計算ロジックを新しく追加するため",
//       "currentContent": "using UnityEngine;\n\npublic class GameManager : MonoBehaviour\n{\n    public int score = 0;\n\n    public void AddScore(int amount)\n    {\n        score += amount;\n        Debug.Log(\"Current Score: \" + score);\n    }\n}\n"
//     }
//   ]
// }
