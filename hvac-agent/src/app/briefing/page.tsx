"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Shield, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ProjectSection } from "@/components/margin-guard/project-section";
import { ChartModal } from "@/components/margin-guard/chart-modal";
import { PortfolioPatterns } from "@/components/margin-guard/portfolio-patterns";
import type { BriefingResponse, DisplayProject } from "@/lib/types";

export default function BriefingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Scanning 405 projects...");
  const [showContent, setShowContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data from API
  const [projects, setProjects] = useState<DisplayProject[]>([]);
  const [patternData, setPatternData] = useState<{
    label: string;
    text: string;
  }[]>([]);

  // Typing state for header section
  const [headerPhase, setHeaderPhase] = useState(0);
  const [headerTexts, setHeaderTexts] = useState<string[]>([]);
  const [headerTyping, setHeaderTyping] = useState(false);
  const headerStartedRef = useRef(false);

  // Project state
  const [currentProjectIndex, setCurrentProjectIndex] = useState(-1);
  const [completedProjects, setCompletedProjects] = useState<Set<number>>(
    new Set()
  );
  const [showPatterns, setShowPatterns] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  // Modal state
  const [selectedProject, setSelectedProject] = useState<DisplayProject | null>(
    null
  );

  // Header lines to type
  const headerLines = ["Flagged Projects"];

  // Helper: map raw API response into display-ready data
  const processBriefingData = (data: BriefingResponse) => {
    const displayProjects: DisplayProject[] = data.flagged_projects.map(
      (fp, index) => {
        const analysis = data.project_analyses[index];

        const sovLines = (analysis?.root_causes || []).map((rc) => ({
          description: rc.category,
          estimated: Math.max(0, Math.abs(rc.dollars_over_budget) * 0.4),
          actual:
            Math.abs(rc.dollars_over_budget) * 0.4 +
            Math.abs(rc.dollars_over_budget),
          variance: Math.abs(rc.dollars_over_budget),
        }));

        return {
          project_id: fp.project_id,
          project_name: fp.project_name,
          sector: fp.sector,
          status: fp.status,
          severity: (analysis?.severity || "WARNING") as
            | "CRITICAL"
            | "WARNING"
            | "WATCH",
          contract_value: fp.contract_value,
          actual_cost: fp.actual_cost,
          realized_margin_pct: fp.realized_margin_pct,
          dollar_exposure: fp.dollar_exposure,
          root_causes: (analysis?.root_causes || []).map((rc) => ({
            category: rc.category,
            explanation: rc.explanation,
            dollars_over_budget: rc.dollars_over_budget,
          })),
          recovery_actions: (analysis?.recovery_actions || []).map((ra) => ({
            action: ra.action,
            estimated_recovery: ra.estimated_recovery,
          })),
          sov_lines: sovLines,
        };
      }
    );

    const pp = data.portfolio_patterns;
    let patterns: { label: string; text: string }[] = [];
    if (pp && pp.portfolio_patterns) {
      const patternLabels = [
        "Finding 1",
        "Finding 2",
        "Finding 3",
        "Finding 4",
        "Finding 5",
      ];
      patterns = pp.portfolio_patterns.map((p, i) => ({
        label: patternLabels[i] || `Finding ${i + 1}`,
        text: `${p.pattern} ${p.evidence} ${p.implication}`,
      }));

      if (pp.sector_summary) {
        patterns.push({
          label: "Sector Trends",
          text: `Worst performing sector: ${pp.sector_summary.worst_sector}. ${pp.sector_summary.explanation}`,
        });
      }
      if (pp.gc_summary) {
        patterns.push({
          label: "GC Performance",
          text: `Highest risk GC: ${pp.gc_summary.highest_risk_gc}. ${pp.gc_summary.explanation}`,
        });
      }
      if (pp.trend) {
        patterns.push({
          label: "Trend",
          text: pp.trend,
        });
      }
    }

    return { displayProjects, patterns };
  };

  // Fetch briefing data — uses sessionStorage cache if available
  useEffect(() => {
    const CACHE_KEY = "marginguard_briefing_cache";

    const loadFromCache = (): BriefingResponse | null => {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch {}
      return null;
    };

    const saveToCache = (data: BriefingResponse) => {
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {}
    };

    const cachedData = loadFromCache();

    if (cachedData) {
      // Cached: show a short loading animation (2 seconds), then display
      setLoadingMessage("Loading briefing...");
      setTimeout(() => {
        const { displayProjects, patterns } = processBriefingData(cachedData);
        setProjects(displayProjects);
        setPatternData(patterns);
        setIsLoading(false);
        setTimeout(() => {
          setShowContent(true);
        }, 100);
      }, 2000);
      return;
    }

    // No cache: fetch from API
    const fetchBriefing = async () => {
      try {
        const messages = [
          "Scanning 405 projects...",
          "Classifying sectors...",
          "Ranking by dollar exposure...",
          "Analyzing flagged projects with AI...",
          "Identifying root causes...",
          "Generating recovery actions...",
          "Running portfolio pattern analysis...",
        ];
        let msgIndex = 0;
        const msgInterval = setInterval(() => {
          msgIndex = (msgIndex + 1) % messages.length;
          setLoadingMessage(messages[msgIndex]);
        }, 4000);

        const response = await fetch("/api/briefing?limit=3");
        clearInterval(msgInterval);

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data: BriefingResponse = await response.json();

        // Cache the raw response
        saveToCache(data);

        const { displayProjects, patterns } = processBriefingData(data);
        setProjects(displayProjects);
        setPatternData(patterns);

        setIsLoading(false);
        setTimeout(() => {
          setShowContent(true);
        }, 100);
      } catch (err) {
        console.error("Failed to fetch briefing:", err);
        setError(
          err instanceof Error ? err.message : "Failed to generate briefing"
        );
        setIsLoading(false);
      }
    };

    fetchBriefing();
  }, []);

  // Type header lines
  useEffect(() => {
    if (!showContent || headerStartedRef.current) return;
    headerStartedRef.current = true;

    const typePhase = (index: number) => {
      if (index >= headerLines.length) {
        setTimeout(() => {
          setCurrentProjectIndex(0);
        }, 400);
        return;
      }

      const text = headerLines[index];
      let charIndex = 0;
      const speed = 12;
      setHeaderTyping(true);
      setHeaderPhase(index);

      const typeChar = () => {
        if (charIndex <= text.length) {
          setHeaderTexts((prev) => {
            const newTexts = [...prev];
            newTexts[index] = text.slice(0, charIndex);
            return newTexts;
          });
          charIndex++;
          setTimeout(typeChar, speed);
        } else {
          setHeaderTyping(false);
          setTimeout(() => {
            typePhase(index + 1);
          }, 150);
        }
      };

      typeChar();
    };

    typePhase(0);
  }, [showContent, headerLines]);

  const handleProjectComplete = useCallback(
    (projectIndex: number) => {
      setCompletedProjects((prev) => new Set(prev).add(projectIndex));

      setTimeout(() => {
        if (projectIndex < projects.length - 1) {
          setCurrentProjectIndex(projectIndex + 1);
        } else {
          setTimeout(() => {
            setShowPatterns(true);
          }, 600);
        }
      }, 600);
    },
    [projects.length]
  );

  const handlePatternsComplete = useCallback(() => {
    setTimeout(() => {
      setAnalysisComplete(true);
    }, 300);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="flex items-center justify-center gap-4 mb-10">
            <Shield className="h-14 w-14 text-muted-foreground" />
            <span className="text-5xl font-semibold tracking-tight text-foreground">
              MarginGuard
            </span>
          </div>
          <p className="text-2xl text-muted-foreground animate-pulse">
            {loadingMessage}
          </p>
          <p className="text-lg text-muted-foreground mt-6">
            This may take 30–60 seconds
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Analysis Failed</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link
            href="/"
            className="text-sm font-medium underline text-foreground"
          >
            Return to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background print:bg-white">
      {/* Navigation Bar */}
      <nav
        className={`border-b border-border py-4 px-6 transition-opacity duration-500 ${
          showContent ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors print:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <Shield className="h-6 w-6 text-muted-foreground" />
              <span className="text-xl font-semibold tracking-tight text-foreground">
                MarginGuard
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            size="default"
            className="gap-2 print:hidden"
            onClick={handlePrint}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
        </div>
      </nav>

      {/* Report Content */}
      <div className="mx-auto max-w-5xl px-8 pt-12 leading-relaxed">
        {/* Report Title - Typed */}
        <div
          className={`transition-opacity duration-500 delay-100 ${
            showContent ? "opacity-100" : "opacity-0"
          }`}
        >
          {headerTexts[0] !== undefined && (
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-8">
              {headerTexts[0]}
              {headerPhase === 0 && headerTyping && (
                <span className="animate-pulse text-muted-foreground">|</span>
              )}
            </h2>
          )}
        </div>

        {/* Project Sections */}
        <div>
          {projects.map((project, index) => (
            <ProjectSection
              key={project.project_id}
              project={project}
              startTyping={currentProjectIndex >= index}
              onComplete={() => handleProjectComplete(index)}
              onViewChart={() => setSelectedProject(project)}
              isLast={index === projects.length - 1}
            />
          ))}
        </div>

        {/* Portfolio Patterns Section */}
        <PortfolioPatterns
          startTyping={showPatterns}
          onComplete={handlePatternsComplete}
          patterns={patternData}
        />

        {/* Status Indicator */}
        <div
          className={`mt-12 text-center transition-opacity duration-500 print:hidden ${
            showContent ? "opacity-100" : "opacity-0"
          }`}
        >
          {!analysisComplete ? (
            <p className="text-sm text-muted-foreground animate-pulse">
              MarginGuard is analyzing...
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Analysis complete</p>
          )}
        </div>

        {/* Spacer for bottom */}
        <div className="h-16 print:hidden" />
      </div>

      {/* Chart Modal */}
      <ChartModal
        isOpen={selectedProject !== null}
        onClose={() => setSelectedProject(null)}
        projectName={selectedProject?.project_name ?? ""}
        projectId={selectedProject?.project_id ?? ""}
        sovLines={selectedProject?.sov_lines ?? []}
      />
    </main>
  );
}
