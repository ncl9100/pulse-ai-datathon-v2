import { Shield } from "lucide-react";

export function Header() {
  return (
    <header className="flex flex-col items-center text-center">
      {/* Logo */}
      <div className="flex items-center gap-4 transition-transform duration-200 ease-out hover:scale-[1.02] cursor-default">
        <Shield className="h-10 w-10 text-muted-foreground md:h-14 md:w-14" />
        <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
          MarginGuard
        </h1>
      </div>
      <p className="mt-4 text-muted-foreground text-base md:text-lg">
        AI-powered margin erosion analysis
      </p>
    </header>
  );
}
