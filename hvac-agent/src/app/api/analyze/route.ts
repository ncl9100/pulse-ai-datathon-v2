/**
 * POST /api/analyze
 *
 * The agent's brain — sends project data to Claude for root cause
 * reasoning and recovery recommendations.
 *
 * Request body: { projectId: string }
 * Response: Claude's structured analysis with root causes and actions.
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/model";
import fs from "fs";
import path from "path";

const SYSTEM_PROMPT = `You are a CFO agent analyzing HVAC project margins. You receive structured project data and must:

1. Identify the severity of margin erosion on this project
2. Explain the root causes by analyzing:
   - Which SOV lines have the worst variance (actual vs budget)
   - Whether labor or materials are the primary driver
   - Change order status (approved, pending, rejected) and whether pending COs represent uncaptured revenue
   - Billing gaps — is there completed work that hasn't been billed?
   - Field note signals — mentions of rework, delays, scope changes, waiting on GC
3. Provide specific, dollar-quantified recovery actions the CFO can act on immediately

Format your response as structured JSON with this schema:
{
  "project_id": "string",
  "severity": "CRITICAL | WARNING | WATCH",
  "realized_margin_pct": number,
  "summary": "One sentence executive summary",
  "root_causes": [
    {
      "category": "Labor | Material | Change Orders | Billing | Schedule",
      "description": "Plain English explanation",
      "actual": number,
      "budgeted": number,
      "variance": number
    }
  ],
  "recovery_actions": [
    {
      "priority": 1,
      "action": "Specific action to take",
      "estimated_recovery": number,
      "rationale": "Why this action and how the dollar amount was calculated"
    }
  ],
  "field_note_signals": ["Key themes found in field notes"]
}

Be specific. Use actual dollar amounts from the data. Do not say "investigate further" — say exactly what to do.`;

function loadProjectData(projectId: string): Record<string, unknown> | null {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "projects", `${projectId}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required field: projectId" },
        { status: 400 }
      );
    }

    const data = loadProjectData(projectId);
    if (!data) {
      return NextResponse.json(
        { error: `Project ${projectId} not found or no pre-computed data available` },
        { status: 404 }
      );
    }

    const dataPackage = JSON.stringify(data, null, 2);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this HVAC project for margin erosion. Provide root causes and specific dollar-quantified recovery actions.\n\n${dataPackage}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const responseText = textBlock ? textBlock.text : "";

    let analysis;
    try {
      const jsonMatch = responseText.match(/```json?\s*([\s\S]*?)```/) ||
        responseText.match(/(\{[\s\S]*\})/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);
    } catch {
      analysis = { raw_response: responseText };
    }

    return NextResponse.json({
      project_id: projectId,
      analysis,
      tokens_used: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json(
      { error: "Failed to analyze project" },
      { status: 500 }
    );
  }
}
