# 初期YouTube教材

AWS Events公式チャンネルの英語セッションを3本登録しています。内容は各開催年時点のものです。難易度・日本語の紹介文はこのアプリによる学習用の目安です。

| 分野       | 開催年・セッション                                                    | 公式動画                                                        |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| AI         | 2025 AIM3305 — Amazon BedrockとAIプラットフォーム                     | [AWS Eventsで視聴](https://www.youtube.com/watch?v=b0qdrFi7MCw) |
| SRE        | 2024 ANT341 — OpenSearchの監視・セキュリティ・ログ分析                | [AWS Eventsで視聴](https://www.youtube.com/watch?v=l5SdPKqOLHU) |
| データ基盤 | 2024 AIM244 — Icebergの統合分析基盤（Clouderaのパートナーセッション） | [AWS Eventsで視聴](https://www.youtube.com/watch?v=Hohe5lcfU1E) |

動画はYouTubeのプライバシー強化モードの公式埋め込みプレイヤーで配信し、アプリには保存しません。URL登録・起動・視聴で音声取得やSTT・翻訳は開始しません。アプリで同期表示する英日字幕は別途取り込みが必要です。YouTube内の字幕は動画側の提供状況に従います。

埋め込み不可・削除・地域制限・通信エラー時は画面上部の「YouTubeで開く」から元動画へ移動できます。アプリの補助操作が読み込めなくても、iframe内の標準操作を利用できます。

## 確認範囲

2026-11-17に検索結果から公式投稿者・タイトル・公開年・概要を確認しました。この開発環境ではYouTubeへの直接通信がプロキシの403になり、検索サービス経由のoEmbed取得も制限されたため、実ストリームの再生成功・地域別の埋め込み可否は未確認です。公式動画の公開状態や埋め込み設定は変更される可能性があります。

ブラウザ回帰テストではYouTube APIを模擬し、公式iframe URL、埋め込み元origin、初回リクエストのReferer、再生・シーク操作、エラー時の元動画リンク、320px幅で200px以上のプレイヤー領域を確認します。これは実動画の再生確認とは分けて扱います。

埋め込み元の情報を送る設定は[YouTubeの公式要件](https://developers.google.com/youtube/terms/required-minimum-functionality)に従い、`strict-origin-when-cross-origin`をiframeと配信HTMLに指定しています。
