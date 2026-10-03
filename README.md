# UnityCraft AI

自然言語でゲームの内容を書くと、Gemini が Unity C# スクリプトを生成し、新しい GitHub リポジトリに push します。

## セットアップ

1. 依存関係をインストール
   ```bash
   npm install
   ```
2. Supabase でプロジェクトを作成し、SQL Editor で `supabase/migrations/001_init.sql` を実行
3. `.env.local.example` を `.env.local` にコピーして値を入力
   - `GEMINI_API_KEY`: Google AI Studio で発行
   - `GITHUB_PERSONAL_ACCESS_TOKEN`: リポジトリ作成権限(classic なら `repo`、fine-grained なら Administration と Contents の書き込み)
4. 2つのターミナルで起動
   ```bash
   npm run dev       # Next.js (http://localhost:3000)
   npm run inngest   # Inngest Dev Server (http://localhost:8288)
   ```
5. http://localhost:3000 を開いてゲームの内容を入力

## 本番(Vercel)

- Vercel に環境変数を設定し、Inngest Cloud でアプリを同期(`/api/inngest`)
- `INNGEST_EVENT_KEY` と `INNGEST_SIGNING_KEY` を設定

## 構成

- `src/app/api/projects/route.ts` プロジェクト保存 + `project/create` イベント送信
- `src/lib/inngest/functions.ts` 計画→生成→push→完了 の7ステップ
- `src/lib/gemini.ts` 計画(JSON)とC#生成のプロンプト
- `src/lib/github.ts` リポジトリ作成と Git Data API での一括コミット
- `src/app/projects/[id]/page.tsx` Realtime ステータス、ログ、コードプレビュー

## 注意

- 認証を入れていないデモ構成です。公開する場合はログインとRLSの見直しが必要です。
- 生成コードは必ず Unity 上でコンパイル確認してください。

##制作メモ
1
・ClaudeにMVPを作らせた。作りたいゲームを入力したら、コード生成が始まってGithubまでpushする流れが一気にできた
・最初はAsset/Scriptだけだった。到底これではUnityでそのまま開けない
2
・もとからProjectSettingなど必要なファイルを初期に生成するようにした。そうしたら、クローンするだけでそのままUnityエディターで開けるようになった。できるかわからなかったができた
3
このままでは一回作っただけで終わり。継続的に修正させる必要がある。そこで、どうすればいいのか壁打ちで考えた。Geminiと。バイブコーディング(無課金)も。なんのコードを修正or新規作成すればいのか考える「プランナーAI」と実際にコードを出力させる「コーディングAI」に分けたほうがいいのではという結論に至った。ただユーザー自身がコードを書き換えてリポジトリに挙げることもしたい。どうやってAIにすべてを把握して続きを作ってもらうかという問題ができた。
4 .「人間側が手を加えた変更や、Unity特有のオブジェクト・Prefab・manifestの構造を、どうやってAIに全コンテキストとして渡して同期し続けるか」という、システム間のデータ整合性やステート管理の難しさ
manifest.jsonに、コードの役割とpublic関数などをまとめて、その一覧をプランナーAIに渡すことを考えた。でも何のオブジェクトやprefabを実際にユーザーが作ればいいのか。セットアップの仕様書も作成、更新が必要か。ユーザーが追加したオブジェクトをどうAIが認識すればいいのか。かなり管理が難しい。しかも完全無料でやりたい。そこは絶対に譲れない。多すぎない行のプロンプトで悪くない出力をさせるにはどうすればいいのか
5
人間がUnityエディター側でPrefabを配置したり、AIがスクリプトを追加・修正したりする変更を、最小限のトークン数かつ高精度でAIに理解させるためのマニフェスト構造をGeminiに提案してもらった
export interface ProjectManifest {
projectName: string;
unityVersion: string;
description: string;
scenes: SceneInfo[];
scripts: ScriptInfo[];
// ▼ 追加：人間やUnityエディター側での手動作業・注意点
humanSetupInstructions: string[];
updatedAt: string; // ISO 8601形式
}
6
これをプランナーに渡して、どこを変更すべきかを判断してもらう！そしてその案をもとにコーダーが直して出力！
