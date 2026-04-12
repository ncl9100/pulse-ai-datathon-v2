"use client";

import { useState, useEffect } from "react";

interface PortfolioInsightsProps {
  insights: string[];
  isVisible: boolean;
}

function TypewriterParagraph({
  text,
  delay = 0,
  speed = 6,
}: {
  text: string;
  delay?: number;
  speed?: number;
}) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    let charIndex = 0;

    const startTyping = () => {
      const typeChar = () => {
        if (charIndex < text.length) {
          setDisplayedText(text.slice(0, charIndex + 1));
          charIndex++;
          timeout = setTimeout(typeChar, speed);
        } else {
          setIsComplete(true);
        }
      };
      typeChar();
    };

    timeout = setTimeout(startTyping, delay);

    return () => clearTimeout(timeout);
  }, [text, delay, speed]);

  return (
    <p className="text-sm text-muted-foreground leading-relaxed">
      {displayedText}
      {!isComplete && <span className="animate-pulse">|</span>}
    </p>
  );
}

export function PortfolioInsights({
  insights,
  isVisible,
}: PortfolioInsightsProps) {
  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Delay showing insights until project sections have animated
      const timer = setTimeout(() => {
        setShowInsights(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!showInsights) return null;

  return (
    <section className="py-8 border-t border-border/60">
      <h2 className="text-lg font-medium text-foreground mb-6">
        Portfolio Insights
      </h2>
      <div className="space-y-6">
        {insights.map((insight, index) => (
          <TypewriterParagraph
            key={index}
            text={insight}
            delay={index * 2000}
            speed={4}
          />
        ))}
      </div>
    </section>
  );
}
