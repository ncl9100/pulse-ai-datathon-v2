/**
 * GET /api/scan
 *
 * Portfolio scan — returns all 405 projects ranked by margin health.
 * Uses pre-computed data from DuckDB (exported as JSON).
 */
import { NextResponse } from "next/server";
import scanData from "@/data/scan.json";

export async function GET() {
  try {
    const projects = scanData as Record<string, unknown>[];

    // Classify each project by severity
    const classified = projects.map((p) => {
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
        total_at_risk: critical + warning,
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
