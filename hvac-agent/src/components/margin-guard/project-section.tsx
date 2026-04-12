"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { DisplayProject } from "@/lib/types";

interface ProjectSectionProps {
  project: DisplayProject;
  startTyping: boolean;
  onComplete: () => void;
  onViewChart: () => void;
  isLast?: boolean;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  return `$${Math.round(value / 1000)}K`;
}

export function ProjectSection({
  project,
  startTyping,
  onComplete,
  onViewChart,
  isLast = false,
}: ProjectSectionProps) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [displayedTexts, setDisplayedTexts] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const hasStartedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const marginColor =
    project.realized_margin_pct < 0
      ? "text-red-600"
      : project.realized_margin_pct < 10
        ? "text-amber-600"
        : "text-green-600";

  // Severity badge colors
  const severityStyles = {
    CRITICAL: "bg-red-50 text-red-700",
    WARNING: "bg-amber-50 text-amber-700",
    WATCH: "bg-blue-50 text-blue-700",
  };

  const badgeStyle = severityStyles[project.severity as keyof typeof severityStyles] || "bg-gray-100 text-gray-700";

  // Build all text lines to type
  const allLines = useMemo(
    () => [
      // Phase 0: Header line
      `[${project.severity}] ${project.project_id} | ${project.project_name}`,
      // Phase 1: Financial summary
      `Contract: ${formatCurrency(project.contract_value)} | Actual Cost: ${formatCurrency(project.actual_cost)} | Realized Margin: ${project.realized_margin_pct.toFixed(1)}% | ${project.sector} · ${project.status}`,
      // Root causes label
      "Root causes:",
      // Root causes
      ...project.root_causes.map(
        (cause) =>
          `${cause.category}: ${cause.explanation}`
      ),
      // Recovery actions label
      "Recovery actions:",
      // Recovery actions
      ...project.recovery_actions.map(
        (action, i) =>
          `${i + 1}. ${action.action} Est. recovery: ${formatCurrency(action.estimated_recovery)}`
      ),
    ],
    [project]
  );

  const rootCauseLabelIndex = 2;
  const rootCauseStartIndex = 3;
  const recoveryLabelIndex = 3 + project.root_causes.length;
  const recoveryStartIndex = 4 + project.root_causes.length;

  useEffect(() => {
    if (!startTyping || hasStartedRef.current || isComplete) return;
    hasStartedRef.current = true;

    const typePhase = (index: number) => {
      if (index >= allLines.length) {
        setIsComplete(true);
        onCompleteRef.current();
        return;
      }

      const text = allLines[index];
      let charIndex = 0;
      const speed = 8;
      setIsTyping(true);
      setCurrentPhase(index);

      const typeChar = () => {
        if (charIndex <= text.length) {
          setDisplayedTexts((prev) => {
            const newTexts = [...prev];
            newTexts[index] = text.slice(0, charIndex);
            return newTexts;
          });
          charIndex++;
          setTimeout(typeChar, speed);
        } else {
          setIsTyping(false);
          setTimeout(() => {
            typePhase(index + 1);
          }, 80);
        }
      };

      typeChar();
    };

    typePhase(0);
  }, [startTyping, allLines, isComplete]);

  if (!startTyping && displayedTexts.length === 0) {
    return null;
  }

  // Parse header line for rendering with colored badge
  const parseHeader = (text: string) => {
    const match = text.match(/\[(.*?)\]\s*(.*)/);
    if (match) {
      return { severity: match[1], rest: match[2] };
    }
    return { severity: "", rest: text };
  };

  return (
    <section
      className={`pt-10 transition-all duration-300 border-t border-gray-200 ${isLast ? "pb-6" : "pb-10 mb-6"}`}
    >
      {/* Project Header: Severity Badge + ID + Name */}
      {displayedTexts[0] !== undefined && (
        <div className="mb-3">
          {(() => {
            const { severity, rest } = parseHeader(displayedTexts[0]);
            return (
              <p className="font-semibold text-foreground text-xl">
                {severity && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium uppercase tracking-wide mr-3 ${badgeStyle}`}>
                    {severity}
                  </span>
                )}
                {rest}
                {currentPhase === 0 && isTyping && (
                  <span className="animate-pulse text-muted-foreground">|</span>
                )}
              </p>
            );
          })()}
        </div>
      )}

      {/* Financial Summary */}
      {displayedTexts[1] !== undefined && (
        <p className="text-base text-gray-600 mb-6">
          {displayedTexts[1].split("|").map((part, i) => {
            if (part.includes("Realized Margin:")) {
              const [label, rest] = part.split(":");
              return (
                <span key={i}>
                  {i > 0 && " | "}
                  {label}:<span className={marginColor}>{rest}</span>
                </span>
              );
            }
            return (
              <span key={i}>
                {i > 0 && " | "}
                {part}
              </span>
            );
          })}
          {currentPhase === 1 && isTyping && (
            <span className="animate-pulse">|</span>
          )}
        </p>
      )}

      {/* Root Causes Label */}
      {displayedTexts[rootCauseLabelIndex] !== undefined && (
        <p className="text-base font-bold text-foreground mb-3">
          {displayedTexts[rootCauseLabelIndex]}
          {currentPhase === rootCauseLabelIndex && isTyping && (
            <span className="animate-pulse text-muted-foreground">|</span>
          )}
        </p>
      )}

      {/* Root Causes List */}
      {displayedTexts[rootCauseStartIndex] !== undefined && (
        <ul className="text-base leading-relaxed text-gray-700 space-y-2 mb-6 ml-4">
          {project.root_causes.map((_, i) => {
            const textIndex = rootCauseStartIndex + i;
            if (displayedTexts[textIndex] === undefined) return null;
            return (
              <li key={i} className="flex">
                <span className="mr-2 shrink-0 text-gray-400">&bull;</span>
                <span>
                  {displayedTexts[textIndex]}
                  {currentPhase === textIndex && isTyping && (
                    <span className="animate-pulse">|</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Recovery Actions Label */}
      {displayedTexts[recoveryLabelIndex] !== undefined && (
        <p className="text-base font-bold text-foreground mb-3">
          {displayedTexts[recoveryLabelIndex]}
          {currentPhase === recoveryLabelIndex && isTyping && (
            <span className="animate-pulse text-muted-foreground">|</span>
          )}
        </p>
      )}

      {/* Recovery Actions List */}
      {displayedTexts[recoveryStartIndex] !== undefined && (
        <ul className="text-base leading-relaxed text-gray-700 space-y-2 ml-4">
          {project.recovery_actions.map((_, i) => {
            const textIndex = recoveryStartIndex + i;
            if (displayedTexts[textIndex] === undefined) return null;

            const text = displayedTexts[textIndex];
            const recoveryMatch = text.match(
              /(.*Est\. recovery: )(\$[\d.]+[KM]?)(.*)/
            );

            return (
              <li key={i}>
                {recoveryMatch ? (
                  <span>
                    {recoveryMatch[1]}
                    <span className="font-semibold">{recoveryMatch[2]}</span>
                    {recoveryMatch[3]}
                  </span>
                ) : (
                  <span>{text}</span>
                )}
                {currentPhase === textIndex && isTyping && (
                  <span className="animate-pulse">|</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* View Chart Button */}
      {isComplete && (
        <button
          onClick={onViewChart}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors cursor-pointer border border-gray-200"
        >
          <BarChart3 className="h-4 w-4" />
          <span>View variance chart</span>
        </button>
      )}
    </section>
  );
}
