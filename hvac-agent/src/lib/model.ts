/**
 * Single source of truth for the Claude model used by every API route.
 * Override with ANTHROPIC_MODEL in Vercel env vars when models change,
 * so a retired model ID never requires a code change again.
 */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
