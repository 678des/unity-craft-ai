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
