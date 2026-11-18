import {
  aiDevelopmentScenario,
  type ConversationScenario,
} from "./scenarios.ts";
export type ConversationPack = {
  id: string;
  title: string;
  topic: string;
  partner: string;
  date: string;
  source: string;
  facts: string[];
  questions: string[];
  scenario?: ConversationScenario;
};
export const packs: ConversationPack[] = [
  {
    id: "networking",
    title: "初対面から技術の話へ",
    topic: "ネットワーキング",
    partner: "会場で出会ったエンジニア",
    date: "2026-11-17",
    source: "",
    facts: ["架空の参加者との会話。製品の仕様は扱わない。"],
    questions: [
      "What are you working on?",
      "What sessions would you recommend?",
    ],
  },
  {
    id: "ai-development",
    title: "AI時代の開発手法を聞く",
    topic: "AI・開発組織",
    partner: "ブースにいる架空の開発チームのエンジニア",
    date: "2026-11-18",
    source: "",
    facts: [
      "会社のサービス紹介から離れて、エンジニア同士で普段の開発の進め方を聞く練習です。",
      "AIの活用範囲、商用ツールと自前基盤、組織体制、役割の変化、品質、導入効果を掘り下げます。",
      "相手のチーム設定は架空です。実在企業の導入状況を示すものではありません。",
    ],
    questions: aiDevelopmentScenario.topics.map((topic) => topic.question),
    scenario: aiDevelopmentScenario,
  },
  {
    id: "confluent",
    title: "Tableflow × Databricks",
    topic: "データ基盤",
    partner: "公開デモを題材にした架空の担当者",
    date: "2026-11-17",
    source:
      "https://www.confluent.io/resources/online-talk/tableflow-databricks-demo/",
    facts: [
      "公式のTableflowとDatabricks連携デモ案内を題材にする。",
      "詳細仕様・価格・最新の出展は未確認。確認できない質問は実ブース用の質問として保存する。",
    ],
    questions: [
      "How would this fit into our existing data platform?",
      "How do you handle schema changes?",
    ],
  },
  {
    id: "databricks",
    title: "複数エージェントの設計",
    topic: "AI",
    partner: "公開デモを題材にした架空の担当者",
    date: "2026-11-17",
    source:
      "https://www.databricks.com/resources/demos/videos/build-multi-agent-genai-system",
    facts: [
      "公式のBuild a Multi-Agent GenAI Systemデモを題材にする。",
      "デモ内容の詳細と価格は未確認。製品機能を即興で断定しない。",
    ],
    questions: [
      "How do you evaluate an agent?",
      "Can I trace the decisions of each agent?",
    ],
  },
  {
    id: "sre",
    title: "障害調査と可観測性",
    topic: "SRE",
    partner: "架空のAWS技術者",
    date: "2026-11-17",
    source: "",
    facts: [
      "一般的なSREの技術相談。実製品の仕様・料金を確認済みとして扱わない。",
    ],
    questions: [
      "How can we reduce alert noise?",
      "What evidence would you look at first?",
    ],
  },
];
const rows = [
  ["空港", "Where is the baggage claim?", "手荷物受取所はどこですか"],
  [
    "空港",
    "Could you help me find my connection?",
    "乗り継ぎ便の場所を教えてください",
  ],
  [
    "入国",
    "I am here to attend a technology conference.",
    "技術カンファレンスへの参加が目的です",
  ],
  ["入国", "I will be staying for one week.", "1週間滞在します"],
  ["ホテル", "I have a reservation under my name.", "予約しています"],
  ["ホテル", "Could I leave my luggage here?", "荷物を預けられますか"],
  ["ホテル", "What time is checkout?", "チェックアウトは何時ですか"],
  [
    "ホテル",
    "The Wi-Fi is not working in my room.",
    "部屋のWi-Fiがつながりません",
  ],
  ["配車", "Where is the rideshare pickup area?", "配車の乗り場はどこですか"],
  [
    "配車",
    "Could you take me to the conference venue?",
    "会場までお願いします",
  ],
  ["飲食", "Could I see the menu, please?", "メニューを見せてください"],
  ["飲食", "Does this contain any nuts?", "ナッツは入っていますか"],
  ["飲食", "Could I get the check, please?", "お会計をお願いします"],
  [
    "会場",
    "Which shuttle should I take to get there?",
    "そこへ行くシャトルはどれですか",
  ],
  ["会場", "Where can I pick up my badge?", "バッジはどこで受け取れますか"],
  ["会場", "Is this the line for the session?", "このセッションの列ですか"],
  ["会場", "Is there a seat available?", "空いている席はありますか"],
  ["質問", "Could you give me a quick demo?", "短いデモを見せてください"],
  ["質問", "What problem does this solve?", "どんな問題を解決しますか"],
  [
    "質問",
    "How would this fit into our existing data platform?",
    "既存のデータ基盤とどう組み合わせられますか",
  ],
  ["質問", "How do you handle schema changes?", "スキーマ変更はどう扱いますか"],
  ["質問", "What are the main limitations?", "主な制約は何ですか"],
  [
    "質問",
    "How can I try this in a small environment?",
    "小さい環境で試すにはどうすればよいですか",
  ],
  [
    "聞き返し",
    "Could you explain the last part again?",
    "最後の部分をもう一度説明してください",
  ],
  [
    "聞き返し",
    "Could you speak a little more slowly?",
    "もう少しゆっくり話してください",
  ],
  [
    "聞き返し",
    "Let me check if I understood that correctly.",
    "理解が正しいか確認させてください",
  ],
  [
    "聞き返し",
    "Do you mean that it runs automatically?",
    "自動的に動くという意味ですか",
  ],
  ["聞き返し", "Could you give me an example?", "例を挙げてもらえますか"],
  [
    "雑談",
    "I work on SRE and data platforms.",
    "SREとデータ基盤を担当しています",
  ],
  [
    "雑談",
    "What brought you to re:Invent?",
    "re:Inventには何を目的に来ましたか",
  ],
  [
    "雑談",
    "Which session did you enjoy the most?",
    "どのセッションが一番よかったですか",
  ],
  [
    "雑談",
    "Would you mind if we connected online?",
    "オンラインでつながってもよいですか",
  ],
  [
    "締め",
    "Thank you. That was really helpful.",
    "ありがとうございます。とても参考になりました",
  ],
  ["締め", "May I ask one more question?", "もう一つ質問してもよいですか"],
  [
    "トラブル",
    "I think I left my phone here.",
    "ここに携帯を忘れたかもしれません",
  ],
  [
    "トラブル",
    "Could you show me where to get help?",
    "問い合わせ先を教えてください",
  ],
];
export const phrases = rows.map(([category, en, ja], i) => ({
  id: `phrase-${i + 1}`,
  category,
  en,
  ja,
}));
export const fixtureCues = [
  {
    cueId: "demo-1",
    startMs: 0,
    endMs: 6000,
    originalText: "Today we will explore how to build reliable AI systems.",
    translation: "今日は、信頼性の高いAIシステムを構築する方法を考えます。",
  },
  {
    cueId: "demo-2",
    startMs: 6000,
    endMs: 12500,
    originalText:
      "Start with a small use case and define what success looks like.",
    translation: "小さなユースケースから始め、成功の基準を定義しましょう。",
  },
  {
    cueId: "demo-3",
    startMs: 12500,
    endMs: 20000,
    originalText:
      "How would you measure the quality of an agent in production?",
    translation: "本番環境のエージェントの品質をどう測りますか？",
  },
];
