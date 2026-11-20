# re:Invent English Lab

re:Inventに向けて、技術動画を聞き、ブースでの会話を練習し、使いたい表現を復習する本人専用WebAppです。

## ローカルで起動

必要なもの：Node.js **24以上**、npm。動画・音声から字幕を作る場合はFFmpegも必要です。

```sh
npm ci
npm run setup
npm run dev
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)を開き、生成された`.env`の`APP_PASSWORD`でログインします。APIは127.0.0.1:8787で動きます。`.env`はGit対象外です。設定済みファイルをsetupが上書きすることはありません。

初期状態は**操作検証モード**です。APIキー・課金なしで、サンプル字幕の同期・切替・反復、テキスト会話の流れ、講評の固定例、36の場面フレーズ、復習、履歴削除、プロフィール・予算の保存を試せます。会話画面の「聞く」は端末の読み上げ機能です。検証モードの応答・訳・講評は実際のAIによる学習評価ではありません。

## OpenAIへ接続

`.env`に次を設定して再起動します。通常キーはサーバーのみで使います。

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=自分のAPIキー
```

設定の「接続を確認」でモデルへのアクセスを確認できます。実音声は会話画面の開始ボタンで接続します。マイク拒否時はテキスト練習を使えます。既定は音声gpt-realtime-2.1（WebRTC）、テキストgpt-6-luna（Responses API）、教材STTはwhisper-1です。Whisperの時刻取得は公式ガイドで2027-02-26までの経過措置であり、終了後は字幕取り込みまたはアラインメント方式への移行が必要です。ChatGPT利用枠には接続していません。

モデル名だけを変更して未知の料金で使うことはできません。実接続前に提供状況と[公式料金](https://developers.openai.com/api/docs/pricing)を確認してください。月間初期予算は3,000円、音声1回の費用予約は500円、最大10分です。予算と換算率はアプリの設定で変更でき、未確定費用も合算します。API結果・通話終了が不明な場合は予約を残し、確認できるまで新規音声接続を止めます。設定の照合機能で、OpenAI側の終了と請求記録を確認して精算できます。

## 動画と字幕を追加

初期教材にはAWS Events公式のre:Invent動画をAI・SRE・データ基盤の各1本ずつ登録しています。[動画一覧・出典と確認範囲](docs/video-catalog.md)。APIキーなしでYouTubeの埋め込みプレイヤーを開けます。既存DBにも初回起動時に追加し、視聴位置や取り込み済み字幕は上書きしません。

「セッション」でYouTube URLを登録します。URLの登録だけでは音声を取得しません。字幕のない動画は埋め込み再生と時刻の保存ができます。

「字幕の取り込み・訳の準備」から、利用可能なVTT/SRTまたは英日字幕パッケージを取り込めます。未翻訳部分の翻訳は明示操作で実行し、保存済み字幕の再視聴・切替ではAPIを呼びません。

音声から事前生成する場合は、利用可能なローカルの動画・音声を用意し、学習画面の出典欄にある教材IDを使います。認証は`.env`のAPP_PASSWORDを利用し、別サーバーならLAB_URL・LAB_PASSWORDを環境変数に設定します。

```sh
# --executeなしは見積もりだけ
npm run prepare-material -- --material 教材ID --file /path/session.mp4 --source 提供元 --permission 利用条件の記録 --start 0 --duration 180 --max-yen 100

# 確認した範囲を処理
npm run prepare-material -- --material 教材ID --file /path/session.mp4 --source 提供元 --permission 利用条件の記録 --start 0 --duration 180 --max-yen 100 --execute

# 既存字幕なら --file の代わりに --captions /path/subtitles.vtt
npm run prepare-material -- --help
```

工程は`.local/preparation/`に保存し、同じ入力・処理設定で再実行すると完了工程を再利用します。予算上限だけ変更しても再生成しません。結果不明の処理は自動で再送せず、状態を照会して停止します。費用と実行結果を確認した後の明示的な再試行だけに`--retry-unknown STEP`を使ってください。分割境界が曖昧なら字幕を完成扱いにせず止めます。

字幕生成後は冒頭・中盤・終盤・分割境界を試聴し、時刻補正と内容を確認してください。実教材の同期500ms以内は、この環境ではまだ検証していません。

## オフライン・iPhone

オフライン起動は本番ビルドで確認します。

```sh
npm run build
npm start
```

[http://127.0.0.1:8787](http://127.0.0.1:8787)で開き、復習ノートから「オフライン用に保存」を選びます。静的フレーズと保存カードを30日間参照でき、ログアウト・履歴削除時にその端末の保存を消去します。動画・AI会話はオンライン専用です。更新・復元・接続回復で課金処理やマイクを自動開始しません。

iPhoneからPCへ接続する際、マイクには信頼されたHTTPSが必要です。利用端末が信頼する証明書を用意し、`.env`に`HOST=0.0.0.0`、`APP_ORIGIN=https://PCのホスト名:5173`、`LOCAL_TLS_KEY`、`LOCAL_TLS_CERT`を指定して`npm run dev`を使います。iPhone上の127.0.0.1はPCではありません。証明書の信頼設定と実機Safari・VoiceOverの確認は本人の端末で行ってください。

## Cloudflareの基盤

[Cloudflare向けのTerraform](infra/cloudflare/README.md)で、D1・R2・本人限定のAccess・Workersのカスタムドメインを管理します。基盤を先に作成でき、アプリの公開にはWorkersへの移植が必要です。

## テストと状態

```sh
npm run check       # TypeScript、本番ビルド、単体・API・実CLI統合テスト
npx playwright install chromium  # 対応ブラウザが未導入の場合
npm run test:e2e    # PC・iPhone相当のChromium、axe、オフライン
```

既存の`/usr/bin/chromium`を優先し、別パスなら`PLAYWRIGHT_CHROMIUM_PATH`を指定します。CIも同じチェックを実行します。テスト用DBは`.local/e2e.sqlite`で、通常の学習データと分離しています。

実装・検証範囲と未検証項目は[ローカル実装メモ](docs/local-implementation.md)、元の要件は[設計v0.3](docs/design-v0.3.md)を参照してください。実APIの疎通・実教材の字幕・実機Safari・クラウド公開を、検証モードの動作確認と同一視していません。
