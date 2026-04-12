/**
 * GET /api/projects?id=PRJ-2021-260
 *
 * Returns detailed data for a single project — the agent uses this
 * to drill into a flagged project for root cause reasoning.
 * Includes: contract info, SOV line breakdown, labor/material per SOV line,
 * change orders, RFIs, and billing history.
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("id");

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing required parameter: id" },
      { status: 400 }
    );
  }

  try {
    // 1. Project health overview
    const [health] = await query(
      `SELECT * FROM project_health WHERE project_id = '${projectId}'`
    );
    if (!health) {
      return NextResponse.json(
        { error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    // 2. SOV line breakdown with budget vs actual
    const sovLines = await query(`
      SELECT
        s.sov_line_id,
        s.line_number,
        s.description,
        s.scheduled_value,
        sb.estimated_labor_cost,
        sb.estimated_material_cost,
        sb.estimated_labor_hours,
        sb.productivity_factor,
        COALESCE(ls.actual_labor_cost, 0) AS actual_labor_cost,
        COALESCE(ls.total_hours, 0) AS actual_labor_hours,
        COALESCE(ms.actual_material_cost, 0) AS actual_material_cost,
        COALESCE(ls.actual_labor_cost, 0) - sb.estimated_labor_cost AS labor_variance,
        COALESCE(ms.actual_material_cost, 0) - sb.estimated_material_cost AS material_variance
      FROM sov s
      JOIN sov_budget sb ON s.sov_line_id = sb.sov_line_id
      LEFT JOIN labor_summary ls ON s.sov_line_id = ls.sov_line_id
      LEFT JOIN material_summary ms ON s.sov_line_id = ms.sov_line_id
      WHERE s.project_id = '${projectId}'
      ORDER BY s.line_number
    `);

    // 3. Change orders
    const changeOrders = await query(`
      SELECT
        co_number, date_submitted, reason_category, description,
        amount, status, related_rfi, labor_hours_impact,
        schedule_impact_days, submitted_by, approved_by
      FROM change_orders
      WHERE project_id = '${projectId}'
      ORDER BY date_submitted
    `);

    // 4. RFIs (summary — count by priority and status)
    const rfis = await query(`
      SELECT
        priority, status, COUNT(*) AS count,
        SUM(CASE WHEN cost_impact THEN 1 ELSE 0 END) AS with_cost_impact,
        SUM(CASE WHEN schedule_impact THEN 1 ELSE 0 END) AS with_schedule_impact
      FROM rfis
      WHERE project_id = '${projectId}'
      GROUP BY priority, status
      ORDER BY priority, status
    `);

    // 5. Billing history
    const billing = await query(`
      SELECT
        application_number, period_end, period_total,
        cumulative_billed, retention_held, net_payment_due,
        status, payment_date
      FROM billing_history
      WHERE project_id = '${projectId}'
      ORDER BY application_number
    `);

    // 6. Recent field notes (last 20, for agent to scan for themes)
    const fieldNotes = await query(`
      SELECT date, author, note_type, content
      FROM field_notes
      WHERE project_id = '${projectId}'
      ORDER BY date DESC
      LIMIT 20
    `);

    return NextResponse.json({
      health,
      sov_lines: sovLines,
      change_orders: changeOrders,
      rfis,
      billing,
      field_notes: fieldNotes,
    });
  } catch (error) {
    console.error("Project detail error:", error);
    return NextResponse.json(
      { error: "Failed to load project details" },
      { status: 500 }
    );
  }
}
