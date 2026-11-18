export type ConversationScenario = {
  mode: string;
  goal: string;
  opening: string;
  confirmation: string;
  background: string;
  topics: {
    label: string;
    question: string;
    followUp: string;
    keywords: string[];
    reply: string;
    example: string;
  }[];
};

export const aiDevelopmentScenario: ConversationScenario = {
  mode: "エンジニアとの情報交換",
  goal: "AIの活用範囲・開発基盤・組織や役割の変化を聞き、具体例を1つ掘り下げて、自分の理解を確認する",
  opening:
    "I'm curious about how your team builds software with AI. Would you mind if I asked a few questions about your development process?",
  confirmation:
    "So, if I understood correctly, AI helps with implementation, but engineers still own the decisions. Is that right?",
  background:
    "Fictional team for role-play, not facts about any real company: four cross-functional product teams and a two-person platform group. Engineers use commercial AI assistants for coding, tests and documentation. A thin internal platform provides repository context and CI integration. Product teams own delivery; the platform group supports shared tooling. Humans own requirements, design, code review, security and release decisions. Roles emphasize problem framing and validation, not automatic headcount cuts. No particular vendor, including Factory, is assumed to be adopted. Discuss only this fictional setup and examples consistent with it.",
  topics: [
    {
      label: "AIをどこまで取り入れているか",
      question: "How much of your software development process uses AI today?",
      followUp:
        "Could you walk me through a recent change, from the initial idea to deployment?",
      keywords: [
        "how much",
        "how widely",
        "where do",
        "どのくらい",
        "取り入",
        "活用範囲",
        "導入範囲",
      ],
      reply:
        "Most engineers on our fictional team use AI daily for coding, tests, and documentation. We also use it to explore design options. Engineers still define the problem, review changes, and decide what ships. Adoption varies by task; we don't measure it simply as the percentage of code generated.",
      example:
        "For a small API change, an engineer writes the acceptance criteria, asks AI for a draft and test cases, then checks both. CI runs the tests. A teammate reviews the change, and a human approves deployment. AI helps with the work, but it doesn't own the release.",
    },
    {
      label: "商用ツールと自前の開発基盤",
      question:
        "Do you use tools like Factory, or have you built your own internal platform?",
      followUp: "What does your internal platform add, and who maintains it?",
      keywords: [
        "factory",
        "platform",
        "in-house",
        "in house",
        "internal",
        "tool",
        "maintain",
        "基盤",
        "基板",
        "ツール",
        "自前",
        "内製",
      ],
      reply:
        "We use commercial AI assistants with a thin internal platform on top. Our own layer supplies repository context and connects the workflow to CI. Two platform engineers maintain it. We haven't built our own model, and we're not assuming a particular vendor for this practice scenario.",
      example:
        "When an engineer starts a change, our platform provides relevant repository guidance and links to CI results. The shared layer standardizes that context. Product teams choose how to use the assistant, while the platform group maintains the integration and gathers feedback.",
    },
    {
      label: "組織体制と導入の進め方",
      question:
        "How is your engineering organization structured, and who drives AI adoption?",
      followUp: "How do your product teams and platform team divide the work?",
      keywords: [
        "organiz",
        "organis",
        "structure",
        "adoption",
        "headcount",
        "組織",
        "体制",
        "人数",
        "導入を",
      ],
      reply:
        "We have four cross-functional product teams and a small platform group. Product teams own their services and delivery. The platform group supports shared AI tooling. Engineers in each team try new workflows and share what works, rather than having a separate AI team write everyone's code.",
      example:
        "A product team might test AI-assisted migration work on one repository. The platform group helps with access and tooling. The team reports review effort and defects as well as time saved, then other teams decide whether the workflow fits their work.",
    },
    {
      label: "エンジニアの役割・必要なスキル",
      question: "How have engineers' roles changed as you've adopted AI?",
      followUp: "What do senior and junior engineers spend more time on now?",
      keywords: [
        "role",
        "senior",
        "junior",
        "responsib",
        "skill",
        "役割",
        "スキル",
        "若手",
        "シニア",
        "責任",
      ],
      reply:
        "Engineers spend more time framing problems, making design decisions, and validating generated changes. Senior engineers coach those decisions; junior engineers still need to understand and explain the code they submit. We haven't treated AI adoption as a reason to remove ownership or automatically reduce headcount.",
      example:
        "In a review, a junior engineer explains why a generated change is correct and which tests could disprove it. A senior engineer focuses on design and failure modes. The assistant can propose alternatives, but the people submitting and reviewing the change remain responsible.",
    },
    {
      label: "レビュー・品質・セキュリティ",
      question: "How do you review and validate AI-generated changes?",
      followUp:
        "Which decisions still require a human, and how do you handle sensitive code?",
      keywords: [
        "review",
        "validat",
        "test",
        "quality",
        "security",
        "sensitive",
        "品質",
        "レビュー",
        "テスト",
        "安全",
        "セキュリティ",
        "機密",
      ],
      reply:
        "AI-generated changes go through the same tests and human review as other changes. Engineers check the assumptions behind generated tests, not just whether they pass. Security-sensitive changes need specialist review. We only send code to tools approved for that repository, and humans approve releases.",
      example:
        "For an authentication change, we ask what could bypass the checks, add negative tests, and have a security reviewer inspect the design. An AI-generated test suite can miss the same assumption as the generated code, so passing tests alone isn't enough.",
    },
    {
      label: "効果の測り方と、うまくいかなかったこと",
      question:
        "How do you measure whether AI is actually improving development?",
      followUp: "What hasn't worked well, and what would you do differently?",
      keywords: [
        "measure",
        "metric",
        "improv",
        "worked",
        "working",
        "bottleneck",
        "challenge",
        "differently",
        "効果",
        "指標",
        "失敗",
        "課題",
        "うまく",
      ],
      reply:
        "We look at delivery lead time, review effort, and defects after release, not just lines of code. Routine work can get faster, but larger generated changes sometimes increase review effort. We compare similar tasks and collect feedback before rolling out a workflow more broadly.",
      example:
        "Large generated pull requests were hard to review, so we switched to smaller changes with explicit acceptance criteria. We now ask whether total delivery time improved without adding defects or review burden. We don't have a reliable single productivity percentage to quote.",
    },
  ],
};
