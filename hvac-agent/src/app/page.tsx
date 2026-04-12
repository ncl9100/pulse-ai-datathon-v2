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
        {/* Main title with shield + gradient */}
        <div
          className={`group flex cursor-default items-center justify-center gap-4 transition-all duration-700 ease-out delay-100 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Shield className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-muted-foreground/50 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-[-6deg]" strokeWidth={1.5} />
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl transition-transform duration-300 ease-out group-hover:scale-[1.02]">
            <span className="bg-gradient-to-r from-orange-500 via-red-500 to-purple-600 bg-clip-text text-transparent">
              Margin Guard
            </span>
          </h1>
        </div>

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
              "Generate Briefing"
            )}
          </Button>
        </div>

      </div>
    </main>
  );
}
