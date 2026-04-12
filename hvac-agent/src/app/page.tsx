"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Upload, X, FileUp, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MarginGuardPage() {
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleGenerate = () => {
    setIsGenerating(true);
    router.push("/briefing");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map(file => file.name);
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
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
              MarginGuard
            </span>
          </h1>
        </div>

        {/* Tagline */}
        <p
          className={`mt-6 font-[family-name:var(--font-playfair)] text-2xl font-medium tracking-tight text-foreground/80 sm:text-3xl md:text-4xl transition-all duration-700 ease-out delay-200 ${
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

        {/* Upload Button */}
        <div
          className={`mt-10 mb-4 transition-all duration-700 ease-out delay-[350ms] ${
            isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            className="text-muted-foreground bg-white/50 border-border/50 hover:bg-muted/80 rounded-full px-6 h-10 shadow-sm"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Raw Data
          </Button>
        </div>

        {/* Generate Briefing Button */}
        <div
          className={`mt-4 transition-all duration-700 ease-out delay-[400ms] ${
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

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl h-[65vh] min-h-[450px] bg-background/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-border/50 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-border/30 bg-background/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileUp className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Upload Raw Data</h2>
              </div>
              <button 
                onClick={() => setIsUploadOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-all p-2 rounded-full hover:bg-muted"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 p-8 flex flex-col items-center justify-start bg-muted/10 overflow-y-auto">
              <label 
                htmlFor="file-upload"
                className="w-full border-[1.5px] border-dashed border-border/80 rounded-xl flex flex-col items-center justify-center p-8 transition-all hover:border-primary/50 hover:bg-primary/5 group cursor-pointer focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 shrink-0"
              >
                <div className="h-20 w-20 rounded-full bg-background shadow-sm border border-border/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-md transition-all duration-300">
                  <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="text-2xl font-medium tracking-tight mb-2 text-foreground/90">
                  Select predefined parquet files to upload
                </h3>
                <p className="text-base text-muted-foreground text-center max-w-md mb-8">
                  Drag and drop your files here, or click to browse. Only <span className="font-semibold text-foreground/80">.parquet</span> format is supported.
                </p>
                <div className="hidden">
                  <input id="file-upload" type="file" multiple accept=".parquet" onChange={handleFileUpload} />
                </div>
                <Button variant="secondary" className="rounded-full px-8 pointer-events-none">
                  Browse Files
                </Button>
              </label>

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="w-full mt-6 flex flex-col gap-2 shrink-0">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 px-2">Uploaded Files</h4>
                  {uploadedFiles.map((fileName, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-background p-4 rounded-lg border border-border/50 animate-in fade-in slide-in-from-bottom-2">
                      <span className="font-medium text-sm truncate max-w-[80%]">{fileName}</span>
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0 ml-4" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-border/30 bg-background/50 flex justify-end shrink-0">
              <Button onClick={() => setIsUploadOpen(false)} size="lg" className="rounded-full px-8 shadow-md hover:shadow-lg transition-all duration-200">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
