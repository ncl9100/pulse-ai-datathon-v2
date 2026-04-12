/**
 * GET /api/briefing
 *
 * The autonomous agent endpoint — runs the full pipeline unprompted:
 *
 *   1. Scans all 405 projects, classifies by sector
 *   2. Determines active vs completed status
 *   3. Flags at-risk projects, ranked by DOLLAR EXPOSURE (not just %)
 *   4. Extracts field note themes for flagged projects
 *   5. Forecasts final margin for active projects
 *   6. Sends each flagged project to Claude for root cause reasoning
 *   7. Runs a separate portfolio-level pattern analysis
 *   8. Returns a complete CFO briefing
 *
 * Query params:
 *   ?limit=5  — number of worst projects to deep-analyze (default: 5)
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";

// ── Sector classification from project names ───────────────────────────
function classifySector(projectName: string): string {
  const name = projectName.toLowerCase();
  if (
    name.includes("hospital") ||
    name.includes("medical") ||
    name.includes("surgery")
  )
    return "Healthcare";
  if (
    name.includes("school") ||
    name.includes("elementary") ||
    name.includes("middle school") ||
    name.includes("high school")
  )
    return "K-12 Education";
  if (
    name.includes("data center") ||
    name.includes("colocation") ||
    name.includes("cloud campus") ||
    name.includes("edge data") ||
    name.includes("thermal management")
  )
    return "Data Center";
  if (
    name.includes("office") ||
    name.includes("corporate") ||
    name.includes("business center")
  )
    return "Commercial Office";
  if (
    name.includes("apartment") ||
    name.includes("residential") ||
    name.includes("housing") ||
    name.includes("senior living") ||
    name.includes("condominium") ||
    name.includes("mixed-income")
  )
    return "Multifamily Residential";
  if (name.includes("mixed-use") || name.includes("tower"))
    return "Mixed-Use";
  return "Other";
}

// Sector-aware erosion thresholds — Healthcare and Data Center have
// legitimate overhead, so we use more lenient thresholds
function getSectorThreshold(sector: string): {
  critical: number;
  warning: number;
} {
  switch (sector) {
    case "Healthcare":
      return { critical: -5, warning: 5 };
    case "Data Center":
      return { critical: -3, warning: 5 };
    case "K-12 Education":
      return { critical: 2, warning: 8 };
    case "Multifamily Residential":
      return { critical: 2, warning: 8 };
    default:
      return { critical: 0, warning: 8 };
  }
}

// ── Field note theme extraction ────────────────────────────────────────
const THEME_KEYWORDS: Record<string, string[]> = {
  delays: [
    "delay",
    "delayed",
    "waiting",
    "held up",
    "behind schedule",
    "slipped",
    "pushed back",
  ],
  rework: [
    "rework",
    "redo",
    "tear out",
    "remove and replace",
    "failed inspection",
    "rejected",
  ],
  scope_creep: [
    "additional work",
    "extra work",
    "not in scope",
    "owner-directed",
    "added scope",
    "beyond original",
  ],
  gc_issues: [
    "waiting on GC",
    "GC delay",
    "no response",
    "coordination issue",
    "RFI pending",
  ],
  labor_issues: [
    "short-staffed",
    "understaffed",
    "overtime",
    "crew shortage",
    "manpower",
    "additional crew",
  ],
  material_issues: [
    "backorder",
    "late delivery",
    "wrong material",
    "damaged shipment",
    "substitution",
  ],
};

interface ThemeCounts {
  [theme: string]: { count: number; sample_notes: string[] };
}

async function extractFieldNoteThemes(
  projectId: string
): Promise<ThemeCounts> {
  const notes = await query<{ content: string; date: string }>(`
    SELECT content, date FROM field_notes
    WHERE project_id = '${projectId}'
    ORDER BY date DESC
  `);

  const themes: ThemeCounts = {};
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    const matches: string[] = [];
    for (const note of notes) {
      const lower = (note.content || "").toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        matches.push(`[${note.date}] ${note.content}`);
      }
    }
    if (matches.length > 0) {
      themes[theme] = {
        count: matches.length,
        sample_notes: matches.slice(0, 3),
      };
    }
  }
  return themes;
}

// ── Project data gathering ─────────────────────────────────────────────
async function gatherProjectData(projectId: string) {
  const [health] = await query(
    `SELECT * FROM project_health WHERE project_id = '${projectId}'`
  );

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
    ORDER BY ABS(COALESCE(ls.actual_labor_cost, 0) - sb.estimated_labor_cost) DESC
  `);

  const changeOrders = await query(`
    SELECT co_number, date_submitted, reason_category, description,
           amount, status, labor_hours_impact, schedule_impact_days
    FROM change_orders
    WHERE project_id = '${projectId}'
    ORDER BY amount DESC
  `);

  const billing = await query(`
    SELECT application_number, period_end, cumulative_billed,
           retention_held, status, payment_date
    FROM billing_history
    WHERE project_id = '${projectId}'
    ORDER BY application_number DESC
    LIMIT 5
  `);

  const [pendingCOs] = await query<{ total: number; count: number }>(`
    SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM change_orders
    WHERE project_id = '${projectId}' AND status = 'Pending'
  `);

  const billingGaps = await query(`
    SELECT
      bli.sov_line_id,
      s.description,
      bli.pct_complete,
      ROUND(bli.total_billed * 100.0 / NULLIF(bli.scheduled_value, 0), 2) AS pct_billed,
      bli.pct_complete - ROUND(bli.total_billed * 100.0 / NULLIF(bli.scheduled_value, 0), 2) AS gap,
      bli.balance_to_finish
    FROM billing_line_items bli
    JOIN sov s ON bli.sov_line_id = s.sov_line_id
    WHERE bli.project_id = '${projectId}'
      AND bli.application_number = (
        SELECT MAX(application_number) FROM billing_history WHERE project_id = '${projectId}'
      )
      AND bli.pct_complete IS NOT NULL
      AND bli.pct_complete > ROUND(bli.total_billed * 100.0 / NULLIF(bli.scheduled_value, 0), 2) + 5
    ORDER BY bli.balance_to_finish DESC
  `);

  return {
    health,
    sov_lines: sovLines,
    change_orders: changeOrders,
    billing,
    pending_cos: pendingCOs,
    billing_gaps: billingGaps,
  };
}

// ── Margin forecasting for active projects ─────────────────────────────
function forecastMargin(health: Record<string, unknown>): {
  forecast_margin_pct: number;
  forecast_total_cost: number;
  confidence: string;
} | null {
  const pctComplete = health.avg_pct_complete as number;
  const actualCost = health.actual_total_cost as number;
  const contractValue = health.adjusted_contract_value as number;

  // Only forecast for active projects with meaningful progress
  if (pctComplete <= 10 || pctComplete >= 95) return null;

  // Linear projection: if we've spent X at Y% complete, total = X / (Y/100)
  const projectedTotalCost = actualCost / (pctComplete / 100);
  const projectedMargin =
    ((contractValue - projectedTotalCost) / contractValue) * 100;

  let confidence: string;
  if (pctComplete > 60) confidence = "HIGH";
  else if (pctComplete > 35) confidence = "MEDIUM";
  else confidence = "LOW";

  return {
    forecast_margin_pct: Math.round(projectedMargin * 100) / 100,
    forecast_total_cost: Math.round(projectedTotalCost),
    confidence,
  };
}

// ── Claude system prompt (plain English, no column names) ──────────────
const PROJECT_ANALYSIS_PROMPT = `You are an autonomous CFO agent for a commercial HVAC contractor. You receive detailed financial data for a single project and must produce an executive briefing.

IMPORTANT RULES:
- Write in plain English for a non-technical CFO. Never use column names, variable names, or raw data labels.
- Every dollar amount should be written as "$X.XM" or "$XXK" — never as raw numbers like 3818653.
- Every percentage should have context: "margin fell from 15% to negative 77%" not just "-76.81%".
- Recovery actions must be specific: name the change order number, the SOV line description, the dollar amount.
- For COMPLETED projects: only recommend retention release, CO audits, or lessons learned. Do NOT recommend redirecting labor or submitting new billing.
- For ACTIVE projects: recommend immediate actions like submitting billing, filing COs, redirecting crew.

You will also receive:
- Field note themes (patterns found in daily reports)
- Billing gaps (completed work not yet billed)
- Pending change orders (uncaptured revenue)
- A margin forecast (where the project is heading if current trajectory continues)
- The project's sector, which affects what "normal" erosion looks like

Format your response as JSON:
{
  "project_id": "string",
  "project_name": "string",
  "sector": "string",
  "status": "Active | Completed",
  "severity": "CRITICAL | WARNING",
  "dollar_exposure": number,
  "one_line_summary": "One sentence a CFO can read in 5 seconds",
  "root_causes": [
    {
      "category": "Labor | Material | Change Orders | Billing | Schedule",
      "explanation": "2-3 sentences in plain English explaining what went wrong and why",
      "dollars_over_budget": number
    }
  ],
  "recovery_actions": [
    {
      "priority": 1,
      "action": "Specific action written as a directive: 'Submit change order CO-008 for $16.6K covering fire damper installation required by inspector'",
      "estimated_recovery": number,
      "rationale": "One sentence explaining why this recovers money"
    }
  ],
  "field_note_signals": ["Plain English descriptions of patterns found in daily field reports"],
  "margin_forecast": "For active projects: where is this heading if nothing changes? For completed: omit."
}`;

const PORTFOLIO_PATTERNS_PROMPT = `You are a CFO agent analyzing cross-portfolio patterns across a commercial HVAC contractor's project portfolio. You receive aggregated statistics by sector, general contractor, and year cohort.

Your job is to identify systemic patterns — things the CFO needs to know that aren't visible when looking at individual projects.

IMPORTANT: Write in plain English. No column names. Use dollar amounts and percentages with context.

Look for:
1. Is margin erosion concentrated in one sector? Why might that be?
2. Is one general contractor associated with worse outcomes? What does that suggest?
3. Do certain year cohorts perform worse? Is there a trend over time?
4. Do projects with high RFI counts also tend to have labor overruns?
5. Is there a completion percentage where erosion typically accelerates?

Format as JSON:
{
  "portfolio_patterns": [
    {
      "pattern": "Plain English description of the pattern",
      "evidence": "The numbers that support this",
      "implication": "What the CFO should do about it",
      "affected_projects": number
    }
  ],
  "sector_summary": {
    "worst_sector": "string",
    "best_sector": "string",
    "explanation": "Why the worst sector struggles"
  },
  "gc_summary": {
    "highest_risk_gc": "string",
    "explanation": "Pattern with this GC"
  },
  "trend": "Is erosion getting better or worse over time? One sentence."
}`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "5", 10);

  try {
    // ── Step 1: Load all projects with sector classification ────────
    const allProjects = await query<{
      project_id: string;
      project_name: string;
      realized_margin_pct: number;
      total_variance: number;
      original_contract_value: number;
      adjusted_contract_value: number;
      actual_total_cost: number;
      actual_labor_cost: number;
      actual_material_cost: number;
      budgeted_labor_cost: number;
      budgeted_material_cost: number;
      total_estimated_budget: number;
      approved_co_value: number;
      pending_co_value: number;
      cumulative_billed: number;
      retention_held: number;
      avg_pct_complete: number;
      gc_name: string;
      contract_date: string;
      substantial_completion_date: string;
      billing_gap_pct: number;
      budget_coverage_pct: number;
    }>(`
      SELECT * FROM project_health
      ORDER BY ABS(total_variance) DESC
    `);

    // ── Step 2: Classify each project ──────────────────────────────
    const classified = allProjects.map((p) => {
      const sector = classifySector(p.project_name);
      const thresholds = getSectorThreshold(sector);
      const cohort = p.project_id.split("-")[1]; // e.g., "2021" from "PRJ-2021-260"

      // Determine active vs completed
      const isCompleted = p.avg_pct_complete >= 95;
      const status = isCompleted ? "Completed" : "Active";

      // Sector-aware severity
      let severity: string;
      if (p.realized_margin_pct < thresholds.critical) severity = "CRITICAL";
      else if (p.realized_margin_pct < thresholds.warning) severity = "WARNING";
      else if (p.realized_margin_pct < 12) severity = "WATCH";
      else severity = "HEALTHY";

      // Dollar exposure = absolute variance (how much money is at risk)
      const dollarExposure = Math.abs(p.total_variance);

      // Margin forecast for active projects
      const forecast = !isCompleted ? forecastMargin(p) : null;

      return {
        ...p,
        sector,
        cohort,
        status,
        severity,
        dollar_exposure: dollarExposure,
        forecast,
      };
    });

    // ── Step 3: Flag at-risk, sorted by dollar exposure ────────────
    const flagged = classified
      .filter((p) => p.severity === "CRITICAL" || p.severity === "WARNING")
      .sort((a, b) => b.dollar_exposure - a.dollar_exposure)
      .slice(0, limit);

    // Portfolio stats
    const critical = classified.filter(
      (p) => p.severity === "CRITICAL"
    ).length;
    const warning = classified.filter((p) => p.severity === "WARNING").length;
    const avgMargin =
      classified.reduce((s, p) => s + p.realized_margin_pct, 0) /
      classified.length;
    const totalDollarsAtRisk = classified
      .filter((p) => p.severity === "CRITICAL" || p.severity === "WARNING")
      .reduce((s, p) => s + p.dollar_exposure, 0);

    // ── Step 4: Analyze each flagged project ───────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });
    const analyses = [];

    for (const project of flagged) {
      // Gather detailed data
      const data = await gatherProjectData(project.project_id);

      // Extract field note themes
      const themes = await extractFieldNoteThemes(project.project_id);

      // Build context for Claude
      const dataPackage = JSON.stringify(
        {
          ...data,
          sector: project.sector,
          status: project.status,
          dollar_exposure: project.dollar_exposure,
          field_note_themes: themes,
          margin_forecast: project.forecast,
        },
        null,
        2
      );

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: PROJECT_ANALYSIS_PROMPT,
        messages: [
          {
            role: "user",
            content: `Analyze this ${project.sector} HVAC project (${project.status}). Dollar exposure: $${Math.round(project.dollar_exposure).toLocaleString()}. Provide root causes and recovery actions.\n\n${dataPackage}`,
          },
        ],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      const responseText = textBlock ? textBlock.text : "";

      let analysis;
      try {
        const jsonMatch =
          responseText.match(/```json?\s*([\s\S]*?)```/) ||
          responseText.match(/(\{[\s\S]*\})/);
        analysis = jsonMatch
          ? JSON.parse(jsonMatch[1])
          : JSON.parse(responseText);
      } catch {
        analysis = { raw_response: responseText };
      }

      analyses.push({
        ...analysis,
        field_note_themes: themes,
        forecast: project.forecast,
        tokens_used: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
        },
      });
    }

    // ── Step 5: Portfolio-level pattern analysis ────────────────────
    // Aggregate stats for Claude to analyze
    const sectorStats = await query(`
      SELECT * FROM (
        SELECT
          'placeholder' AS sector,
          COUNT(*) AS project_count,
          ROUND(AVG(realized_margin_pct), 2) AS avg_margin,
          SUM(CASE WHEN realized_margin_pct < 0 THEN 1 ELSE 0 END) AS negative_margin_count,
          ROUND(SUM(ABS(total_variance)), 0) AS total_dollar_exposure
        FROM project_health
      ) WHERE 1=0
    `);

    // Build sector stats manually since we need the classification
    const sectorMap: Record<
      string,
      { count: number; margins: number[]; exposure: number; names: string[] }
    > = {};
    for (const p of classified) {
      if (!sectorMap[p.sector]) {
        sectorMap[p.sector] = { count: 0, margins: [], exposure: 0, names: [] };
      }
      sectorMap[p.sector].count++;
      sectorMap[p.sector].margins.push(p.realized_margin_pct);
      if (p.severity === "CRITICAL" || p.severity === "WARNING") {
        sectorMap[p.sector].exposure += p.dollar_exposure;
      }
    }

    const sectorSummary = Object.entries(sectorMap).map(([sector, data]) => ({
      sector,
      project_count: data.count,
      avg_margin:
        Math.round(
          (data.margins.reduce((a, b) => a + b, 0) / data.margins.length) * 100
        ) / 100,
      negative_margin_count: data.margins.filter((m) => m < 0).length,
      total_dollar_exposure: Math.round(data.exposure),
    }));

    const gcStats = await query(`
      SELECT
        gc_name,
        COUNT(*) AS project_count,
        ROUND(AVG(realized_margin_pct), 2) AS avg_margin,
        SUM(CASE WHEN realized_margin_pct < 0 THEN 1 ELSE 0 END) AS negative_margin_count,
        ROUND(SUM(ABS(total_variance)), 0) AS total_dollar_exposure
      FROM project_health
      GROUP BY gc_name
      ORDER BY AVG(realized_margin_pct) ASC
    `);

    const cohortStats = await query(`
      SELECT
        SUBSTRING(project_id, 5, 4) AS cohort,
        COUNT(*) AS project_count,
        ROUND(AVG(realized_margin_pct), 2) AS avg_margin,
        SUM(CASE WHEN realized_margin_pct < 0 THEN 1 ELSE 0 END) AS negative_margin_count,
        ROUND(AVG(billing_gap_pct), 2) AS avg_billing_gap
      FROM project_health
      GROUP BY SUBSTRING(project_id, 5, 4)
      ORDER BY cohort
    `);

    // RFI correlation with labor overruns
    const rfiCorrelation = await query(`
      SELECT
        CASE WHEN rfi_count > 60 THEN 'High RFI (60+)'
             WHEN rfi_count > 30 THEN 'Medium RFI (30-60)'
             ELSE 'Low RFI (<30)' END AS rfi_bucket,
        COUNT(*) AS project_count,
        ROUND(AVG(ph.realized_margin_pct), 2) AS avg_margin,
        ROUND(AVG(ph.labor_variance), 0) AS avg_labor_variance
      FROM project_health ph
      JOIN (
        SELECT project_id, COUNT(*) AS rfi_count
        FROM rfis
        GROUP BY project_id
      ) r ON ph.project_id = r.project_id
      GROUP BY rfi_bucket
      ORDER BY avg_margin ASC
    `);

    // Call Claude for portfolio pattern analysis
    const portfolioData = JSON.stringify(
      {
        sector_stats: sectorSummary,
        gc_stats: gcStats,
        cohort_stats: cohortStats,
        rfi_correlation: rfiCorrelation,
        total_projects: allProjects.length,
        overall_avg_margin: Math.round(avgMargin * 100) / 100,
      },
      null,
      2
    );

    const portfolioMessage = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: PORTFOLIO_PATTERNS_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze these portfolio-wide statistics and identify systemic patterns the CFO needs to know about.\n\n${portfolioData}`,
        },
      ],
    });

    const portfolioText = portfolioMessage.content.find(
      (b) => b.type === "text"
    );
    const portfolioResponseText = portfolioText ? portfolioText.text : "";

    let portfolioAnalysis;
    try {
      const jsonMatch =
        portfolioResponseText.match(/```json?\s*([\s\S]*?)```/) ||
        portfolioResponseText.match(/(\{[\s\S]*\})/);
      portfolioAnalysis = jsonMatch
        ? JSON.parse(jsonMatch[1])
        : JSON.parse(portfolioResponseText);
    } catch {
      portfolioAnalysis = { raw_response: portfolioResponseText };
    }

    // ── Assemble the full CFO briefing ─────────────────────────────
    return NextResponse.json({
      briefing_generated_at: new Date().toISOString(),
      portfolio_overview: {
        total_projects: allProjects.length,
        critical_projects: critical,
        warning_projects: warning,
        healthy_projects: allProjects.length - critical - warning,
        average_realized_margin_pct: Math.round(avgMargin * 100) / 100,
        total_dollars_at_risk: Math.round(totalDollarsAtRisk),
        projects_analyzed: flagged.length,
      },
      flagged_projects: flagged.map((p) => ({
        project_id: p.project_id,
        project_name: p.project_name,
        sector: p.sector,
        status: p.status,
        gc_name: p.gc_name,
        contract_value: p.original_contract_value,
        actual_cost: p.actual_total_cost,
        dollar_exposure: p.dollar_exposure,
        realized_margin_pct: p.realized_margin_pct,
        forecast: p.forecast,
      })),
      project_analyses: analyses,
      portfolio_patterns: portfolioAnalysis,
    });
  } catch (error) {
    console.error("Briefing error:", error);
    return NextResponse.json(
      { error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}
