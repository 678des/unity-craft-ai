"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  {
    title: "3Dコインプッシャー",
    prompt:
      "シンプルな3Dコインプッシャーゲームを作って。プッシャーが前後に動き、コインを落とすとスコアが増える。",
  },
  {
    title: "エンドレスランナー",
    prompt:
      "エンドレスランナーのプレイヤー操作を作って。3レーンを左右に移動でき、ジャンプと障害物との衝突判定がある。",
  },
  {
    title: "FPS射的ゲーム",
    prompt:
      "FPS視点の射的ゲームを作って。マウスで視点移動、クリックで発射、的に当たるとスコアが増え、制限時間がある。",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "送信に失敗しました。");
      router.push(`/projects/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました。");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
        作りたいゲームを文章で書くと、
        <br />
        Unityのスクリプトが GitHub に届きます。
      </h1>
      <p className="mt-4 max-w-xl text-muted">
        AIがスクリプトの構成を考え、C#を書き、新しいリポジトリにpushします。処理はバックグラウンドで進み、画面を閉じても止まりません。
      </p>

      <div className="mt-8">
        <label htmlFor="prompt" className="mb-2 block text-sm font-semibold">
          ゲームの内容
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="例:シンプルな3Dコインプッシャーゲームを作って。"
          className="w-full rounded-md border border-line bg-white p-4 text-base leading-relaxed focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <div className="mt-4">
          <Button size="lg" onClick={submit} disabled={submitting || prompt.trim().length < 5}>
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-5 w-5" aria-hidden />
            )}
            {submitting ? "送信中..." : "スクリプトを生成する"}
          </Button>
        </div>
      </div>

      <section className="mt-12" aria-labelledby="suggestions">
        <h2 id="suggestions" className="mb-3 text-sm font-semibold text-muted">
          例から選ぶ
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setPrompt(s.prompt)}
              className="rounded-md border border-line bg-white p-4 text-left transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="block font-bold">{s.title}</span>
              <span className="mt-1 line-clamp-3 block text-sm text-muted">{s.prompt}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
