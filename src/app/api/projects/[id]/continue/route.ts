import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { GoogleGenAI } from "@google/genai";
import { getProjectById } from "@/lib/supabase/projects";
import { createRepoAndPush } from "@/lib/github";
import { env } from "process";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const projectId = await (await params).id;

    const project = await getProjectById(projectId);
    if (!project || !project.github_repo_name) {
      return NextResponse.json(
        { error: "プロジェクトまたはGitHubリポジトリが見つかりません" },
        { status: 404 },
      );
    }

    const octokit = new Octokit({
      auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
    });
    const { data: me } = await octokit.rest.users.getAuthenticated();
    const owner = me.login;
    const repoName = project.github_repo_name;

    // リポジトリのデフォルトブランチを動的に取得するとより安全です
    const { data: repoInfo } = await octokit.rest.repos.get({
      owner,
      repo: repoName,
    });
    const defaultBranch = repoInfo.default_branch || "main";

    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${defaultBranch}`,
    });
    const commitSha = refData.object.sha;

    const { data: treeData } = await octokit.rest.git.getTree({
      owner,
      repo: repoName,
      tree_sha: commitSha,
      recursive: "true",
    });

    const existingFiles: { path: string; content: string }[] = [];

    for (const item of treeData.tree) {
      // 拡張子が .cs や .md などのテキストファイルのみを回収対象にする（バイナリ除外）
      if (item.type === "blob" && item.sha && item.path) {
        // 必要に応じて .meta ファイルなどをスキップしてもOK

        const isCsScript = item.path.endsWith(".cs");
        const isMarkdown = item.path.endsWith(".md");
        if (!isCsScript && !isMarkdown) {
          continue;
        }

        const { data: blobData } = await octokit.rest.git.getBlob({
          owner,
          repo: repoName,
          file_sha: item.sha,
        });
        const content = Buffer.from(blobData.content, "base64").toString(
          "utf-8",
        );
        existingFiles.push({ path: item.path, content });
      }
    }

    const codeContext = existingFiles
      .map((f) => `--- File: ${f.path} ---\n${f.content}`)
      .join("\n\n");

    console.log("Existing codebase context for gemini:", codeContext);

    const prompt = `
    You are an expert Unity/C# engineer.
    Read the existing Unity project codebase below and create new C# scripts to enrich the game, or provide improved versions of existing scripts.

    [Current Project Codebase]
    ${codeContext}

    [Instructions]
    - Target Unity 6 (Unity 6000) or later.
    - Accurately understand existing class names, method names, and public API signatures, and integrate new code without naming discrepancies (typos or mismatches).
    - Output in JSON array format, including new or modified files (specify the same file path if overwriting an existing file).
    - The output must be a pure JSON array only.

    [Strict Rules]
    1. The output MUST be a valid, syntax-error-free **pure JSON array only**.
    2. Do NOT output Markdown code blocks (such as \`\`\`json) or any greetings/explanations before or after.
    3. Newlines and tabs inside the "content" field values (C# code) must be escaped as \\n or \\t. **Do NOT include raw unescaped newlines that violate JSON syntax rules.**

    [Output Format Example]
    [
      {
        "path": "Assets/Scripts/PlayerController.cs",
        "content": "using UnityEngine;\\n\\npublic class PlayerController : MonoBehaviour\\n{\\n    void Start() {}\\n}"
      }
    ]
    `;

    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL || "gemini-2.5-flash", // プロジェクトに合わせて変更してください
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

    const newFiles = JSON.parse(responseText);

    await createRepoAndPush({
      repoName,
      description: `Update by UnityCraft AI - Continue execution with codebase context`,
      projectId,
      files: newFiles,
    });

    return NextResponse.json({
      success: true,
      message: "既存コードを考慮したAIによる実装とプッシュが完了しました！",
    });
  } catch (error: any) {
    console.error("Continue execution error:", error);
    return NextResponse.json(
      { error: error.message || "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
