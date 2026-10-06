import { Octokit } from "@octokit/rest";

interface CsFileIndex {
  path: string;
  responsibility: string;
  publicMethods: string[];
}

interface CsFilesInfo {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
  size?: number;
  url?: string;
}

export async function parseCsFileForArchitect(
  csFilesInfo: CsFilesInfo[],
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<CsFileIndex[]> {
  // 並列処理で全ファイルの Blob を取得 & パース
  const promises = csFilesInfo.map(async (file) => {
    if (!file.path || !file.sha) return null;

    try {
      // 1. Git Blob API でファイル内容を取得
      const blobResponse = await octokit.rest.git.getBlob({
        owner,
        repo,
        file_sha: file.sha,
      });

      // 2. Base64 デコード
      const content = Buffer.from(blobResponse.data.content, "base64").toString(
        "utf-8",
      );

      // 3. @responsibility の取得 (コメント行から抽出)
      const responsibility = extractResponsibility(content);

      // 4. public メソッドの抽出
      const publicMethods = extractPublicMethods(content);

      return {
        path: file.path,
        responsibility,
        publicMethods,
      };
    } catch (error) {
      console.error(`Failed to process ${file.path}:`, error);
      return null;
    }
  });

  const results = await Promise.all(promises);
  // エラー等で null になった要素を除外
  return results.filter((item): item is CsFileIndex => item !== null);
}

// [
//   {
//     "path": "src/Services/AuthService.cs",
//     "responsibility": "ユーザー認証およびJWTトークン発行を担当する",
//     "publicMethods": [
//       "LoginAsync",
//       "LogoutAsync",
//       "ValidateToken"
//     ]
//   },
//   {
//     "path": "src/Controllers/OrderController.cs",
//     "responsibility": "注文リクエストの受付とステータス変更を行うAPIコントローラー",
//     "publicMethods": [
//       "CreateOrder",
//       "GetOrderStatus",
//       "CancelOrder"
//     ]
//   }
// ]

/**
 * @responsibility 注釈をコメントから抽出するヘルパー関数
 */
function extractResponsibility(code: string): string {
  // // または /* で始まるコメント行内の @responsibility を対象にする
  const respRegex = /(?:\/\/\/|\/\/|\*)\s*@responsibility\s+(.+)$/m;
  const match = code.match(respRegex);
  return match ? match[1].trim() : "";
}

/**
 * C# コードから public メソッド名を精度高く抽出するヘルパー関数
 */
function extractPublicMethods(code: string): string[] {
  // 1. 文字列リテラルやコメントを除去（誤検知防止）
  const cleanCode = code
    .replace(/\/\*[\s\S]*?\*\//g, "") // ブロックコメント除去
    .replace(/\/\/.*/g, "") // 行コメント除去
    .replace(/"(?:[^"\\]|\\.)*"/g, ""); // 文字列リテラル除去

  // 2. public修飾子のついたメンバー宣言を判定
  // 修飾子: async, static, virtual, override, sealed, new, abstract, partial 等に対応
  const methodRegex =
    /public\s+(?:(?:async|static|virtual|override|sealed|new|abstract|partial)\s+)*([\w<>[\]?]+)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/g;

  const methods: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = methodRegex.exec(cleanCode)) !== null) {
    const returnType = match[1];
    const methodName = match[2];

    // class, struct, interface, enum, delegate 宣言を除外
    const keywords = [
      "class",
      "struct",
      "interface",
      "enum",
      "delegate",
      "event",
    ];
    if (keywords.includes(returnType) || keywords.includes(methodName)) {
      continue;
    }

    // コンストラクタ定義（戻り値型とメソッド名が同じ場合）を除外
    if (returnType === methodName) {
      continue;
    }

    methods.push(methodName);
  }

  return Array.from(new Set(methods));
}
