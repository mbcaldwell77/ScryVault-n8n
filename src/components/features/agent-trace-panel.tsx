"use client";

/**
 * Agent Trace Panel
 *
 * Surfaces the "show your work" trace from an Agent SDK run:
 * iterations, tool calls (input + output), self-critiques, and cost.
 *
 * Only renders when the response includes a `data.agent` field — Gemini
 * (n8n) responses don't have this, so the panel stays hidden on those.
 */

import { useState } from "react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { ChevronDown, ChevronRight, Sparkles, Wrench, Brain } from "lucide-react";
import type { AgentToolCall, AgentPathName } from "@/lib/agents";

export interface AgentTrace {
  path: AgentPathName;
  iterations: number;
  tool_calls: AgentToolCall[];
  self_critiques: string[];
}

interface AgentTracePanelProps {
  trace: AgentTrace;
}

export function AgentTracePanel({ trace }: AgentTracePanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <GlassPanel size="sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Agent Reasoning
          </span>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {trace.iterations} {trace.iterations === 1 ? "iteration" : "iterations"}
          </span>
          <span className="text-[10px] text-text-muted/70">
            {trace.tool_calls.length} tool {trace.tool_calls.length === 1 ? "call" : "calls"}
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Self-critiques (model's own thinking) */}
          {trace.self_critiques.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <Brain className="h-3 w-3" />
                Reasoning steps
              </div>
              <div className="space-y-2">
                {trace.self_critiques.map((critique, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-text-muted whitespace-pre-wrap"
                  >
                    <div className="mb-1 text-[10px] font-mono text-text-muted/50">
                      step {i + 1}
                    </div>
                    {critique}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool calls */}
          {trace.tool_calls.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <Wrench className="h-3 w-3" />
                Tool calls
              </div>
              <div className="space-y-2">
                {trace.tool_calls.map((call, i) => (
                  <ToolCallRow key={i} call={call} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Path label */}
          <div className="text-[10px] text-text-muted/60">
            Path: <span className="font-mono">{trace.path}</span>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

function ToolCallRow({ call, index }: { call: AgentToolCall; index: number }) {
  const [expanded, setExpanded] = useState(false);

  // Extract a short status from the output for the collapsed row
  const out = call.output as { passed?: boolean; eligible?: boolean; price_changed?: boolean; error?: string };
  let statusBadge = "";
  let statusColor = "text-text-muted/70";
  if (out?.error) {
    statusBadge = "error";
    statusColor = "text-danger";
  } else if (out?.passed === true) {
    statusBadge = "passed";
    statusColor = "text-accent";
  } else if (out?.passed === false) {
    statusBadge = "violations";
    statusColor = "text-warning";
  } else if (out?.eligible === true) {
    statusBadge = "eligible";
    statusColor = "text-accent";
  } else if (out?.eligible === false) {
    statusBadge = "blocked";
    statusColor = "text-warning";
  } else if (out?.price_changed !== undefined) {
    statusBadge = out.price_changed ? "computed" : "at floor";
    statusColor = out.price_changed ? "text-accent" : "text-warning";
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-mono text-text-muted/50">#{index + 1}</span>
          <span className="font-mono text-text-primary">{call.tool}</span>
          {statusBadge && (
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}>
              {statusBadge}
            </span>
          )}
          <span className="text-[10px] text-text-muted/50">{call.duration_ms}ms</span>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3 py-2 space-y-2">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted/70">
              Input
            </div>
            <pre className="overflow-x-auto rounded-lg bg-white/[0.03] p-2 font-mono text-[11px] text-text-muted">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted/70">
              Output
            </div>
            <pre className="overflow-x-auto rounded-lg bg-white/[0.03] p-2 font-mono text-[11px] text-text-muted">
              {JSON.stringify(call.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
