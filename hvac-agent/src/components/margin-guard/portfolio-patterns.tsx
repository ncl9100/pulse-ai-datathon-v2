"use client";

import { useState, useEffect, useRef } from "react";

interface PatternItem {
  label: string;
  text: string;
}

interface PortfolioPatternsProps {
  startTyping: boolean;
  onComplete: () => void;
  patterns?: PatternItem[];
}

const fallbackPatterns: PatternItem[] = [
  {
    label: "Sector Trends",
    text: "Multifamily Residential and Healthcare projects account for the majority of margin erosion across the portfolio, suggesting systemic estimating gaps in labor-intensive verticals.",
  },
  {
    label: "GC Performance",
    text: "GC selection correlates with change order recovery rates. Consider prioritizing bids with higher-performing GCs for complex projects.",
  },
  {
    label: "Cohort Analysis",
    text: "Earlier project cohorts show lower realized margins, correlating with supply chain disruptions. Recommend reviewing estimating templates.",
  },
  {
    label: "RFI Correlation",
    text: "Projects with high early RFI counts show significantly higher probability of margin erosion. Early RFI velocity is a leading indicator.",
  },
];

export function PortfolioPatterns({
  startTyping,
  onComplete,
  patterns,
}: PortfolioPatternsProps) {
  const activePatterns = patterns && patterns.length > 0 ? patterns : fallbackPatterns;

  const [currentPhase, setCurrentPhase] = useState(-1);
  const [displayedTexts, setDisplayedTexts] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const hasStartedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // All lines: title first, then each pattern as "Label: Text"
  const allLines = [
    "Portfolio Patterns",
    ...activePatterns.map((p) => `${p.label}: ${p.text}`),
  ];

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
      const speed = index === 0 ? 20 : 8;
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
          }, 200);
        }
      };

      typeChar();
    };

    typePhase(0);
  }, [startTyping, allLines, isComplete]);

  if (!startTyping && displayedTexts.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 pt-8 border-t border-gray-200">
      {/* Title */}
      {displayedTexts[0] !== undefined && (
        <h2 className="text-3xl font-bold tracking-tight text-foreground mb-8">
          {displayedTexts[0]}
          {currentPhase === 0 && isTyping && (
            <span className="animate-pulse text-muted-foreground">|</span>
          )}
        </h2>
      )}

      {/* Pattern paragraphs */}
      <div className="space-y-4">
        {activePatterns.map((pattern, index) => {
          const textIndex = index + 1;
          const displayedText = displayedTexts[textIndex];

          if (displayedText === undefined) return null;

          const colonIndex = displayedText.indexOf(":");
          const showLabel = colonIndex > 0;
          const labelPart = showLabel
            ? displayedText.slice(0, colonIndex + 1)
            : "";
          const textPart = showLabel
            ? displayedText.slice(colonIndex + 1)
            : displayedText;

          return (
            <p
              key={pattern.label + index}
              className="text-base leading-relaxed text-gray-700"
            >
              {showLabel && (
                <span className="font-semibold text-foreground">
                  {labelPart}
                </span>
              )}
              {textPart}
              {currentPhase === textIndex && isTyping && (
                <span className="animate-pulse text-muted-foreground">|</span>
              )}
            </p>
          );
        })}
      </div>
    </section>
  );
}
