"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/margin-guard/header";
import { AlertBanner } from "@/components/margin-guard/alert-banner";
import { GenerateBriefingButton } from "@/components/margin-guard/generate-briefing-button";

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
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-8 py-16 md:px-12 md:py-24 lg:py-32">
        {/* Header Section */}
        <div
          className={`transition-all duration-700 ease-out ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <Header />
        </div>

        {/* Alert Banner Section */}
        <div
          className={`mt-16 transition-all duration-700 ease-out delay-150 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <AlertBanner />
        </div>

        {/* Generate Briefing Button */}
        <div
          className={`mt-16 transition-all duration-700 ease-out delay-300 ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <GenerateBriefingButton
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
          />
        </div>
      </div>
    </main>
  );
}
