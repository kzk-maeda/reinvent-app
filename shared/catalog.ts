import type { Material } from "./domain.ts";

// Official AWS Events uploads. App subtitles are prepared separately from the
// embedded player; never attach the independent demo cues to these videos.
export const curatedMaterials: Material[] = [
  {
    id: "aws-2025-aim3305",
    title: "Powering AI and agentic platforms with Amazon Bedrock (AIM3305)",
    topic: "AI",
    url: "https://www.youtube.com/watch?v=b0qdrFi7MCw",
    youtubeId: "b0qdrFi7MCw",
    publisher: "AWS Events",
    year: 2025,
    difficulty: "中級〜上級",
    reason:
      "Amazon BedrockとVercelの事例から、AIを本番環境で運用する説明や技術用語を聞く練習に。",
    status: "awaiting_source",
    offsetMs: 0,
    positionMs: 0,
  },
  {
    id: "aws-2024-ant341",
    title:
      "Enhance performance with observability, security, and log analytics (ANT341)",
    topic: "SRE",
    url: "https://www.youtube.com/watch?v=l5SdPKqOLHU",
    youtubeId: "l5SdPKqOLHU",
    publisher: "AWS Events",
    year: 2024,
    difficulty: "中級〜上級",
    reason:
      "Amazon OpenSearch Serviceの監視・ログ分析を題材に、信頼性や障害対応の説明を聞く練習に。",
    status: "awaiting_source",
    offsetMs: 0,
    positionMs: 0,
  },
  {
    id: "aws-2024-aim244",
    title:
      "Real-world success: Unified architecture for analytics with Iceberg (AIM244)",
    topic: "データ基盤",
    url: "https://www.youtube.com/watch?v=Hohe5lcfU1E",
    youtubeId: "Hohe5lcfU1E",
    publisher: "AWS Events",
    year: 2024,
    difficulty: "中級〜上級",
    reason:
      "ClouderaによるApache Icebergの事例から、データ管理や構成の説明を聞く練習に。AWSパートナーセッション。",
    status: "awaiting_source",
    offsetMs: 0,
    positionMs: 0,
  },
];
