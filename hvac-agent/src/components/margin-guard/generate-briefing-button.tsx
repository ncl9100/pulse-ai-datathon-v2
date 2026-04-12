"use client";

import { Button } from "@/components/ui/button";

interface GenerateBriefingButtonProps {
  isGenerating: boolean;
  onGenerate: () => void;
}

export function GenerateBriefingButton({
  isGenerating,
  onGenerate,
}: GenerateBriefingButtonProps) {

  return (
    <div className="flex justify-center">
      <Button
        size="lg"
        onClick={onGenerate}
        disabled={isGenerating}
        className="relative h-14 min-w-64 text-base font-medium tracking-wide"
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
  );
}
