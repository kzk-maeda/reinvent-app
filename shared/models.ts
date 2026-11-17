// USD per million tokens. Model pages and pricing checked on 2026-11-17.
export const DEFAULT_TEXT_MODEL = "gpt-6-luna";
export const DEFAULT_VOICE_MODEL = "gpt-realtime-2.1";
export const textRates: Record<
  string,
  { input: number; cached: number; output: number; reasoning?: boolean }
> = {
  "gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5, reasoning: true },
  "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
};
export const voiceRates: Record<
  string,
  {
    textInput: number;
    textOutput: number;
    audioInput: number;
    audioOutput: number;
  }
> = {
  "gpt-realtime-2.1": {
    textInput: 4,
    textOutput: 24,
    audioInput: 32,
    audioOutput: 64,
  },
  "gpt-realtime": {
    textInput: 4,
    textOutput: 16,
    audioInput: 32,
    audioOutput: 64,
  },
};
