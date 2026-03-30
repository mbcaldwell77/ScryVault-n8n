"use client";

import { cn } from "@/lib/utils/cn";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50",
        // Variants
        variant === "primary" &&
          "bg-accent text-vault-base hover:bg-accent-dark shadow-lg shadow-accent/20 hover:shadow-accent/30",
        variant === "secondary" &&
          "border border-white/10 bg-white/5 text-text-primary hover:bg-white/10 hover:border-white/20",
        variant === "ghost" &&
          "text-text-muted hover:text-text-primary hover:bg-white/5",
        variant === "danger" &&
          "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20",
        // Sizes
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
