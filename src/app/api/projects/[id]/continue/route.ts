import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { GoogleGenAI } from "@google/genai"; // または既存のGemini SDKのインポートに合わせてください

// Supabaseなどを利用して、プロジェクトIDから「GitHubのリポジトリ名」や「前回のプロンプト」を引いてくるイメージ
// 今回はプレースホルダーとして関数を用意しています
import { getProjectById } from "@/lib/supabase/projects"; // 既存のSupabaseクライアントを利用してプロジェクト情報を取得する関数

// 既存のpush関数を再利用（または別ファイルからインポート）
import { createRepoAndPush } from "@/lib/github";

// Google Gen AI SDKの初期化
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const projectId = await (await params).id;

    // 1. DBからプロジェクト情報を取得（リポジトリ名などを特定するため）
    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { error: "プロジェクトが見つかりません" },
        { status: 404 },
      );
    }

    const octokit = new Octokit({
      auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
    });
    const { data: me } = await octokit.rest.users.getAuthenticated();
    const owner = me.login;
    const repoName = project.github_repo_name; // 保存されているリポジトリ名

    // 2. GitHubから現在のリポジトリの全ファイルを再帰的に取得する
    // まずデフォルトブランチの最新コミットSHAを取得
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/main`,
    });
    const commitSha = refData.object.sha;

    // recursive: "true" でフォルダ階層丸ごとファイル一覧を取得
    const { data: treeData } = await octokit.rest.git.getTree({
      owner,
      repo: repoName,
      tree_sha: commitSha,
      recursive: "true",
    });

    // 3. 各ファイルのBlobから中身（ソースコードのテキスト）を回収する
    const existingFiles: { path: string; content: string }[] = [];

    for (const item of treeData.tree) {
      // ファイル（blob）かつ、不要なファイル（.gitignoreやREADMEなど）を除外したい場合はここで調整
      if (item.type === "blob" && item.sha && item.path) {
        const { data: blobData } = await octokit.rest.git.getBlob({
          owner,
          repo: repoName,
          file_sha: item.sha,
        });
        // Base64デコード
        const content = Buffer.from(blobData.content, "base64").toString(
          "utf-8",
        );
        existingFiles.push({ path: item.path, content });
      }
    }

    // 4. Geminiに現在のコードを見せて「次の拡張・修正コード」を考えてもらう
    const codeContext = existingFiles
      .map((f) => `--- File: ${f.path} ---\n${f.content}`)
      .join("\n\n");

    const prompt = `
あなたは優秀なUnity/C#エンジニアです。
以下の既存のUnityプロジェクトのコードベースを読み込み、さらにゲームをリッチにするための新しいC#スクリプト（または既存の改良版）を1〜2個作成してください。

【現在のプロジェクトのコード】
${codeContext}

【指示】
- Unityでそのまま使えるC#スクリプトを出力してください。
- 出力はJSON形式で返してください。

【絶対厳守のルール】
1. 出力は必ず、構文エラーのない**純粋なJSON配列のみ**にしてください。
2. Markdownのコードブロック（\`\`\`json など）や、前後の挨拶・解説は**一切出力しないでください**。
3. "content" プロジェクトの値（C#コード）の中にある改行やタブは、必ずエスケープ文字（\\n や \\t）として記述し、**JSONの構文規則に違反する生の改行を含めないでください**。
【出力フォーマット例】
[
  {
    "path": "Assets/Scripts/NewFeature.cs",
    "content": "using UnityEngine;\\n\\npublic class NewFeature : MonoBehaviour\\n{\\n    void Start() {}\\n}"
  }
]

`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite", // またはお使いのモデル
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    let responseText = response.text;

    responseText = responseText
      ?.replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    if (!responseText) {
      throw new Error("Geminiからの応答が空でした。");
    }

    console.log("Gemini response:", responseText);

    const newFiles = JSON.parse(responseText);

    // 5. 生成された新しいファイルをGitHubにプッシュする
    await createRepoAndPush({
      repoName,
      description: `Update by UnityCraft AI - Continue execution`,
      projectId,
      files: newFiles,
    });

    return NextResponse.json({
      success: true,
      message: "AIによる続きの実装とプッシュが完了しました！",
    });
  } catch (error: any) {
    console.error("Continue execution error:", error);
    return NextResponse.json(
      { error: error.message || "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
