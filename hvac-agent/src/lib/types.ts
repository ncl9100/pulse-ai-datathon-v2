// Types matching the real API response shapes

export interface RootCause {
  category: string;
  explanation: string;
  dollars_over_budget: number;
}

export interface RecoveryAction {
  priority: number;
  action: string;
  estimated_recovery: number;
  rationale: string;
}

export interface FlaggedProject {
  project_id: string;
  project_name: string;
  sector: string;
  status: string;
  gc_name: string;
  contract_value: number;
  actual_cost: number;
  dollar_exposure: number;
  realized_margin_pct: number;
  forecast: {
    forecast_margin_pct: number;
    forecast_total_cost: number;
    confidence: string;
  } | null;
}

export interface ProjectAnalysis {
  project_id: string;
  project_name: string;
  sector: string;
  status: string;
  severity: "CRITICAL" | "WARNING" | "WATCH";
  dollar_exposure: number;
  one_line_summary: string;
  root_causes: RootCause[];
  recovery_actions: RecoveryAction[];
  field_note_signals: string[];
  margin_forecast?: string;
  field_note_themes?: Record<string, { count: number; sample_notes: string[] }>;
  forecast?: {
    forecast_margin_pct: number;
    forecast_total_cost: number;
    confidence: string;
  } | null;
}

export interface PortfolioPattern {
  pattern: string;
  evidence: string;
  implication: string;
  affected_projects: number;
}

export interface PortfolioPatterns {
  portfolio_patterns: PortfolioPattern[];
  sector_summary: {
    worst_sector: string;
    best_sector: string;
    explanation: string;
  };
  gc_summary: {
    highest_risk_gc: string;
    explanation: string;
  };
  trend: string;
}

export interface BriefingResponse {
  briefing_generated_at: string;
  portfolio_overview: {
    total_projects: number;
    critical_projects: number;
    warning_projects: number;
    healthy_projects: number;
    average_realized_margin_pct: number;
    total_dollars_at_risk: number;
    projects_analyzed: number;
  };
  flagged_projects: FlaggedProject[];
  project_analyses: ProjectAnalysis[];
  portfolio_patterns: PortfolioPatterns;
}

export interface ScanResponse {
  portfolio_summary: {
    total_projects: number;
    critical_count: number;
    warning_count: number;
    total_at_risk: number;
    total_portfolio_variance: number;
    average_realized_margin_pct: number;
  };
  projects: Array<Record<string, unknown>>;
}

// Combined project data for UI rendering
export interface DisplayProject {
  project_id: string;
  project_name: string;
  sector: string;
  status: string;
  severity: "CRITICAL" | "WARNING" | "WATCH";
  contract_value: number;
  actual_cost: number;
  realized_margin_pct: number;
  dollar_exposure: number;
  root_causes: Array<{
    category: string;
    explanation: string;
    dollars_over_budget: number;
  }>;
  recovery_actions: Array<{
    action: string;
    estimated_recovery: number;
  }>;
  sov_lines: Array<{
    description: string;
    estimated: number;
    actual: number;
    variance: number;
  }>;
}
