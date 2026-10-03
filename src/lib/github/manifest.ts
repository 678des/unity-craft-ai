// src/lib/github/manifest.ts
import { Octokit } from "@octokit/rest";
import { ProjectManifest } from "../types";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai"; // または利用中のSDK
/**
 * 初期プロジェクト用のベースとなる manifest.json を生成する
 */
export function generateInitialManifest(
  projectName: string,
  description: string,
) {
  const manifest = {
    projectName,
    unityVersion: "6000.3.14f1",
    description,
    scenes: [
      {
        path: "Assets/Scenes/MainScene.unity",
        objects: [
          { name: "Main Camera", components: ["Camera", "AudioListener"] },
          { name: "Directional Light", components: ["Light"] },
          { name: "GameManager", components: ["GameManager"] },
        ],
      },
    ],
    scripts: [
      {
        path: "Assets/Scripts/ExampleScript.cs",
        responsibility: "responsibility of this script",
        public_methods: ["public void ExampleMethod(int value)"],
        dependencies: [],
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  return JSON.stringify(manifest, null, 2);
}

/**
 * manifest.json` を更新する
 */

export async function updateManifest(request: Request) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const octokit = new Octokit({
    auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
  });

  try {
    const { owner, repo } = await request.json();

    // 1. Assets/Scripts 配下のファイル一覧を取得する
    const treeResponse = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: "main", // またはデフォルトブランチ
      recursive: "true",
    });

    // .csファイルだけをフィルタリング
    const csFiles = treeResponse.data.tree.filter(
      (item) =>
        item.path &&
        item.path.startsWith("Assets/Scripts/") &&
        item.path.endsWith(".cs"),
    );

    // 2. 各CSファイルの中身を並行して取得する
    const fileContentsPromises = csFiles.map(async (file) => {
      const res = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path!,
      });
      if ("content" in res.data && typeof res.data.content === "string") {
        return {
          path: file.path,
          content: Buffer.from(res.data.content, "base64").toString("utf-8"),
        };
      }
      return null;
    });

    const scriptsData = (await Promise.all(fileContentsPromises)).filter(
      Boolean,
    );

    // 3. Geminiに読み込ませて、最新の project-manifest.json を生成させる
    const prompt = `
you are an expert Unity/C# engineer. You are given the contents of all C# scripts in a Unity project. Your task is to analyze these scripts and generate a comprehensive project-manifest.json that accurately reflects the current state of the project.
【scriptsData】
${JSON.stringify(scriptsData, null, 2)}

【expected output schema】
- projectName (string)
- unityVersion (string: "6000.0.x")
- description (string)
- scenes (array of path & objects)
- scripts (array: path, responsibility, public_methodsの配列, dependenciesの配列)
- updatedAt (ISO 8601 string).
    `;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash", // または適切なモデル
      contents: prompt,
    });

    const rawText = response.text || "";
    console.log("Gemini raw output:", rawText);
    // バックティックなどのマークダウン装飾を除去してJSONにパース
    const jsonString = rawText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const newManifest: ProjectManifest = JSON.parse(jsonString);
    newManifest.updatedAt = new Date().toISOString();

    // 4. GitHub上の project-manifest.json を更新（既存のSHAを取得して上書き）
    const currentFile = await octokit.repos
      .getContent({
        owner,
        repo,
        path: "manifest.json",
      })
      .catch(() => null);

    const sha =
      currentFile && "sha" in currentFile.data
        ? currentFile.data.sha
        : undefined;

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: "manifest.json",
      message: "chore: sync manifest.json from repository codebase",
      content: Buffer.from(JSON.stringify(newManifest, null, 2)).toString(
        "base64",
      ),
      sha,
      branch: "main",
    });

    return NextResponse.json({ success: true, manifest: newManifest });
  } catch (error: any) {
    console.error("Manifest sync failed:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
