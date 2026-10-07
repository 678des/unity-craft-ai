import { GoogleGenAI, Type } from "@google/genai";

// アーキテククトから渡される処理対象ファイル情報の型定義
export interface FileToProcess {
  path: string;
  action: "create" | "modify" | "delete";
  reason: string;
  currentContent: string | null; // 修正対象の場合は既存コード全文、新規作成なら null
}

export interface ArchitectOutput {
  userPrompt: string;
  filesToProcess: FileToProcess[];
}

// 参照用（Read-only）依存関係ファイルの型定義
export interface ReadOnlyDependency {
  path: string;
  content: string;
}

// プログラマーAIが生成する出力ファイルの型定義
export interface CoderOutputFile {
  path: string;
  content: string;
}

export interface CoderResponse {
  files: CoderOutputFile[];
}

/**
 * アーキテククトの変更計画と既存コード（+ 依存関係）を元に、実際の C# コードをまとめて実装・修正するプログラマーAI
 */
export async function runCoderAgent(
  architectOutput: ArchitectOutput,
  readOnlyDependencies: ReadOnlyDependency[] = [],
): Promise<CoderResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // 1. [Files to write] セクションの構築
  const filesToWriteDescription = architectOutput.filesToProcess
    .map((file, index) => {
      const header = `--- ${file.path} (${file.action}) ---\n`;
      const body = file.currentContent ? file.currentContent : "(new file)";
      return `${index + 1}. ${header}${body}\n`;
    })
    .join("\n");

  // 2. [Change plan] セクションの構築
  const changePlanDescription = architectOutput.filesToProcess
    .map(
      (file, index) =>
        `${index + 1}. ${file.path} (${file.action})\n   Reason: ${file.reason}`,
    )
    .join("\n");

  // 3. [Read-only dependencies] セクションの構築
  const readOnlyDescription =
    readOnlyDependencies.length > 0
      ? readOnlyDependencies
          .map((dep) => `--- ${dep.path} ---\n${dep.content}`)
          .join("\n\n")
      : "(None)";

  const systemInstruction = `
    You are an expert Unity 6 (6000) C# programmer.
    Implement the change plan below by writing the FULL content of every file listed in [Files to write].

  [Rules]
1. Write ONLY the files listed in [Files to write]. Never output any other path.
2. Files in [Read-only dependencies] exist already. You may call their public methods, but you must NOT modify or output them.
3. Call methods of other classes ONLY if they appear in the code given in this prompt. Never invent or guess a method, field or class name.
4. If you need something that does not exist, implement it privately inside the file you are writing. Do NOT add it to a read-only dependency.
5. For files with action "modify": keep all existing behavior and keep the signature of every existing public method unless the plan explicitly says to change it. Output the whole file, not a patch.
6. For files with action "create": the class name must match the file name (Unity requirement).
7. Return a valid JSON object matching the requested schema.
8. Header Responsibility: EVERY C# file (whether create or modify) MUST start with a comment header describing its "responsibility" given in the change plan. If it's missing in the existing code, you MUST add it.
9. Component Requirements: Add [RequireComponent(...)] attributes if the script depends on specific components (like Rigidbody or Collider) to prevent missing component errors, even if they were missing in the original code.
10. Attachment Note: Add a brief summary comment near the top of the class explaining which type of GameObject this script should be attached to. `;

  const prompt = `
    [User request]
    ${architectOutput.userPrompt}

    [Change plan (from the architect)]
    ${changePlanDescription}

    [Files to write]
    ${filesToWriteDescription}

    [Read-only dependencies]
    ${readOnlyDescription}
  `;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash", // 高速かつコード生成能力に優れたモデル
    contents: [
      { role: "model", parts: [{ text: systemInstruction }] },
      { role: "user", parts: [{ text: prompt }] },
    ],
    config: {
      temperature: 0.2, // コード生成の安定性を高めるため低めに設定
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          files: {
            type: Type.ARRAY,
            description:
              "List of files with their full C# source code implementation",
            items: {
              type: Type.OBJECT,
              properties: {
                path: {
                  type: Type.STRING,
                  description:
                    "File path matching one of the files to write (e.g., Assets/Scripts/EnemyController.cs)",
                },
                content: {
                  type: Type.STRING,
                  description:
                    "The complete, fully implemented C# source code for the file",
                },
              },
              required: ["path", "content"],
            },
          },
        },
        required: ["files"],
      },
    },
  });

  if (!response.text) {
    throw new Error("プログラマーAIからの応答が空です。");
  }

  return JSON.parse(response.text) as CoderResponse;
}

//return で返される例
// {
//   "files": [
//     {
//       "path": "Assets/Scripts/EnemyController.cs",
//       "content": "using UnityEngine;\n\npublic class EnemyController : MonoBehaviour\n{\n    public float speed = 3.5f;\n    private Transform player;\n\n    void Start()\n    {\n        GameObject playerObj = GameObject.FindWithTag(\"Player\");\n        if (playerObj != null)\n        {\n            player = playerObj.transform;\n        }\n    }\n\n    void Update()\n    {\n        if (player != null)\n        {\n            Vector3 direction = (player.position - transform.position).normalized;\n            transform.position += direction * speed * Time.deltaTime;\n        }\n    }\n}"
//     },
//     {
//       "path": "Assets/Scripts/GameManager.cs",
//       "content": "using UnityEngine;\n\npublic class GameManager : MonoBehaviour\n{\n    public int score = 0;\n\n    public void AddScore(int amount)\n    {\n        score += amount;\n        Debug.Log(\"Current Score: \" + score);\n    }\n\n    // 敵撃破時に呼ばれるスコア加算の拡張メソッド\n    public void AddScoreForEnemyKill()\n    {\n        AddScore(100);\n    }\n}"
//     }
//   ]
// }
