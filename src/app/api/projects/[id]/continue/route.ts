import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { GoogleGenAI } from "@google/genai";
import { getProjectById } from "@/lib/supabase/projects";
import { createRepoAndPush } from "@/lib/github/createRepo";
import { env } from "process";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const { userPrompt } = await request.json(); // ユーザーからの追加・修正の要望

    const project = await getProjectById(projectId); // 既存のプロジェクト取得関数
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

    const { data: repoInfo } = await octokit.rest.repos.get({
      owner,
      repo: repoName,
    });
    const defaultBranch = repoInfo.default_branch || "main";

    // 1. リポジトリから現在の "project-manifest.json" を取得する
    let manifestContent = "";
    try {
      const { data: manifestFile } = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path: "project-manifest.json",
        ref: defaultBranch,
      });
      if ("content" in manifestFile) {
        manifestContent = Buffer.from(manifestFile.content, "base64").toString(
          "utf-8",
        );
      }
    } catch (e) {
      // マニフェストがまだない場合のフォールバック
      manifestContent = "{}";
    }

    // 2. プランナーAI用のシステムプロンプト
    const plannerPrompt = `
You are an expert Unity/C# Software Architect & Planner.
Your job is to analyze the current project architecture (via project-manifest.json) and the user's new request, then output a precise change plan.

[Current project-manifest.json]
${manifestContent}

[User Request for Extension / Modification]
${userPrompt}

[Instructions]
1. Do NOT write actual C# code yet. Your output must be a structural change plan.
2. Determine which files need to be modified or newly created.
3. Keep track of existing method signatures and dependencies so that no naming mismatches occur.
★【CRITICAL SAFETY RULE】: You MUST NOT invent new public methods for existing classes unless absolutely necessary. If a target file already exists in the manifest, you must reuse its existing public_methods or explicitly declare the exact signature that matches its responsibility. Do NOT guess method names.
4. Output must be a valid, syntax-error-free **pure JSON object only** following the schema below.
5. Do NOT output Markdown code blocks (like \`\`\`json) or any extra text.

[Output JSON Schema]
{
  "summaryOfChanges": "Description of what needs to be done",
  "targetFiles": [
    {
      "path": "Assets/Scripts/Example.cs",
      "action": "modify", // or "create"
      "reason": "Why this file needs to be changed",
      "plannedMethods": ["void NewMethod()"]
    }
  ]
}
`;

    // 3. プランナーAIの呼び出し
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash", // または適切なモデル
      contents: plannerPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    let responseText = response.text;
    console.log("Planner AI response:", responseText);
    responseText = responseText
      ?.replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    if (!responseText) {
      throw new Error("プランナーAIからの応答が空でした。");
    }

    const changePlan = JSON.parse(responseText);

    // 4. ここから先で、この "changePlan" を次の「コーダーAI」へ引き渡す
    // （次は計画書に載っているファイルだけをコードベースからピンポイントで取得して書かせるフローに繋げます）

    // 2. changePlanの targetFiles に基づき、変更が必要な既存コードだけをGitHubからピンポイントで取得
    const targetFileContents: { path: string; content: string }[] = [];

    for (const fileTarget of changePlan.targetFiles) {
      if (fileTarget.action === "modify") {
        try {
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo: repoName,
            path: fileTarget.path,
            ref: defaultBranch,
          });
          if ("content" in fileData) {
            const content = Buffer.from(fileData.content, "base64").toString(
              "utf-8",
            );
            targetFileContents.push({ path: fileTarget.path, content });
          }
        } catch (e) {
          // ファイルが存在しなかった場合のフォールバック（新規扱いにするなど）
          targetFileContents.push({
            path: fileTarget.path,
            content: "// 新規作成ファイル",
          });
        }
      } else {
        targetFileContents.push({
          path: fileTarget.path,
          content: "// 新規作成ファイル",
        });
      }
    }

    // 3. コーダーAIのプロンプト作成
    const coderPrompt = `
You are an expert Unity/C# Coder.
Based on the architectural Change Plan, the current Project Manifest, and the existing file contents below, write the actual C# code for the target files.

【CRITICAL RULES TO PREVENT METHOD MISMATCHES】
- Do NOT invent or hallucinate methods. You MUST NOT call or implement public methods that do not exist in the project.
- If you need to call a method from another class (e.g., GameManager, SoundManager), you MUST verify its existence from the [Project Manifest] or [Target Files Existing Code] below.
- If a required method does not exist anywhere, you must explicitly define it in the target class and ensure its signature matches the Change Plan.

[Project Manifest (System API Map)]
${JSON.stringify(manifestContent, null, 2)}

[Change Plan]
${JSON.stringify(changePlan, null, 2)}

[Target Files Existing Code]
${targetFileContents.map((f) => `--- File: ${f.path} ---\n${f.content}`).join("\n\n")}

[Instructions]
- Target Unity 6 (Unity 6000).
- Output a pure JSON array containing ALL files to be committed, including the updated C# code.
- Do NOT output Markdown code blocks (like \`\`\`json).
- JSON format example:
[
  { "path": "Assets/Scripts/Example.cs", "content": "using UnityEngine;\\n..." },
  { "path": "Assets/Scripts/NewScript.cs", "content": "using UnityEngine;\\n..." }
]
`;

    // 4. コーダーAIの呼び出し
    const coderResponse = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
      contents: coderPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    let coderResponseText = coderResponse.text || "";
    coderResponseText = coderResponseText
      ?.replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    // ```json から ``` までのブロックで囲まれている場合、中のJSONだけを抽出
    const jsonBlockMatch = coderResponseText.match(
      /```(?:json)?\s*([\s\S]*?)\s*```/,
    );
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      coderResponseText = jsonBlockMatch[1].trim();
    }

    const filesToCommit = JSON.parse(coderResponseText);

    console.log(
      "Files to commit:",
      filesToCommit.map((f: any) => f.path),
    );

    // 5. GitHubへまとめてプッシュ（既存の createRepoAndPush などを流用）
    await createRepoAndPush({
      repoName,
      description: `Update by UnityCraft AI: ${changePlan.summaryOfChanges}`,
      projectId,
      files: filesToCommit, // C#コード + 最新の project-manifest.json + README.md
    });

    return NextResponse.json({
      success: true,
      message:
        "プラン策定、コーディング、およびマニフェストの自己更新・プッシュが完了しました！",
      changePlan,
    });
  } catch (error: any) {
    console.error("Planner error:", error);
    return NextResponse.json(
      { error: error.message || "プラン作成中にサーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
