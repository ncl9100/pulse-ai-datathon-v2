/**
 * GET /api/scan
 *
 * Portfolio scan — returns all 405 projects ranked by margin health.
 * This is the "autonomous portfolio scan" the agent runs first.
 * Returns project_health data sorted by realized margin (worst first).
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const projects = await query(`
      SELECT
        project_id,
        project_name,
        original_contract_value,
        adjusted_contract_value,
        actual_total_cost,
        actual_labor_cost,
        actual_material_cost,
        budgeted_labor_cost,
        budgeted_material_cost,
        total_estimated_budget,
        labor_variance,
        material_variance,
        total_variance,
        budget_coverage_pct,
        billing_gap_pct,
        realized_margin_pct,
        approved_co_value,
        pending_co_value,
        cumulative_billed,
        retention_held,
        avg_pct_complete,
        gc_name,
        contract_date,
        substantial_completion_date
      FROM project_health
      ORDER BY realized_margin_pct ASC
    `);

    // Classify each project by severity
    const classified = projects.map((p: Record<string, unknown>) => {
      const margin = p.realized_margin_pct as number;
      let severity: string;
      if (margin < 0) severity = "CRITICAL";
      else if (margin < 8) severity = "WARNING";
      else if (margin < 12) severity = "WATCH";
      else severity = "HEALTHY";

      return { ...p, severity };
    });

    // Portfolio-level stats
    const critical = classified.filter((p) => p.severity === "CRITICAL").length;
    const warning = classified.filter((p) => p.severity === "WARNING").length;
    const totalAtRisk = critical + warning;
    const totalVariance = classified.reduce(
      (sum, p) => sum + (p.total_variance as number),
      0
    );
    const avgMargin =
      classified.reduce(
        (sum, p) => sum + (p.realized_margin_pct as number),
        0
      ) / classified.length;

    return NextResponse.json({
      portfolio_summary: {
        total_projects: classified.length,
        critical_count: critical,
        warning_count: warning,
        total_at_risk: totalAtRisk,
        total_portfolio_variance: Math.round(totalVariance),
        average_realized_margin_pct: Math.round(avgMargin * 100) / 100,
      },
      projects: classified,
    });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json(
      { error: "Failed to scan portfolio" },
      { status: 500 }
    );
  }
}
