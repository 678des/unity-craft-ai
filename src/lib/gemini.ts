import { GoogleGenAI } from "@google/genai";
import type { PlannedFile, ProjectPlan } from "./types";

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
    contents: `You are a senior Unity developer planning a small Unity project.

User request:
"""
${userPrompt}
"""

Decide which C# scripts are needed and return ONLY valid JSON in this exact shape:
{
  "repo_name": "kebab-case-github-repo-name",
  "files": [
    { "path": "Assets/Scripts/Example.cs", "description": "What this script is responsible for." }
  ]
}

Rules:
- 3 to 8 files. Keep the design modular (single responsibility per script).
- Every path must start with "Assets/Scripts/" and end with ".cs" (subfolders allowed).
- repo_name: lowercase letters, digits and hyphens only.
- Write each description in the same language as the user request.`,
    config: { responseMimeType: "application/json", temperature: 0.3 },
  });

  const raw = (res.text ?? "").replace(/```json|```/g, "").trim();
  let parsed: { repo_name?: unknown; files?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("プランのJSONを解析できませんでした: " + raw.slice(0, 200));
  }

  const files: PlannedFile[] = (Array.isArray(parsed.files) ? parsed.files : [])
    .filter(
      (f: any): f is PlannedFile =>
        typeof f?.path === "string" &&
        typeof f?.description === "string" &&
        isSafeScriptPath(f.path),
    )
    .slice(0, 8);

  if (files.length === 0) {
    throw new Error("有効なファイル構成が生成されませんでした。");
  }

  return {
    repo_name: sanitizeRepoName(String(parsed.repo_name ?? "")),
    files,
  };
}

/** Phase 2: 1ファイルずつ生のC#コードを生成する */
export async function generateScript(
  userPrompt: string,
  plan: ProjectPlan,
  file: PlannedFile,
): Promise<string> {
  const outline = plan.files
    .map((f) => `- ${f.path}: ${f.description}`)
    .join("\n");

  const res = await client().models.generateContent({
    model: MODEL,
    contents: `You are a senior Unity C# engineer. Write the script "${file.path}".

Overall game request:
"""
${userPrompt}
"""

All planned scripts (they must work together; use consistent class names and public APIs):
${outline}

This script's role: ${file.description}

Requirements:
- Output ONLY raw C# source code. No Markdown fences, no explanations.
- The class name must match the file name.
- Use [SerializeField] private fields for inspector-assigned references.
- Never call GetComponent/Find in Update(); cache references in Awake()/Start().
- Prefer memory-efficient patterns (no per-frame allocations, avoid LINQ in hot paths).
- Add concise XML doc comments and inline comments in the same language as the game request.
- Target Unity 6 (Unity 6000) or later. Use modern C# features supported by Unity 6 if appropriate.`,
    config: { temperature: 0.2 },
  });

  const code = stripCodeFence(res.text ?? "");
  if (code.trim().length < 20) {
    throw new Error(`${file.path} のコード生成結果が空でした。`);
  }
  return code;
}
