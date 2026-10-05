import { inngest } from "./client";
import { getAdminClient } from "@/lib/supabase/admin";
import { planProject, generateScript, generateReadme } from "@/lib/gemini";
import { createRepoAndPush } from "@/lib/github/createRepo";
//import { generateInitialManifest } from "../github/manifest";
import type { GeneratedFile, ProjectPlan, ProjectStatus } from "@/lib/types";

async function setStatus(
  projectId: string,
  status: ProjectStatus,
  extra: Record<string, unknown> = {},
) {
  const { error } = await getAdminClient()
    .from("projects")
    .update({ status, ...extra })
    .eq("id", projectId);
  if (error) throw new Error(`ステータス更新に失敗: ${error.message}`);
}

async function addLog(projectId: string, stepName: string, message: string) {
  const { error } = await getAdminClient().from("agent_logs").insert({
    project_id: projectId,
    step_name: stepName,
    log_message: message,
  });
  if (error) console.error("agent_logs insert failed:", error.message);
}

export const generateUnityProject = inngest.createFunction(
  {
    id: "generate-unity-project",
    retries: 3,
    onFailure: async ({ event, error }) => {
      const projectId = (event.data.event.data as { projectId: string })
        .projectId;
      await setStatus(projectId, "failed", { error_message: error.message });
      await addLog(projectId, "error", `失敗しました: ${error.message}`);
    },
  },
  { event: "project/create" },
  async ({ event, step }) => {
    const { projectId } = event.data as { projectId: string };

    // Step 1: ログ初期化 & status -> planning
    const userPrompt = await step.run("init", async () => {
      const { data, error } = await getAdminClient()
        .from("projects")
        .select("prompt")
        .eq("id", projectId)
        .single();
      if (error || !data) throw new Error("プロジェクトが見つかりません。");
      await setStatus(projectId, "planning");
      await addLog(projectId, "init", "ジョブを開始しました。");
      return data.prompt as string;
    });

    // Step 2: Gemini でファイル構成を計画
    const plan: ProjectPlan = await step.run("plan", async () => {
      await addLog(
        projectId,
        "planning",
        "必要なスクリプトを検討しています...",
      );
      const result = await planProject(userPrompt);
      await addLog(
        projectId,
        "planning",
        `${result.files.length}個のスクリプトを計画しました: ` +
          result.files.map((f) => f.path.split("/").pop()).join(", "),
      );
      return result;
    });

    // Step 3: status -> generating
    await step.run("status-generating", () =>
      setStatus(projectId, "generating"),
    );

    // Step 4: 1ファイルずつコード生成(無料枠のレート制限に配慮して逐次実行)
    const generated: GeneratedFile[] = [];
    for (const [i, file] of plan.files.entries()) {
      const content = await step.run(`generate-${i}`, async () => {
        await addLog(
          projectId,
          "generating",
          `(${i + 1}/${plan.files.length}) ${file.path} を生成しています...`,
        );
        return generateScript(userPrompt, plan, file);
      });
      generated.push({ path: file.path, content });
    }
    // 2. 基本ドキュメント & Git設定（UserSettings や packages-lock.json も確実に除外）
    // generated.push({
    //   path: "manifest.json",
    //   content: generateInitialManifest(plan.repo_name, plan.game_concept),
    // });
    generated.push({
      path: "SETUP.md",
      content: generateReadme(plan),
    });

    generated.push({
      path: ".gitignore",
      content:
        "/Library/\n/Temp/\n/Logs/\n/Obj/\n/UserSettings/\nPackages/packages-lock.json\n/Assets/TextMesh Pro/\n*.csproj\n*.unityproj\n*.sln\n*.suo\n*.tmp\n*.user\n*.userprefs\n*.pidb\n*.booproj\n*.svd\n*.pdb\n*.mdb\n*.opendb\n*.VC.db\n.DS_Store",
    });

    // 3. Unity 6 (6000.3.14f1) 必須設定ファイル群
    generated.push({
      path: "ProjectSettings/ProjectVersion.txt",
      content: "m_EditorVersion: 6000.3.14f1\n",
    });

    generated.push({
      path: "ProjectSettings/ProjectSettings.asset",
      content: `%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!129 &1\nPlayerSettings:\n  m_ProductName: "${plan.repo_name}"\n`,
    });

    // 4. パッケージ設定（TextMeshProや物理・各種モジュールを網羅）
    generated.push({
      path: "Packages/manifest.json",
      content: JSON.stringify(
        {
          dependencies: {
            "com.unity.ugui": "2.0.0",
            "com.unity.textmeshpro": "3.0.9",
            "com.unity.modules.ai": "1.0.0",
            "com.unity.modules.animation": "1.0.0",
            "com.unity.modules.audio": "1.0.0",
            "com.unity.modules.imgui": "1.0.0",
            "com.unity.modules.particlesystem": "1.0.0",
            "com.unity.modules.physics": "1.0.0",
            "com.unity.modules.tilemap": "1.0.0",
            "com.unity.modules.ui": "1.0.0",
          },
        },
        null,
        2,
      ),
    });

    // 5. 空フォルダ構造の維持（.gitkeep）- PrefabsやMaterialsに加え、Scenesも空維持
    const emptyFolders = [
      "Assets/Prefabs/.gitkeep",
      "Assets/Materials/.gitkeep",
      "Assets/Scenes/.gitkeep",
    ];
    for (const folderPath of emptyFolders) {
      generated.push({ path: folderPath, content: "" });
    }

    // 6. 最小限の空のシーン
    generated.push({
      path: "Assets/Scenes/MainScene.unity",
      content: `%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!29 &1\nOcclusionCullingSettings:\n  m_ObjectHideFlags: 0\n  serializedVersion: 2\n  m_OcclusionBakeSettings:\n    smallestOccluder: 5\n    smallestHole: 0.25\n    backfaceThreshold: 100\n`,
    });

    // TODO: ここに必要なUnityの設定ファイルを追加する（AudioManager.asset, InputManager.assetなど）
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\AudioManager.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\ClusterInputManager.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\DynamicsManager.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\EditorBuildSettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\EditorSettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\GraphicsSettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\InputManager.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\MemorySettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\MultiplayerManager.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\NavMeshAreas.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\PackageManagerSettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\Physics2DSettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\PresetManager.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\ProjectSettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\ProjectVersion.txt
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\QualitySettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\SceneTemplateSettings.json
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\TagManager.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\TimeManager.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\UnityConnectSettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\VersionControlSettings.asset
    // C:\Users\user\Documents\git_project\simple-3d-coin-pusher\ProjectSettings\VFXManager.asset
    // --- テンプレート追加ここまで ---
    // Step 5: status -> pushing(プレビュー用に生成物もDBへ保存)
    await step.run("status-pushing", async () => {
      await setStatus(projectId, "pushing", { generated_files: generated });
      await addLog(
        projectId,
        "pushing",
        "GitHubリポジトリを作成してpushします...",
      );
    });

    // Step 6: GitHub にリポジトリ作成 & push
    const repo = await step.run("push-to-github", async () => {
      const result = await createRepoAndPush({
        repoName: plan.repo_name,
        description: `Unity scripts generated from: ${userPrompt.replace(/\s+/g, " ")}`,
        projectId,
        files: generated,
      });
      await addLog(projectId, "pushing", `push完了: ${result.url}`);
      return result;
    });

    // Step 7: status -> completed
    await step.run("complete", async () => {
      await setStatus(projectId, "completed", {
        github_repo_name: repo.name,
        github_repo_url: repo.url,
      });
      await addLog(projectId, "completed", "すべての処理が完了しました。");
    });

    return { projectId, repoUrl: repo.url };
  },
);
