"use client";

import { cn } from "@/lib/utils/cn";
import { Calendar } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, type, disabled, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const inputRef = useRef<HTMLInputElement>(null);
    const isDateInput = type === "date";

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    function handleDateIconClick(event: React.MouseEvent<HTMLButtonElement>) {
      event.preventDefault();

      if (disabled || !inputRef.current) {
        return;
      }

      inputRef.current.focus();

      const pickerInput = inputRef.current as HTMLInputElement & {
        showPicker?: () => void;
      };

      if (pickerInput.showPicker) {
        pickerInput.showPicker();
        return;
      }

      pickerInput.click();
    }

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-muted"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={inputRef}
            id={inputId}
            type={type}
            disabled={disabled}
            className={cn(
              "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary placeholder:text-text-muted/50 transition-colors duration-200",
              "focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30",
              "hover:border-white/20",
              isDateInput && "pr-11",
              error && "border-danger/50 focus:border-danger focus:ring-danger/30",
              className,
            )}
            {...props}
          />
          {isDateInput && (
            <button
              type="button"
              aria-label="Open calendar"
              onClick={handleDateIconClick}
              disabled={disabled}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-primary opacity-90 transition-opacity duration-200 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Calendar className="h-4 w-4" />
            </button>
          )}
        </div>
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
