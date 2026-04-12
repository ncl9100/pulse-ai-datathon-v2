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
import { query } from "@/lib/db";

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

export async function POST(request: Request) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required field: projectId" },
        { status: 400 }
      );
    }

    // Gather all project data for Claude
    const [health] = await query(
      `SELECT * FROM project_health WHERE project_id = '${projectId}'`
    );
    if (!health) {
      return NextResponse.json(
        { error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    const sovLines = await query(`
      SELECT
        s.sov_line_id, s.description, s.scheduled_value,
        sb.estimated_labor_cost, sb.estimated_material_cost,
        sb.estimated_labor_hours, sb.key_assumptions,
        COALESCE(ls.actual_labor_cost, 0) AS actual_labor_cost,
        COALESCE(ls.total_hours, 0) AS actual_hours,
        COALESCE(ms.actual_material_cost, 0) AS actual_material_cost,
        COALESCE(ls.actual_labor_cost, 0) - sb.estimated_labor_cost AS labor_variance,
        COALESCE(ms.actual_material_cost, 0) - sb.estimated_material_cost AS material_variance
      FROM sov s
      JOIN sov_budget sb ON s.sov_line_id = sb.sov_line_id
      LEFT JOIN labor_summary ls ON s.sov_line_id = ls.sov_line_id
      LEFT JOIN material_summary ms ON s.sov_line_id = ms.sov_line_id
      WHERE s.project_id = '${projectId}'
      ORDER BY (COALESCE(ls.actual_labor_cost, 0) - sb.estimated_labor_cost) DESC
    `);

    const changeOrders = await query(`
      SELECT co_number, reason_category, description, amount, status,
             labor_hours_impact, schedule_impact_days
      FROM change_orders
      WHERE project_id = '${projectId}'
      ORDER BY amount DESC
    `);

    const billing = await query(`
      SELECT application_number, period_end, cumulative_billed,
             retention_held, status
      FROM billing_history
      WHERE project_id = '${projectId}'
      ORDER BY application_number DESC
      LIMIT 5
    `);

    const fieldNotes = await query(`
      SELECT date, author, note_type, content
      FROM field_notes
      WHERE project_id = '${projectId}'
      ORDER BY date DESC
      LIMIT 30
    `);

    // Build the data package for Claude
    const dataPackage = JSON.stringify(
      { health, sov_lines: sovLines, change_orders: changeOrders, billing, field_notes: fieldNotes },
      null,
      2
    );

    // Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this HVAC project for margin erosion. Provide root causes and specific dollar-quantified recovery actions.\n\n${dataPackage}`,
        },
      ],
    });

    // Extract the text response
    const textBlock = message.content.find((block) => block.type === "text");
    const responseText = textBlock ? textBlock.text : "";

    // Try to parse as JSON (Claude should return structured JSON)
    let analysis;
    try {
      // Extract JSON from possible markdown code blocks
      const jsonMatch = responseText.match(/```json?\s*([\s\S]*?)```/) ||
        responseText.match(/(\{[\s\S]*\})/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);
    } catch {
      // If JSON parsing fails, return the raw text
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
