/**
 * GET /api/test-claude
 * Simple test to verify Claude API works on Vercel
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set", keyLength: 0 });
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [{ role: "user", content: "Say hello in exactly 5 words." }],
    });

    const textBlock = message.content.find((b) => b.type === "text");

    return NextResponse.json({
      success: true,
      response: textBlock?.text,
      keyPrefix: apiKey.substring(0, 10) + "...",
      tokens: message.usage,
    });
  } catch (error: unknown) {
    const err = error as Error & { status?: number; message?: string };
    return NextResponse.json({
      success: false,
      error: err.message,
      status: err.status,
      keyPrefix: apiKey.substring(0, 10) + "...",
    });
  }
}
