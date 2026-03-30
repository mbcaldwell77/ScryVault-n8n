"use client";

import { cn } from "@/lib/utils/cn";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastInput {
  title: string;
  description?: string;
  duration?: number;
  variant?: ToastVariant;
}

interface ToastRecord extends ToastInput {
  id: string;
  duration: number;
  variant: ToastVariant;
}

interface ToastContextValue {
  dismiss: (id: string) => void;
  toast: (input: ToastInput) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

function getToastIcon(variant: ToastVariant) {
  return TOAST_ICONS[variant];
}

function renderToastIcon(variant: ToastVariant, className: string) {
  const IconComponent = getToastIcon(variant);
  return <IconComponent className={className} />;
}

function getToastStyles(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return "border-accent/35 bg-vault-surface/95 text-text-primary shadow-[0_0_32px_rgba(67,213,176,0.18)]";
    case "error":
      return "border-danger/35 bg-vault-surface/95 text-text-primary shadow-[0_0_32px_rgba(239,68,68,0.18)]";
    case "warning":
      return "border-warning/35 bg-vault-surface/95 text-text-primary shadow-[0_0_32px_rgba(245,158,11,0.18)]";
    default:
      return "border-white/15 bg-vault-surface/95 text-text-primary shadow-[0_0_32px_rgba(0,0,0,0.25)]";
  }
}

function getToastIconStyles(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return "text-accent";
    case "error":
      return "text-danger";
    case "warning":
      return "text-warning";
    default:
      return "text-text-muted";
  }
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (toast.duration <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration);

    return () => window.clearTimeout(timeoutId);
  }, [onDismiss, toast.duration, toast.id]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl transition-all duration-200",
        getToastStyles(toast.variant),
      )}
      role="status"
      aria-live="polite"
    >
      {renderToastIcon(
        toast.variant,
        cn("mt-0.5 h-5 w-5 shrink-0", getToastIconStyles(toast.variant)),
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
        {toast.description && (
          <p className="text-sm text-text-muted">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded-lg p-1 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((current) => [
      ...current,
      {
        ...input,
        id,
        duration: input.duration ?? 4000,
        variant: input.variant ?? "info",
      },
    ]);

    return id;
  }, []);

  const value = useMemo(
    () => ({
      dismiss,
      toast,
    }),
    [dismiss, toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toastItem) => (
          <ToastCard key={toastItem.id} toast={toastItem} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
