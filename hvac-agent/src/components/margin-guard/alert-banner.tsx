"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface StatItemProps {
  label: string;
  value: string;
  status?: "critical" | "warning" | "healthy" | "neutral";
}

function StatItem({ label, value, status = "neutral" }: StatItemProps) {
  const statusColorClasses = {
    critical: "text-status-critical",
    warning: "text-status-warning",
    healthy: "text-status-healthy",
    neutral: "text-foreground",
  };

  return (
    <div className="flex flex-col gap-2 text-center">
      <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl ${statusColorClasses[status]}`}
      >
        {value}
      </span>
    </div>
  );
}

export function AlertBanner() {
  const [stats, setStats] = useState({
    critical: 0,
    warning: 0,
    dollarsAtRisk: 0,
    averageMargin: 0,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/scan")
      .then((res) => res.json())
      .then((data) => {
        const summary = data.portfolio_summary;
        setStats({
          critical: summary.critical_count,
          warning: summary.warning_count,
          dollarsAtRisk: Math.abs(summary.total_portfolio_variance) / 1_000_000,
          averageMargin: summary.average_realized_margin_pct,
        });
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load portfolio stats:", err);
        setLoaded(true);
      });
  }, []);

  const formatDollarsAtRisk = (millions: number) => {
    if (millions >= 1000) {
      return `$${(millions / 1000).toFixed(1)}B`;
    }
    return `$${Math.round(millions)}M`;
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardContent className="py-12 px-8 md:py-16 md:px-12 lg:py-20 lg:px-16">
        {!loaded ? (
          <div className="text-center text-muted-foreground animate-pulse">
            Loading portfolio data...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12 lg:gap-16">
            <StatItem
              label="Critical"
              value={stats.critical.toString()}
              status="critical"
            />
            <StatItem
              label="Warning"
              value={stats.warning.toString()}
              status="warning"
            />
            <StatItem
              label="At Risk"
              value={formatDollarsAtRisk(stats.dollarsAtRisk)}
              status="neutral"
            />
            <StatItem
              label="Avg Margin"
              value={`${Math.round(stats.averageMargin)}%`}
              status="healthy"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
