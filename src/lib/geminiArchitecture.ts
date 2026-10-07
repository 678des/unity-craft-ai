import { GoogleGenAI, Type } from "@google/genai";

// インデックスの型定義
export interface CodeIndexItem {
  path: string;
  responsibility: string;
  publicMethods: string[];
}

// アーキテククトの出力する変更指示の型定義
export interface ArchitectAction {
  path: string;
  action: "create" | "modify" | "delete";
  reason: string;
}

export interface ArchitectResponse {
  files: ArchitectAction[];
}

/**
 * ユーザーの要望とコードの軽量インデックスを元に、変更すべきファイルを決定するアーキテククトAI
 */
export async function runArchitectAgent(
  userPrompt: string,
  codeIndex: CodeIndexItem[],
): Promise<ArchitectResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const systemInstruction = `
    You are the lead AI architect for a Unity 6 (Unity 6000) game development project.
    Analyze user requirements and a lightweight index of the C# scripts in the current project (file paths, responsibilities, and a list of public methods), and determine which files should be “created,” “modified,” or “deleted” to achieve the objectives.
    
    [Rules]
    - Select “modify” if you can reuse or extend existing files.
    - Select “create” only if new components or systems are required. Be sure to use Unity’s standard path format, starting with “Assets/Scripts/...”.
    - Describe the reason for the change concisely and clearly.
  `;

  const prompt = `
    ## user request
    ${userPrompt}

    ## Current Code Lightweight Index
    ${JSON.stringify(codeIndex, null, 2)}
  `;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash", // 高速かつ構造化出力に優れたモデル
    contents: [
      { role: "model", parts: [{ text: systemInstruction }] },
      { role: "user", parts: [{ text: prompt }] },
    ],
    config: {
      temperature: 0.2, // 安定した判断のため低めに設定
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          files: {
            type: Type.ARRAY,
            description: "list of files to create, modify, or delete",
            items: {
              type: Type.OBJECT,
              properties: {
                path: {
                  type: Type.STRING,
                  description:
                    "file path within the Unity project (e.g., Assets/Scripts/EnemyController.cs)",
                },
                action: {
                  type: Type.STRING,
                  enum: ["create", "modify", "delete"],
                  description: "action to be taken on the file",
                },
                reason: {
                  type: Type.STRING,
                  description: "reason for the action",
                },
              },
              required: ["path", "action", "reason"],
            },
          },
        },
        required: ["files"],
      },
    },
  });

  if (!response.text) {
    throw new Error("アーキテククトAIからの応答が空です。");
  }

  return JSON.parse(response.text) as ArchitectResponse;
}
//returnで返されるjsonの例
// {
//   "files": [
//     {
//       "path": "Assets/Scripts/EnemyController.cs",
//       "action": "create",
//       "reason": "敵の移動と体力を持つ新規クラス"
//     },

//     {
//       "path": "Assets/Scripts/GameManager.cs",
//       "action": "modify",
//       "reason": "敵撃破時のスコア加算を接続"
//     }
//   ]
// }
