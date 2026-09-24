/**
 * GET /api/briefing
 *
 * The autonomous agent endpoint — runs the full pipeline:
 *   1. Scans all 405 projects (from pre-computed JSON), classifies by sector
 *   2. Determines active vs completed status
 *   3. Flags at-risk projects, ranked by DOLLAR EXPOSURE
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
import { CLAUDE_MODEL } from "@/lib/model";
import fs from "fs";
import path from "path";

function loadScanData(): Record<string, unknown>[] {
  const filePath = path.join(process.cwd(), "src", "data", "scan.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function loadPortfolioStats(): Record<string, unknown> {
  const filePath = path.join(process.cwd(), "src", "data", "portfolio_stats.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ── Sector classification from project names ───────────────────────────
function classifySector(projectName: string): string {
  const name = projectName.toLowerCase();
  if (name.includes("hospital") || name.includes("medical") || name.includes("surgery"))
    return "Healthcare";
  if (name.includes("school") || name.includes("elementary") || name.includes("middle school") || name.includes("high school"))
    return "K-12 Education";
  if (name.includes("data center") || name.includes("colocation") || name.includes("cloud campus") || name.includes("edge data") || name.includes("thermal management"))
    return "Data Center";
  if (name.includes("office") || name.includes("corporate") || name.includes("business center"))
    return "Commercial Office";
  if (name.includes("apartment") || name.includes("residential") || name.includes("housing") || name.includes("senior living") || name.includes("condominium") || name.includes("mixed-income"))
    return "Multifamily Residential";
  if (name.includes("mixed-use") || name.includes("tower"))
    return "Mixed-Use";
  return "Other";
}

function getSectorThreshold(sector: string): { critical: number; warning: number } {
  switch (sector) {
    case "Healthcare": return { critical: -5, warning: 5 };
    case "Data Center": return { critical: -3, warning: 5 };
    case "K-12 Education": return { critical: 2, warning: 8 };
    case "Multifamily Residential": return { critical: 2, warning: 8 };
    default: return { critical: 0, warning: 8 };
  }
}

// ── Field note theme extraction ────────────────────────────────────────
const THEME_KEYWORDS: Record<string, string[]> = {
  delays: ["delay", "delayed", "waiting", "held up", "behind schedule", "slipped", "pushed back"],
  rework: ["rework", "redo", "tear out", "remove and replace", "failed inspection", "rejected"],
  scope_creep: ["additional work", "extra work", "not in scope", "owner-directed", "added scope", "beyond original"],
  gc_issues: ["waiting on GC", "GC delay", "no response", "coordination issue", "RFI pending"],
  labor_issues: ["short-staffed", "understaffed", "overtime", "crew shortage", "manpower", "additional crew"],
  material_issues: ["backorder", "late delivery", "wrong material", "damaged shipment", "substitution"],
};

interface ThemeCounts {
  [theme: string]: { count: number; sample_notes: string[] };
}

function extractFieldNoteThemes(fieldNotes: Array<{ content: string; date: string }>): ThemeCounts {
  const themes: ThemeCounts = {};
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    const matches: string[] = [];
    for (const note of fieldNotes) {
      const lower = (note.content || "").toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        matches.push(`[${note.date}] ${note.content}`);
      }
    }
    if (matches.length > 0) {
      themes[theme] = { count: matches.length, sample_notes: matches.slice(0, 3) };
    }
  }
  return themes;
}

// ── Load project data from pre-computed JSON ──────────────────────────
function loadProjectData(projectId: string): Record<string, unknown> | null {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "projects", `${projectId}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

  if (pctComplete <= 10 || pctComplete >= 95) return null;

  const projectedTotalCost = actualCost / (pctComplete / 100);
  const projectedMargin = ((contractValue - projectedTotalCost) / contractValue) * 100;

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

// ── Claude system prompts ──────────────────────────────────────────────
const PROJECT_ANALYSIS_PROMPT = `You are an autonomous CFO agent for a commercial HVAC contractor. You receive detailed financial data for a single project and must produce an executive briefing.

IMPORTANT RULES:
- Write in plain English for a non-technical CFO. Never use column names, variable names, or raw data labels.
- Every dollar amount should be written as "$X.XM" or "$XXK" — never as raw numbers like 3818653.
- Every percentage should have context: "margin fell from 15% to negative 77%" not just "-76.81%".
- Recovery actions must be specific: name the change order number, the SOV line description, the dollar amount.
- For COMPLETED projects: only recommend retention release, CO audits, or lessons learned. Do NOT recommend redirecting labor or submitting new billing.
- For ACTIVE projects: recommend immediate actions like submitting billing, filing COs, redirecting crew.

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
      "action": "Specific action written as a directive",
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
  const limit = parseInt(searchParams.get("limit") || "3", 10);

  try {
    // ── Step 1: Load all projects with sector classification ────────
    const allProjects = loadScanData();

    // ── Step 2: Classify each project ──────────────────────────────
    const classified = allProjects.map((p) => {
      const sector = classifySector(p.project_name as string);
      const thresholds = getSectorThreshold(sector);
      const projectId = p.project_id as string;
      const cohort = projectId.split("-")[1];

      const isCompleted = (p.avg_pct_complete as number) >= 95;
      const status = isCompleted ? "Completed" : "Active";

      const marginPct = p.realized_margin_pct as number;
      let severity: string;
      if (marginPct < thresholds.critical) severity = "CRITICAL";
      else if (marginPct < thresholds.warning) severity = "WARNING";
      else if (marginPct < 12) severity = "WATCH";
      else severity = "HEALTHY";

      const dollarExposure = Math.abs(p.total_variance as number);
      const forecast = !isCompleted ? forecastMargin(p) : null;

      return {
        project_id: projectId,
        project_name: p.project_name as string,
        gc_name: p.gc_name as string,
        original_contract_value: p.original_contract_value as number,
        actual_total_cost: p.actual_total_cost as number,
        contract_value: p.adjusted_contract_value as number,
        total_variance: p.total_variance as number,
        avg_pct_complete: p.avg_pct_complete as number,
        realized_margin_pct: marginPct,
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

    const critical = classified.filter((p) => p.severity === "CRITICAL").length;
    const warning = classified.filter((p) => p.severity === "WARNING").length;
    const avgMargin = classified.reduce((s, p) => s + p.realized_margin_pct, 0) / classified.length;
    const totalDollarsAtRisk = classified
      .filter((p) => p.severity === "CRITICAL" || p.severity === "WARNING")
      .reduce((s, p) => s + p.dollar_exposure, 0);

    // ── Step 4: Analyze each flagged project with Claude ───────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    // ── Step 4: Analyze each flagged project with Claude (PARALLEL) ──
    const analysisPromises = flagged.map(async (project) => {
      const projectId = project.project_id as string;
      const data = loadProjectData(projectId);

      if (!data) {
        return { raw_response: `No pre-computed data for ${projectId}` };
      }

      const fieldNotes = (data.field_notes as Array<{ content: string; date: string }>) || [];
      const themes = extractFieldNoteThemes(fieldNotes);

      // Trim data to reduce token count — only send top SOV lines, recent COs, and summary
      const sovLines = (data.sov_lines as Array<Record<string, unknown>>) || [];
      const topSovLines = sovLines
        .sort((a, b) => Math.abs((b.labor_variance as number) || 0) - Math.abs((a.labor_variance as number) || 0))
        .slice(0, 5)
        .map((s) => ({ description: s.description, scheduled_value: s.scheduled_value, estimated_labor: s.estimated_labor_cost, actual_labor: s.actual_labor_cost, estimated_material: s.estimated_material_cost, actual_material: s.actual_material_cost, labor_variance: s.labor_variance, material_variance: s.material_variance }));

      const changeOrders = (data.change_orders as Array<Record<string, unknown>>) || [];
      const topCOs = changeOrders.slice(0, 5).map((co) => ({ co_number: co.co_number, reason: co.reason_category, amount: co.amount, status: co.status }));

      const pendingCOs = (data.pending_cos as Array<Record<string, unknown>>) || [];
      const topPending = pendingCOs.slice(0, 3).map((co) => ({ co_number: co.co_number, amount: co.amount, status: co.status }));

      const billingGaps = (data.billing_gaps as Array<Record<string, unknown>>) || [];
      const topGaps = billingGaps.slice(0, 3);

      const dataPackage = JSON.stringify({
        health: data.health,
        top_sov_lines_by_variance: topSovLines,
        top_change_orders: topCOs,
        pending_change_orders: topPending,
        billing_gaps: topGaps,
        sector: project.sector,
        status: project.status,
        dollar_exposure: project.dollar_exposure,
        field_note_themes: themes,
        margin_forecast: project.forecast,
      }, null, 2);

      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: PROJECT_ANALYSIS_PROMPT,
        messages: [{
          role: "user",
          content: `Analyze this ${project.sector} HVAC project (${project.status}). Dollar exposure: $${Math.round(project.dollar_exposure).toLocaleString()}. Provide root causes and recovery actions.\n\n${dataPackage}`,
        }],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      const responseText = textBlock ? textBlock.text : "";

      let analysis;
      try {
        const jsonMatch = responseText.match(/```json?\s*([\s\S]*?)```/) || responseText.match(/(\{[\s\S]*\})/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);
      } catch {
        analysis = { raw_response: responseText };
      }

      return {
        ...analysis,
        field_note_themes: themes,
        forecast: project.forecast,
        tokens_used: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      };
    });

    // ── Step 5: Portfolio-level pattern analysis (runs in PARALLEL with project analyses) ──
    const sectorMap: Record<string, { count: number; margins: number[]; exposure: number }> = {};
    for (const p of classified) {
      if (!sectorMap[p.sector]) sectorMap[p.sector] = { count: 0, margins: [], exposure: 0 };
      sectorMap[p.sector].count++;
      sectorMap[p.sector].margins.push(p.realized_margin_pct);
      if (p.severity === "CRITICAL" || p.severity === "WARNING") {
        sectorMap[p.sector].exposure += p.dollar_exposure;
      }
    }

    const sectorSummary = Object.entries(sectorMap).map(([sector, data]) => ({
      sector,
      project_count: data.count,
      avg_margin: Math.round((data.margins.reduce((a, b) => a + b, 0) / data.margins.length) * 100) / 100,
      negative_margin_count: data.margins.filter((m) => m < 0).length,
      total_dollar_exposure: Math.round(data.exposure),
    }));

    const portfolioStats = loadPortfolioStats();
    const portfolioData = JSON.stringify({
      sector_stats: sectorSummary,
      gc_stats: portfolioStats.gc_stats,
      cohort_stats: portfolioStats.cohort_stats,
      rfi_correlation: portfolioStats.rfi_correlation,
      total_projects: allProjects.length,
      overall_avg_margin: Math.round(avgMargin * 100) / 100,
    }, null, 2);

    const portfolioPromise = client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: PORTFOLIO_PATTERNS_PROMPT,
      messages: [{
        role: "user",
        content: `Analyze these portfolio-wide statistics and identify systemic patterns the CFO needs to know about.\n\n${portfolioData}`,
      }],
    });

    // ── Await ALL Claude calls in parallel ─────────────────────────
    const [analyses, portfolioMessage] = await Promise.all([
      Promise.all(analysisPromises),
      portfolioPromise,
    ]);

    const portfolioText = portfolioMessage.content.find((b) => b.type === "text");
    const portfolioResponseText = portfolioText ? portfolioText.text : "";

    let portfolioAnalysis;
    try {
      const jsonMatch = portfolioResponseText.match(/```json?\s*([\s\S]*?)```/) || portfolioResponseText.match(/(\{[\s\S]*\})/);
      portfolioAnalysis = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(portfolioResponseText);
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
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to generate briefing", detail },
      { status: 500 }
    );
  }
}
