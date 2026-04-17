/**
 * Re-export generateText as the primary tool-loop entry point.
 *
 * Previously wrapped Vercel AI SDK's ToolLoopAgent, but that was a thin
 * wrapper around generateText with no meaningful extras. Using generateText
 * directly is simpler and avoids caching agent instances.
 */
export { generateText, stepCountIs } from 'ai'
export type { LanguageModel, Tool, StepResult } from 'ai'
