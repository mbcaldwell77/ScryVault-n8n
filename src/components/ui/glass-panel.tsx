import { cn } from "@/lib/utils/cn";

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  hover?: boolean;
}

export function GlassPanel({
  children,
  className,
  size = "md",
  hover = false,
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/5 bg-vault-surface/60 backdrop-blur-xl shadow-lg",
        size === "sm" && "p-4",
        size === "md" && "p-6",
        size === "lg" && "p-8",
        hover && "transition-all duration-300 hover:border-white/10 hover:bg-vault-surface/80 hover:shadow-accent/5",
        className,
      )}
    >
      {children}
    </div>
  );
}
