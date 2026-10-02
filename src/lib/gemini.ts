import { GoogleGenAI } from "@google/genai";
import type { PlannedFile, ProjectPlan, SceneObjectPlan } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function client() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

/** ```csharp ... ``` のようなMarkdownフェンスが付いていても取り除く */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z#]*\n([\s\S]*?)\n?```$/);
  return (match ? match[1] : trimmed).trim() + "\n";
}

function sanitizeRepoName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "unity-generated-project";
}

function isSafeScriptPath(path: string): boolean {
  return (
    path.startsWith("Assets/Scripts/") &&
    path.endsWith(".cs") &&
    !path.includes("..") &&
    !path.includes("\\")
  );
}

/** Phase 1: 構造化JSONでファイル構成を計画する */
export async function planProject(userPrompt: string): Promise<ProjectPlan> {
  const res = await client().models.generateContent({
    model: MODEL,
    contents: `You are a senior Unity developer planning a small 5-minute mobile Unity game.

User request:
"""
${userPrompt}
"""

Decide the repository name, initial scene objects (what needs to be placed in the Unity scene), and C# scripts needed. Return ONLY valid JSON in this exact shape:
{
  "repo_name": "kebab-case-github-repo-name",
  "game_title": "GameTitleInPascalCase",
  "game_concept": "A short sentence describing the core gameplay",
  "scene_objects": [
    {
      "name": "Player",
      "type": "PrimitiveCube",
      "position": [0, 1, 0],
      "scale": [1, 1, 1],
      "components": ["PlayerController.cs"],
      "description": "The player character controlled by touch input."
    }
  ],
  "files": [
    { "path": "Assets/Scripts/PlayerController.cs", "description": "Handles mobile touch input and jump logic." }
  ]
}

Rules:
- 3 to 8 script files. Keep the design modular (single responsibility per script).
- Every script path must start with "Assets/Scripts/" and end with ".cs".
- repo_name: lowercase letters, digits and hyphens only.
- Write descriptions in the same language as the user request.`,
    config: { responseMimeType: "application/json", temperature: 0.3 },
  });

  const raw = (res.text ?? "").replace(/```json|```/g, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("プランのJSONを解析できませんでした: " + raw.slice(0, 200));
  }

  // バリデーションとサニタイズ
  const files: PlannedFile[] = (Array.isArray(parsed.files) ? parsed.files : [])
    .filter(
      (f: any) =>
        typeof f?.path === "string" &&
        typeof f?.description === "string" &&
        isSafeScriptPath(f.path),
    )
    .slice(0, 8);

  const sceneObjects: SceneObjectPlan[] = (
    Array.isArray(parsed.scene_objects) ? parsed.scene_objects : []
  ).map((o: any) => ({
    name: String(o?.name ?? "Object"),
    type: String(o?.type ?? "EmptyObject"),
    position: Array.isArray(o?.position) ? o.position : [0, 0, 0],
    scale: Array.isArray(o?.scale) ? o.scale : [1, 1, 1],
    components: Array.isArray(o?.components) ? o.components : [],
    description: String(o?.description ?? ""),
  }));

  if (files.length === 0) {
    throw new Error("有効なファイル構成が生成されませんでした。");
  }

  return {
    repo_name: sanitizeRepoName(String(parsed.repo_name ?? "")),
    game_title: String(parsed.game_title ?? "UnityGame"),
    game_concept: String(parsed.game_concept ?? ""),
    scene_objects: sceneObjects,
    files,
  };
}

/** Phase 2: 1ファイルずつ生のC#コードを生成する（シーン設計図の共有版） */
export async function generateScript(
  userPrompt: string,
  plan: ProjectPlan,
  file: PlannedFile,
): Promise<string> {
  // 全スクリプトの役割アウトライン
  const scriptOutline = plan.files
    .map((f) => `- ${f.path}: ${f.description}`)
    .join("\n");

  // シーン上に配置されるオブジェクトの構成情報（これをAIに共有する！）
  const sceneOutline = plan.scene_objects
    .map(
      (obj) =>
        `- Name: "${obj.name}" (Type: ${obj.type}), Position: [${obj.position.join(", ")}], Attached Scripts: [${obj.components.join(", ")}], Role: ${obj.description}`,
    )
    .join("\n");

  const res = await client().models.generateContent({
    model: MODEL,
    contents: `You are a senior Unity C# engineer. Write the script "${file.path}".

Overall game request:
"""
${userPrompt}
"""

---
【Scene Structure & Architecture (Planned by Lead Architect)】
The game scene is designed with the following objects. Understand what objects exist and what components they have:
${sceneOutline}

---
【All Planned Scripts】
${scriptOutline}

---
【Your Target Script】
File path: "${file.path}"
This script's role: ${file.description}

Requirements:
- Output ONLY raw C# source code. No Markdown fences, no explanations.
- The class name must match the file name (excluding extension).
- If this script is assigned to a specific object in the scene structure above, write code assuming it is attached to that object (e.g., use GetComponent<T>() to find sibling components or local references).
- Use [SerializeField] private fields for inspector-assigned references.
- Never call GetComponent/Find in Update(); cache references in Awake()/Start().
- Prefer memory-efficient patterns (no per-frame allocations, avoid LINQ in hot paths).
- Add concise XML doc comments and inline comments in the same language as the game request.
- Target Unity 6 (Unity 6000) or later. Use modern C# features supported by Unity 6 if appropriate.
- If this script is designated as the primary Manager (e.g. GameManager) and needs to ensure runtime safety, it may include fallback safeguards, but rely primarily on the pre-planned scene structure above.`,
    config: { temperature: 0.2 },
  });

  const code = stripCodeFence(res.text ?? "");
  if (code.trim().length < 20) {
    throw new Error(`${file.path} のコード生成結果が空でした。`);
  }
  return code;
}

export function generateReadme(plan: ProjectPlan): string {
  const objectsList = plan.scene_objects
    .map(
      (obj) => `### ${obj.name} (${obj.type})
- **Position:** \`[${obj.position.join(", ")}]\`
- **Scale:** \`[${obj.scale?.join(", ") ?? "1, 1, 1"}]\`
- **Attached Scripts:** \`${obj.components.length > 0 ? obj.components.join(", ") : "None"}\`
- **Description:** ${obj.description}
`,
    )
    .join("\n");

  const scriptsList = plan.files
    .map((f) => `- **\`${f.path}\`**: ${f.description}`)
    .join("\n");

  return `# ${plan.game_title}

> ${plan.game_concept}

This Unity project was automatically generated by **UnityCraft AI**.
このプロジェクトは UnityCraft AI によって自動生成されました。

---

## 🛠 Scene Setup Guide
Open \`Assets/Scenes/MainScene.unity\` and ensure the hierarchy matches the following structure:

${objectsList}

---

## 📜 Scripts Overview
${scriptsList}
`;
}
