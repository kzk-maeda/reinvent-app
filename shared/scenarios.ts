export type ConversationScenario = {
  mode: string;
  goal: string;
  opening: string;
  confirmation: string;
  booth?: {
    engineer: string;
    product: string;
    introduction: string;
    confirmationReply: string;
  };
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

export const productDevelopmentPackId = "product-development-booth";

export const productDevelopmentScenario: ConversationScenario = {
  mode: "エンジニアとの情報交換",
  goal: "製品を一言で紹介してもらい、開発の流れ、チームの規模と責任範囲、チームと個人が追う指標を聞く",
  opening:
    "What does SyncRelay do? I'd also love to hear how your team builds it.",
  confirmation:
    "So delivery speed and reliability are team measures, but you have an individual goal for alert noise. Did I get that right?",
  booth: {
    engineer: "Maya",
    product: "SyncRelay",
    introduction:
      "I'm Maya, a backend engineer on SyncRelay. It monitors scheduled data syncs and alerts teams when they fail. I own part of the connector runtime. Happy to talk about how we build it.",
    confirmationReply:
      "Exactly. The team owns delivery and reliability together. Reducing duplicate alerts is one improvement I own this quarter, and I work with the team to ship and measure it.",
  },
  background: [
    "Fictional conference booth for SyncRelay, a product that monitors scheduled data syncs and alerts teams about failures. Maya is a backend engineer working on the connector runtime.",
    "Maya's product squad has five engineers, one product manager and one designer. It owns the runtime from design and delivery through on-call. A separate platform team owns shared build, test and rollout tooling.",
    "The workflow is software-factory style: start with acceptance criteria, create a small change, run CI tests, get human review and roll out to a small group before releasing broadly. AI can draft code and tests. Engineers verify the work and approve the rollout. There is no assumed adoption of the commercial product Factory.",
    "Team KPIs include change lead time and change failure rate. The product team's reliability target is 99.9% of scheduled syncs starting on time each month. Speed is discussed alongside reliability and customer impact.",
    "Maya's individual quarterly goal is to reduce duplicate alerts per 1,000 syncs by 25%. That is a goal, not an achieved result. Performance conversations use evidence of impact, ownership and collaboration. Team delivery metrics are not used to rank individuals.",
    "Example: for connector retries, engineers specified expected behavior and retry limits, used AI to draft a test, checked it in CI, got peer review, and monitored launch on a small set of connectors before scaling out.",
  ].join(" "),
  topics: [
    {
      label: "開発基盤とリリースまでの流れ",
      question:
        "Do you have a software factory that takes a change from a spec to production?",
      followUp:
        "Could you walk me through a recent change and show me where AI and people each come in?",
      keywords: [
        "factory",
        "release pipeline",
        "workflow",
        "internal platform",
        "ai platform",
        "spec to",
        "how do you develop",
        "how do you build",
        "build it",
        "build this",
        "作り方",
        "開発基盤",
        "自前",
        "内製",
        "ファクトリー",
      ],
      reply:
        "We use our own shared workflow, much like a software factory. We write acceptance criteria, make a small change, run CI, get a human review, and roll it out to a small group first. AI helps draft code and tests, but engineers approve what ships.",
      example:
        "For a connector retry change, we agreed on retry limits first. AI drafted a test, and I checked that it covered the failure I cared about. A teammate reviewed the change. Then we watched a small batch of connectors in production before rolling it out further.",
    },
    {
      label: "チームと個人の指標の違い",
      question:
        "What do you measure at the team level versus the individual level?",
      followUp:
        "Could you give me one target for your team and one goal you own personally?",
      keywords: [
        "team and individual",
        "teams and individual",
        "team vs individual",
        "team versus individual",
        "team level versus",
        "team-level vs",
        "team and personal",
        "チームと個人",
        "チーム・個人",
      ],
      reply:
        "As a team, we track delivery lead time, change failures and whether syncs start on time. As an individual, I own outcomes I can influence. This quarter my goal is to cut duplicate alerts per thousand syncs by 25%. We use team metrics to improve the system together.",
      example:
        "As a team, we aim for 99.9% of scheduled syncs to start on time each month. My own goal is to cut duplicate alerts per thousand syncs by 25% this quarter. I own the work, and the team helps review the design and check for regressions.",
    },
    {
      label: "個人の目標と評価",
      question: "What goals do you own as an individual engineer?",
      followUp: "How do you show that your work had an impact?",
      keywords: [
        "individual",
        "personally",
        "personal goal",
        "performance review",
        "evaluated",
        "your own goal",
        "個人",
        "人事評価",
        "自分の目標",
      ],
      reply:
        "My quarterly goal is to reduce duplicate alerts per thousand syncs by 25%. In reviews, I explain the customer impact, what I owned, and how I helped teammates. My performance isn't a count of pull requests.",
      example:
        "For alert noise, I compare duplicates per thousand syncs before and after the rollout, so more traffic doesn't skew the result. I also check that we're still catching real failures. I bring both measures and feedback from on-call to my review.",
    },
    {
      label: "チームのKPIと判断",
      question: "Which KPIs do you track as a team?",
      followUp:
        "What do you do if delivery gets faster but changes fail more often?",
      keywords: [
        "kpi",
        "metric",
        "measure",
        "lead time",
        "failure rate",
        "reliability target",
        "指標",
        "チームの目標",
      ],
      reply:
        "We track change lead time and change failure rate together. For product reliability, we aim for 99.9% of scheduled syncs to start on time each month. We look at these as a team when deciding whether to speed up delivery or invest in reliability.",
      example:
        "If lead time falls but failures rise, we look at recent changes and see where they went wrong. We might make releases smaller or add a check to the rollout. Faster delivery only helps if the service remains reliable.",
    },
    {
      label: "チームの人数と責任範囲",
      question:
        "How big is the team that owns this product, and what does it own?",
      followUp:
        "What do you own as a squad, and what does your platform team handle?",
      keywords: [
        "how big",
        "how many engineers",
        "how many people",
        "team size",
        "team structure",
        "squad",
        "ownership",
        "on-call",
        "人数",
        "規模",
        "体制",
        "責任範囲",
      ],
      reply:
        "Our squad has five engineers, one product manager, and one designer. We own the connector runtime from design through delivery and on-call. A separate platform team maintains the shared tooling.",
      example:
        "Our squad decides how connector retries should work and is on call for the runtime. The platform team maintains the shared CI and rollout tooling. We can change our service independently as long as we meet the common release checks.",
    },
  ],
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
        "Most engineers on our team use AI daily for coding, tests, and documentation. We also use it to explore design options. Engineers still define the problem, review changes, and decide what ships. Adoption varies by task; we don't measure it simply as the percentage of code generated.",
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
        "We use commercial AI assistants with a thin internal platform on top. Our own layer supplies repository context and connects the workflow to CI. Two platform engineers maintain it. We haven't built our own model; our focus is integration and shared context.",
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
