"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MarginGuardPage() {
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleGenerate = () => {
    setIsGenerating(true);
    router.push("/briefing");
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-orange-50/40 via-white to-purple-50/30">
      {/* Subtle background glow effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-[10%] h-[500px] w-[500px] rounded-full bg-orange-200/20 blur-3xl" />
        <div className="absolute top-[5%] right-[10%] h-[400px] w-[400px] rounded-full bg-purple-200/20 blur-3xl" />
        <div className="absolute bottom-[10%] left-[30%] h-[300px] w-[300px] rounded-full bg-red-100/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-20 text-center">
        {/* Shield icon */}
        <div
          className={`mb-8 transition-all duration-700 ease-out ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <Shield className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
        </div>

        {/* Main title with gradient */}
        <h1
          className={`text-6xl font-extrabold tracking-tight sm:text-7xl md:text-8xl lg:text-9xl transition-all duration-700 ease-out delay-100 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="bg-gradient-to-r from-orange-500 via-red-500 to-purple-600 bg-clip-text text-transparent">
            Margin Guard
          </span>
        </h1>

        {/* Tagline */}
        <p
          className={`mt-6 text-2xl font-medium tracking-tight text-foreground/80 sm:text-3xl md:text-4xl transition-all duration-700 ease-out delay-200 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          A Tool, A Partner, A Future
        </p>

        {/* Description */}
        <p
          className={`mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg transition-all duration-700 ease-out delay-300 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          Transform your HVAC project data into actionable margin insights.
          <br />
          From raw numbers to strategic decisions in one analysis.
        </p>

        {/* Generate Briefing Button */}
        <div
          className={`mt-12 transition-all duration-700 ease-out delay-[400ms] ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="relative h-14 min-w-72 rounded-full text-base font-medium tracking-wide shadow-lg shadow-black/5 transition-all duration-200 hover:shadow-xl hover:shadow-black/10 hover:scale-[1.02]"
          >
            {isGenerating ? (
              <span className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-primary-foreground"></span>
                </span>
                Generating Briefing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Get Started
                <span aria-hidden="true">&rarr;</span>
              </span>
            )}
          </Button>
        </div>

        {/* Decorative waveform at bottom */}
        <div
          className={`mt-24 transition-all duration-1000 ease-out delay-500 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <svg
            width="320"
            height="60"
            viewBox="0 0 320 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-muted-foreground/15"
          >
            {/* Bar chart waveform pattern */}
            {Array.from({ length: 40 }).map((_, i) => {
              const heights = [12, 18, 8, 25, 15, 32, 20, 10, 28, 22, 35, 14, 26, 18, 30, 12, 24, 38, 16, 20, 28, 14, 32, 10, 22, 36, 18, 26, 12, 30, 20, 8, 24, 34, 16, 28, 22, 14, 26, 18];
              const h = heights[i] || 15;
              return (
                <rect
                  key={i}
                  x={i * 8}
                  y={60 - h}
                  width="4"
                  height={h}
                  rx="2"
                  fill="currentColor"
                />
              );
            })}
          </svg>
        </div>
      </div>
    </main>
  );
}
