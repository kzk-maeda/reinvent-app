# ローカル版の実装と検証

設計元：[design-v0.3.md](design-v0.3.md)。ローカル実装を最初の対象とし、公開・Cloudflareへのデプロイは行っていません。

## 構成

- React 19 / TypeScript / Vite。会話・動画・性能計測は分割読み込み。
- Hono / Node.js 24。本人パスワードで12時間のHttpOnly・SameSite=Strictセッションを発行し、全APIを認証。更新系には独自ヘッダーとOrigin検査。ログイン試行は15分で10回まで。
- Node標準SQLiteで教材、字幕、プロフィール、会話、復習、工程、費用予約を永続化。保存先は`.local/lab.sqlite`。音声本体はDBに保存しません。
- ローカル版ではWorkers/D1/R2を使わず、PC単体で起動できるアダプターを採用。クラウド移行時のストレージ・本人認証・音声監視の実装とデプロイ検証は別工程です。このNodeサーバーをそのままWorkersへ配置することはできません。
- 検証モードは固定の英語応答・講評・翻訳を返します。実際の製品知識や英語力の評価を装いません。

## 実AIと費用

通常キーはサーバーの環境変数だけに置きます。ブラウザはSDPを本人認証付きサーバーへ渡し、サーバーがOpenAIの統合WebRTCエンドポイントで通話を作ります。APIキー・短期資格情報はブラウザへ返しません。設計の短期資格情報方式に代えて、公式のサーバー仲介方式を使っています。

音声のサーバー側WebSocketで発話とusageを受信。通話ID・未完了処理を永続化し、最大10分、ハートビート90秒切断、終了、背景化、ログアウトでhangupします。停止失敗は状態を保持し、新しい通話を禁止。再起動時も停止を再試行します。作成自体の結果が不明でIDが得られなかった場合は、OpenAI側で終了を確認してから設定の照合操作が必要です。

予算は整数の1/1000円単位、JST暦月で管理。通常のテキスト処理は5円、音声は初期値500円を予約し、確認できたusageだけを確定します。復元通話・進行中の応答・未着の文字起こし・不明なAPI失敗は予約を残します。請求記録を確認した本人が設定から照合できます。並行予約と教材ごとの上限もサーバーで検査します。厳密な請求上限の保証ではありません。

既定モデルはgpt-6-lunaとgpt-realtime-2.1です。Standardの公式モデルページの単価を使い、テキストはreasoning=noneで短い応答に合わせます。旧gpt-4.1-mini・gpt-realtimeも明示的な料金アダプターを持ちます。whisper-1は時刻取得用に残しますが、公式ガイドでは2027-02-26までの経過措置です。それ以後は字幕ファイルの取り込みか、新STTとアラインメントへの移行が必要です。新モデル名だけを環境変数で指定して未知の料金で課金処理を始めることはできません。実利用前に公式の単価とアカウントでの提供状況を確認してください。

参照した公式API：

- [WebRTCの統合接続](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
- [サーバー側制御](https://developers.openai.com/api/docs/guides/voice-server-controls?voice-api=realtime)
- [料金](https://developers.openai.com/api/docs/pricing)
- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) / [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
- [Whisper時刻情報の提供期限](https://developers.openai.com/api/docs/guides/speech-to-text#timestamps)

## 教材CLI

動画URLを音声として自動取得しません。利用可能なローカルファイルをFFmpegで3分ごとに分割し、境界の2秒を重複させます。whisper-1のsegment時刻を元動画の絶対時刻へ変換します。同一文は重複領域の本文照合でまとめ、曖昧な重なりは削除や推測をせず停止します。キャッシュしたSTT結果を確認し、必要なら字幕パッケージを修正して取り込んでください。

入力ハッシュ・区間・処理設定・モデル・辞書からキャッシュを識別します。予算上限は処理結果の識別に含めません。上限変更で完了工程を再実行しません。工程IDを送信前に保存し、結果不明時はサーバーの保存結果を照会します。確認できなければ停止し、`--retry-unknown STEP`の明示指定時のみ新しい試行に進みます。

成功・キャンセル後に一時音声を削除。失敗時は24時間を期限とし、CLIの次回起動時に期限切れ音声を回収します。PC停止中の削除は保証しません。マニフェスト・字幕・翻訳は再開用に残し、キーやパスワードは含めません。通常の音声ファイルはストリーミングでハッシュし、全編をメモリへ読み込みません。

## Modern Web Guidanceの適用

2026-11-17参照。ガイドを依存パッケージとして実行・自動更新しません。

| ガイド | 参照したblob SHA / 適用 |
|---|---|
| [Responsive design](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/css/responsive-design.md) | `201139cc40609b700871e99b5611dd7a3f7ca56d`。Grid、dvh、動画のaspect-ratio、拡大できるrem。 |
| [Form factor adaptation](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/user-experience/form-factor-adaptation.md) | `bdf54c461650548c7282d95810b3a27f15cd044d`。44pxコントロール、safe-area、320pxでの折り返し。 |
| [Natural interactions](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/user-experience/natural-interactions.md) | `805da89460eb2aeabf3b4dbb73f6f74c7d18eab5`。押下・選択・無効・フォーカスの区別。 |
| [Content first](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/user-experience/content-first-noise-reduction.md) | `ff61899f32cccd6c25035f9e000962aab126f6ae`。副次設定をdetailsへ収納、会話操作を維持。 |
| [Accessibility](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/accessibility/accessibility.md) | `00cb44a2b73a9f808a97e60abfff858cd82543d8`。意味のあるHTML、言語、dialog、状態通知、画面遷移のフォーカス。 |
| [Motion](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-behaviors/motion.md) | `b76a9351e2415ecd49efe04ab0b741f40caf34d0`。reduced-motionを尊重。View Transitionsは必須にせず、通常更新を採用。 |
| [Performance](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/performance/performance.md) | `59151f969379bca9f4bc173ee35cb4d2d8c4f43b`。選んだプレイヤーだけ読み込み、字幕80文単位、非表示時停止、バージョン付き静的キャッシュ。 |

Container Queries・Popover・Anchor Positioningを主要操作の前提にせず、Grid・通常パネル・details・dialogで実装。新APIの有無によって学習フローが欠けません。ブラウザの文字選択、コピー、ズームを制限しません。

本番ビルドではweb-vitalsでLCP/INP/CLSと画面・端末・通信条件をローカルAPIに保存します。初期ドキュメントの計測であり、SPA内の全遷移を独立したページ計測とみなしません。75パーセンタイル達成や実機Safariの性能達成は宣言しません。

## 未検証・残る受け入れ確認

実APIキー・利用可能な実教材音声はこの環境に未設定です。実OpenAI音声/STT/翻訳の疎通、実re:Invent動画との500ms以内同期、実費、iPhone Safari実機・VoiceOver、PCのEdge/Safari/Firefox、実測Web Vitalsの目標達成は未検証です。初期教材はAWS Events公式の実動画3件（AI・SRE・データ基盤）、独自作成の字幕操作サンプル1件、公開資料を題材にした会話パック4件、独自フレーズ36件です。実動画のアプリ字幕は未準備で、この環境のYouTube接続制限により実再生も未確認です。[動画の出典と確認範囲](video-catalog.md)を参照してください。公開資料に書かれた詳細製品仕様の取り込み・検証は残っています。

ChatGPT利用枠は未接続と表示し、自動切替しません。クラウド公開も行っていません。これらをローカル検証モードの成功と混同しないでください。
