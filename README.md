# MarginGuard — Autonomous HVAC Margin Erosion Agent

An autonomous AI agent that analyzes a $6.4B portfolio of 405 HVAC projects, detects margin erosion, explains root causes in plain English, and delivers dollar-quantified recovery actions a CFO can act on immediately.

**Live**: https://pulse-ai-datathon-v2-o7s9.vercel.app
**Submission**: NYU DSC Datathon — The HVAC Margin Rescue Challenge

---

## Quick Start

```bash
git clone https://github.com/ncl9100/pulse-ai-datathon-v2.git
cd pulse-ai-datathon-v2/hvac-agent
npm install
```

Create a `.env.local` file in the `hvac-agent` directory:

```
ANTHROPIC_API_KEY=sk-ant-api-your-key-here
```

Then run:

```bash
npm run dev        # http://localhost:3000
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts |
| AI Reasoning | Anthropic Claude API (claude-sonnet-4-20250514) |
| Data Pipeline | DuckDB (build-time), pre-computed JSON (runtime) |
| Hosting | Vercel (serverless functions) |
| UI Prototyping | v0.dev |

---

## Architecture

```
                        ┌──────────────────┐
                        │   405 HVAC       │
                        │   Projects       │
                        │   (DuckDB)       │
                        └────────┬─────────┘
                                 │
                          build_duckdb.py
                                 │
                    ┌────────────┴────────────┐
                    │                         │
             scan.json (405)         projects/*.json (30)
             portfolio_stats.json    (per-project detail)
                    │                         │
                    └────────────┬────────────┘
                                 │
                         Next.js API Routes
                                 │
               ┌─────────────────┼─────────────────┐
               │                 │                  │
          /api/scan        /api/briefing       /api/analyze
          (portfolio       (autonomous         (single project
           overview)        agent pipeline)     deep-dive)
               │                 │
               │     ┌───────────┴───────────┐
               │     │                       │
               │  Claude API ×3          Claude API ×1
               │  (project analysis)     (portfolio patterns)
               │     │                       │
               │     └───────────┬───────────┘
               │                 │
               └─────────────────┤
                                 │
                          React Frontend
                          (briefing report)
```

### How the Agent Works

1. **Scan** — Loads all 405 projects from pre-computed JSON, classifies by sector-aware erosion thresholds (Healthcare, K-12, Data Centers, etc.)
2. **Flag** — Ranks at-risk projects by dollar exposure, selects the worst 3
3. **Analyze** — Sends trimmed project data (top SOV lines, change orders, field notes) to Claude API in parallel
4. **Pattern Detection** — Simultaneously runs portfolio-wide pattern analysis across sectors, GCs, and cohorts
5. **Report** — Assembles a complete CFO briefing with typewriter animation, variance charts, and dollar-quantified recovery actions

---

## Project Structure

```
pulse-ai-datathon-v2/
├── hvac-agent/                        # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx               # Home page (scan overview)
│   │   │   ├── briefing/page.tsx      # Briefing report page
│   │   │   └── api/
│   │   │       ├── scan/              # Portfolio scan (JSON-based)
│   │   │       ├── briefing/          # Autonomous agent pipeline
│   │   │       ├── analyze/           # Single project analysis
│   │   │       └── projects/          # Project detail endpoint
│   │   ├── components/margin-guard/
│   │   │   ├── header.tsx             # MarginGuard branding
│   │   │   ├── alert-banner.tsx       # Portfolio stats banner
│   │   │   ├── generate-briefing-button.tsx
│   │   │   ├── project-section.tsx    # Per-project analysis card
│   │   │   ├── chart-modal.tsx        # Variance bar chart overlay
│   │   │   ├── portfolio-patterns.tsx # Cross-portfolio insights
│   │   │   └── portfolio-insights.tsx
│   │   ├── data/
│   │   │   ├── scan.json              # All 405 projects (pre-computed)
│   │   │   ├── portfolio_stats.json   # GC, cohort, RFI correlations
│   │   │   └── projects/             # 30 per-project detail JSONs
│   │   └── lib/
│   │       ├── types.ts               # TypeScript interfaces
│   │       └── utils.ts               # Tailwind merge utility
│   ├── next.config.ts
│   ├── vercel.json                    # Serverless function timeouts
│   └── package.json
├── build_duckdb.py                    # DuckDB database builder
├── hvac_portfolio.duckdb              # Source database (not deployed)
├── DatathonInstructions.md            # Challenge brief
└── README.md                          # This file
```

---

## Key Features

- **Sector-Aware Thresholds** — Different erosion thresholds for Healthcare, K-12 Education, Data Centers, and more
- **Dollar Exposure Ranking** — Projects ranked by absolute financial impact, not just margin percentage
- **Live AI Reasoning** — Claude analyzes each flagged project's SOV lines, change orders, billing gaps, and field notes
- **Parallel Execution** — All Claude API calls fire simultaneously to fit Vercel's 60-second function timeout
- **Field Note Theme Extraction** — Identifies patterns like rework, delays, and scope changes from daily field logs
- **Margin Forecasting** — Projects final margin for active (incomplete) projects
- **Interactive Variance Charts** — Per-project estimated vs actual cost breakdown by SOV line
- **Session Caching** — Briefing results cached in sessionStorage for instant back-navigation
- **Print / PDF Export** — Clean print layout via `@media print` styles

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude reasoning engine |

Set locally in `.env.local`. Set on Vercel under **Settings → Environment Variables**.

---

## Data Pipeline

The DuckDB database (`hvac_portfolio.duckdb`) contains the full dataset: `project_health`, `sov`, `sov_budget`, `labor_summary`, `material_summary`, `change_orders`, `billing_history`, `rfis`, and `field_notes`.

For deployment, all data is pre-computed to static JSON to avoid shipping native DuckDB binaries to Vercel's serverless environment:

```bash
# Rebuild pre-computed JSON from DuckDB (only needed if the dataset changes)
python3 build_duckdb.py
```

---

## Deployment

The app auto-deploys to Vercel on push to `main`:

```bash
git add -A
git commit -m "your message"
git push
```

Vercel project settings:

- **Root Directory**: `hvac-agent`
- **Framework**: Next.js (auto-detected)
- **Node.js**: 20.x
- **Environment Variables**: `ANTHROPIC_API_KEY`

---

## Team

Built for the NYU DSC Datathon by Nathan (ncl9100@nyu.edu).

---

*Last Updated: April 12, 2026*
