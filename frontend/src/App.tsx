import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "investigation" | "tickets" | "runs";
type AgentStep = {
  id: string;
  type: "received" | "tool" | "result" | "decision" | "match" | "proposed" | "verification" | "outcome";
  status: "done" | "active" | "pending";
  label: string;
  detail?: string;
  badge?: string;
  matchData?: { id: string; title: string; similarity: number; signals: string[] };
};
type RunStatus = "idle" | "running" | "done-human" | "done-auto" | "error";

type TriageData = {
  ticket_id: string;
  ticket_text: string;
  status: "auto_routed" | "duplicate_linked" | "escalated";
  final_decision: {
    action: "auto_route" | "duplicate_route" | "escalate";
    category?: string;
    priority?: string;
    duplicate_id?: string;
    escalation_reason?: string;
    verification_result?: {
      agreement: boolean;
      reason: string;
    };
  };
  trajectory: Array<{
    step_number: number;
    action: string;
    reason: string;
    input: any;
    output: any;
  }>;
};

// ─── Static data ──────────────────────────────────────────────────────────────

const OPEN_TICKETS = [
  { id: "INC-1042", title: "Corporate VPN connectivity issue affecting engineering", category: "Network", priority: "High", status: "Open", age: "2h ago" },
  { id: "INC-1043", title: "Unable to access GitHub Enterprise", category: "Account Access", priority: "Medium", status: "Open", age: "4h ago" },
  { id: "INC-1044", title: "Laptop not powering on after OS update", category: "Hardware", priority: "High", status: "Open", age: "6h ago" },
  { id: "INC-1045", title: "Slack desktop application crashing on startup", category: "Software", priority: "Medium", status: "Open", age: "8h ago" },
  { id: "INC-1046", title: "Printer offline on 3rd floor", category: "Hardware", priority: "Low", status: "Open", age: "1d ago" },
  { id: "INC-1047", title: "Two-factor authentication not sending SMS", category: "Account Access", priority: "High", status: "Open", age: "1d ago" },
  { id: "INC-1048", title: "WiFi dropping in conference rooms A and B", category: "Network", priority: "Medium", status: "Open", age: "2d ago" },
  { id: "INC-1049", title: "VS Code extension not loading on Windows", category: "Software", priority: "Low", status: "Open", age: "2d ago" },
];

const AGENT_STEPS_HUMAN: AgentStep[] = [
  { id: "s1", type: "received", status: "done", label: "Ticket received" },
  { id: "s2", type: "tool", status: "done", label: "Tool called", badge: "classify_ticket()" },
  { id: "s3", type: "result", status: "done", label: "Classification result", detail: "Category: Network · Priority: High" },
  { id: "s4", type: "decision", status: "done", label: "Agent decision", detail: "\"This issue may be related to an existing VPN incident. Searching for open duplicates.\"" },
  { id: "s5", type: "tool", status: "done", label: "Tool called", badge: "search_duplicate_tickets()" },
  {
    id: "s6", type: "match", status: "done", label: "Possible duplicate found",
    matchData: { id: "INC-1042", title: "Corporate VPN connectivity issue affecting engineering", similarity: 91, signals: ["VPN connection failure", "Internal tools inaccessible", "Engineering workflow affected"] }
  },
  { id: "s7", type: "proposed", status: "done", label: "Proposed decision created", detail: "Route: IT → Network · Confidence: 78%" },
  { id: "s8", type: "verification", status: "done", label: "Verification started", detail: "Checking: category support, priority justification, duplicate confidence" },
  { id: "s9", type: "outcome", status: "done", label: "Verification complete", detail: "⚠ Priority requires review — widespread impact not confirmed" },
];

const AGENT_STEPS_AUTO: AgentStep[] = [
  { id: "s1", type: "received", status: "done", label: "Ticket received" },
  { id: "s2", type: "tool", status: "done", label: "Tool called", badge: "classify_ticket()" },
  { id: "s3", type: "result", status: "done", label: "Classification result", detail: "Category: Software · Priority: Medium" },
  { id: "s4", type: "decision", status: "done", label: "Agent decision", detail: "\"Issue is isolated and well-defined. No duplicate likely. Routing directly.\"" },
  { id: "s5", type: "tool", status: "done", label: "Tool called", badge: "search_duplicate_tickets()" },
  { id: "s6", type: "result", status: "done", label: "No duplicates found", detail: "0 matches above similarity threshold" },
  { id: "s7", type: "proposed", status: "done", label: "Proposed decision created", detail: "Route: IT → Software · Confidence: 94%" },
  { id: "s8", type: "verification", status: "done", label: "Verification passed", detail: "✓ Category supported · ✓ Priority supported · ✓ No duplicate conflict" },
  { id: "s9", type: "outcome", status: "done", label: "Safe to auto-route", detail: "Routed: IT → Software · Ticket ID assigned: INC-1050" },
];

const RUN_STEPS = [
  { type: "input", label: "Input", detail: "\"vpn gone again since morning cant access internal tools and deployment is blocked\"" },
  { type: "action", label: "Agent Action", badge: "classify_ticket()", detail: null },
  { type: "observation", label: "Observation", detail: "Category: Network · Priority: High" },
  { type: "action", label: "Agent Action", badge: "search_duplicate_tickets()", detail: null },
  { type: "observation", label: "Observation", detail: "INC-1042 — similarity: 0.91" },
  { type: "action", label: "Agent Action", badge: "verify_decision()", detail: null },
  { type: "observation", label: "Observation", detail: "Priority not fully supported — impact scope unconfirmed" },
  { type: "action", label: "Final Action", badge: "escalate_to_human()", detail: null },
  { type: "human", label: "Human Decision", detail: "Confirmed: Network / Medium" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  High: "text-red-400 bg-red-400/10 border-red-400/20",
  Medium: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  Low: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
};

const CATEGORY_COLOR: Record<string, string> = {
  Network: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
  "Account Access": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  Hardware: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  Software: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${color}`}>
      {label}
    </span>
  );
}

function MonoBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 text-[11px] font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      <span className="text-indigo-400">⬡</span> {label}
    </span>
  );
}

function transformTrajectoryToSteps(triageData: TriageData): AgentStep[] {
  const steps: AgentStep[] = [
    { id: "s1", type: "received", status: "done", label: "Ticket received" }
  ];

  if (!triageData || !triageData.trajectory || !Array.isArray(triageData.trajectory)) {
    return steps;
  }

  triageData.trajectory.forEach((step, idx) => {
    const baseId = `step-${idx}`;
    if (step.action === "classify_ticket") {
      steps.push({
        id: baseId + "-tool",
        type: "tool",
        status: "done",
        label: "Tool called",
        badge: "classify_ticket()",
      });
      steps.push({
        id: baseId + "-res",
        type: "result",
        status: "done",
        label: "Classification result",
        detail: `Category: ${step.output?.category || "Unassigned"} · Priority: ${step.output?.priority || "Unassigned"}`,
      });
    } else if (step.action === "search_duplicate_tickets") {
      steps.push({
        id: baseId + "-tool",
        type: "tool",
        status: "done",
        label: "Tool called",
        badge: "search_duplicate_tickets()",
      });
      if (step.output?.is_duplicate_found && step.output?.best_match) {
        const bm = step.output.best_match;
        steps.push({
          id: baseId + "-match",
          type: "match",
          status: "done",
          label: "Possible duplicate found",
          matchData: {
            id: bm.id,
            title: bm.text,
            similarity: Math.round((bm.similarity_score || 0.8) * 100),
            signals: [bm.category ? `${bm.category} incident` : "Open incident match"],
          },
        });
      } else {
        steps.push({
          id: baseId + "-res",
          type: "result",
          status: "done",
          label: "No duplicates found",
          detail: "0 matches above similarity threshold (0.80)",
        });
      }
    } else if (step.action === "verify_classification") {
      steps.push({
        id: baseId + "-ver",
        type: "verification",
        status: "done",
        label: step.output?.agreement ? "Verification passed" : "Verification complete",
        detail: step.output?.agreement
          ? "✓ Category supported · ✓ Priority supported · ✓ Explicit evidence confirmed"
          : `⚠ ${step.output?.reason || "Priority/category requires review"}`,
      });
    } else if (step.action === "escalate_to_human") {
      steps.push({
        id: baseId + "-esc",
        type: "outcome",
        status: "done",
        label: "Escalated to human",
        detail: step.reason || step.input?.reason || "Requires human operator review.",
      });
    } else if (step.action === "final_decision") {
      if (triageData.status === "escalated") {
        steps.push({
          id: baseId + "-outcome",
          type: "outcome",
          status: "done",
          label: "Human review required",
          detail: triageData.final_decision?.escalation_reason || step.reason,
        });
      } else {
        steps.push({
          id: baseId + "-outcome",
          type: "outcome",
          status: "done",
          label: "Safe to auto-route",
          detail: `Routed: IT → ${triageData.final_decision?.category || "General"} ${
            triageData.final_decision?.duplicate_id
              ? "· Linked " + triageData.final_decision.duplicate_id
              : ""
          }`,
        });
      }
    }
  });

  return steps;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ view, onSelectNav }: { view: View; onSelectNav: (v: View) => void }) {
  const items: { id: View; label: string; icon: string }[] = [
    { id: "investigation", label: "New Investigation", icon: "◈" },
    { id: "tickets", label: "Open Tickets", icon: "≡" },
    { id: "runs", label: "Agent Runs", icon: "⌥" },
  ];

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-white/[0.06] bg-[#0c0c0f]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-500 flex items-center justify-center">
            <span className="text-white text-[11px] font-bold">R</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">ResolveAI</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectNav(item.id)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all ${
              view === item.id
                ? "bg-white/[0.08] text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            }`}
          >
            <span className="text-[13px] opacity-70">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Status */}
      <div className="px-5 py-4 border-t border-white/[0.06]">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1.5">System Status</p>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
          <span className="text-xs text-zinc-400">Agent Ready</span>
        </div>
      </div>
    </aside>
  );
}

// ─── Investigation screen ─────────────────────────────────────────────────────

const EXAMPLE_TICKET = "My laptop keyboard has stopped working.";

const PREVIEW_TRIAGE_DATA: TriageData = {
  ticket_id: "PREVIEW-001",
  ticket_text: EXAMPLE_TICKET,
  status: "duplicate_linked",
  final_decision: {
    action: "duplicate_route",
    category: "Hardware",
    priority: "Low",
    duplicate_id: "INC-1010",
    escalation_reason: undefined,
    verification_result: {
      agreement: true,
      reason: "Explicit evidence confirms laptop hardware keyboard component issue.",
    },
  },
  trajectory: [
    {
      step_number: 1,
      action: "classify_ticket",
      reason: "Classified based on explicit physical keyboard component reference.",
      input: { text: EXAMPLE_TICKET },
      output: { category: "Hardware", priority: "Low" },
    },
    {
      step_number: 2,
      action: "search_duplicate_tickets",
      reason: "Searching open incidents for hardware keyboard issues.",
      input: { text: EXAMPLE_TICKET },
      output: {
        is_duplicate_found: true,
        best_match: {
          id: "INC-1010",
          text: "Laptop keyboard keys not responding",
          category: "Hardware",
          similarity_score: 0.88,
        },
      },
    },
    {
      step_number: 3,
      action: "verify_classification",
      reason: "Verified explicit evidence for Hardware classification and duplicate link.",
      input: {},
      output: { agreement: true, reason: "Category and priority verified safe." },
    },
    {
      step_number: 4,
      action: "final_decision",
      reason: "Linked to open incident INC-1010.",
      input: {},
      output: { status: "duplicate_linked", duplicate_id: "INC-1010" },
    },
  ],
};

function AgentStepRow({ step, index, visible }: { step: AgentStep; index: number; visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="animate-fade-in-up flex gap-3" style={{ animationDelay: `${index * 20}ms` }}>
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          step.type === "outcome"
            ? "bg-amber-500/20 border border-amber-500/30"
            : "bg-emerald-500/15 border border-emerald-500/25"
        }`}>
          {step.type === "outcome"
            ? <span className="text-amber-400 text-[9px]">⚠</span>
            : <span className="text-emerald-400 text-[9px]">✓</span>}
        </div>
        {index < 8 && <div className="w-px flex-1 mt-1 bg-white/[0.06]" style={{ minHeight: 16 }} />}
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-xs text-zinc-500 mb-1">{step.label}</p>

        {step.badge && <MonoBadge label={step.badge} />}

        {step.detail && (
          <p className={`mt-1.5 text-sm leading-relaxed ${
            step.type === "decision" ? "text-zinc-300 italic" : "text-zinc-400"
          }`}>
            {step.detail}
          </p>
        )}

        {step.matchData && (
          <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Possible Existing Incident</span>
              <span className="text-amber-400 text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {step.matchData.similarity}% match
              </span>
            </div>
            <p className="text-indigo-400 text-xs font-medium mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {step.matchData.id}
            </p>
            <p className="text-zinc-300 text-sm mb-2">{step.matchData.title}</p>
            <div className="space-y-0.5">
              {step.matchData.signals.map((sig) => (
                <div key={sig} className="flex items-center gap-1.5 text-zinc-500 text-xs">
                  <span className="text-amber-500/60">—</span> {sig}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveStep({ label }: { label: string }) {
  return (
    <div className="animate-fade-in-up flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0 mt-0.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse-dot" />
        </div>
      </div>
      <div className="pb-4 flex-1">
        <p className="text-xs text-zinc-500 mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-24 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500/60 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ width: "60%" }} />
          </div>
          <span className="text-xs text-zinc-600">Processing…</span>
        </div>
      </div>
    </div>
  );
}

function DecisionSummary({ runStatus, reviewState, setReviewOpen, triageData, errorMessage, isExamplePreview }: {
  runStatus: RunStatus;
  reviewState: string | null;
  setReviewOpen: (b: boolean) => void;
  triageData: TriageData | null;
  errorMessage: string | null;
  isExamplePreview?: boolean;
}) {
  if (errorMessage) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <span className="text-red-400 text-lg mb-1 block">⚠</span>
          <p className="text-red-300 text-sm font-medium">{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (runStatus === "idle") {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
            <span className="text-zinc-600 text-lg">◈</span>
          </div>
          <p className="text-zinc-600 text-sm">Decision summary will appear here</p>
        </div>
      </div>
    );
  }

  if (runStatus === "running") {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin-slow mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Investigating…</p>
        </div>
      </div>
    );
  }

  const isHuman = runStatus === "done-human";

  const category = triageData?.final_decision?.category || "Unassigned";
  const priority = triageData?.final_decision?.priority || "Unassigned";
  const duplicateId = triageData?.final_decision?.duplicate_id;
  const verResult = triageData?.final_decision?.verification_result;
  const escReason = triageData?.final_decision?.escalation_reason;

  return (
    <div className="space-y-4 animate-fade-in-up">
      {isExamplePreview && (
        <div className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 font-medium flex items-center justify-between">
          <span>EXAMPLE PREVIEW</span>
          <span className="text-zinc-500 font-normal">Static Demo</span>
        </div>
      )}
      {/* Classification */}
      <div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Proposed Classification</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Category", value: category, color: "indigo" },
            { label: "Priority", value: priority, color: priority === "High" ? "red" : priority === "Medium" ? "amber" : "zinc" },
            { label: "Department", value: "IT", color: "zinc" },
            { label: "Duplicate", value: duplicateId ? `Found · ${duplicateId}` : "None found", color: duplicateId ? "amber" : "zinc" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
              <p className="text-[10px] text-zinc-600 mb-1">{label}</p>
              <p className={`text-sm font-medium text-${color === "zinc" ? "zinc-300" : color + "-400"}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Verification */}
      <div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Verification Status</p>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
          {verResult?.agreement ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="text-emerald-400 text-xs">✓</span>
                <span className="text-sm text-zinc-300">Category supported</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="text-emerald-400 text-xs">✓</span>
                <span className="text-sm text-zinc-300">Priority verified</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="text-amber-400 text-xs">⚠</span>
              <span className="text-sm text-zinc-300">Verification issue detected</span>
            </div>
          )}
        </div>
        {verResult?.reason && (
          <p className="mt-2 text-xs text-zinc-500 italic leading-relaxed">
            "{verResult.reason}"
          </p>
        )}
      </div>

      {/* Outcome */}
      <div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Routing Decision</p>
        {isHuman ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-400">⚠</span>
              <span className="text-sm font-semibold text-amber-300 uppercase tracking-wide">Human Review Required</span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">{escReason || "Verifier disagreement detected — priority classification uncertain"}</p>

            {reviewState ? (
              <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <p className="text-xs text-emerald-400">{reviewState}</p>
              </div>
            ) : (
              <button
                onClick={() => setReviewOpen(true)}
                className="w-full py-2 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm font-medium hover:bg-amber-500/20 transition-colors"
              >
                Open Review Panel →
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-emerald-400">✓</span>
              <span className="text-sm font-semibold text-emerald-300 uppercase tracking-wide">Safe to Auto-Route</span>
            </div>
            <p className="text-xs text-zinc-400">Route: IT → {category} {duplicateId ? `· Linked ${duplicateId}` : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function HumanReviewModal({
  ticketText,
  ticketId,
  proposedCategory,
  proposedPriority,
  escalationReason,
  onClose,
  onDecide,
}: {
  ticketText: string;
  ticketId: string;
  proposedCategory: string;
  proposedPriority: string;
  escalationReason: string;
  onClose: () => void;
  onDecide: (s: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const actions = [
    { id: "confirm", label: "Confirm Decision", desc: `Accept agent proposal: ${proposedCategory} / ${proposedPriority}`, color: "emerald" },
    { id: "reassign", label: "Reassign", desc: "Override and reassign to manual queue", color: "indigo" },
    { id: "moreinfo", label: "Ask User for More Information", desc: "Request clarification on ticket scope", color: "zinc" },
  ];

  async function handleSubmit() {
    if (!selected) return;
    setSubmitted(true);
    const actionKey = selected === "moreinfo" ? "ask_more_info" : selected;
    try {
      await fetch(`/api/v3/review/${ticketId || "EVAL-008"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ human_action: actionKey }),
      });
    } catch {
      // Ignore network error in fallback UI
    }
    const msg = selected === "confirm"
      ? `Human reviewer confirmed: ${proposedCategory} / ${proposedPriority}`
      : selected === "reassign"
      ? "Human reviewer override: Ticket reassigned"
      : "Human reviewer requested more information from user.";
    setTimeout(() => { onDecide(msg); onClose(); }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[520px] rounded-xl border border-white/[0.1] bg-[#111114] shadow-2xl animate-fade-in-up">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-400 text-sm">⚠</span>
                <h2 className="text-base font-semibold text-white">Human Review Required</h2>
              </div>
              <p className="text-sm text-zinc-500">The agent could not safely finalize this routing decision.</p>
            </div>
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-lg leading-none transition-colors">×</button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Original ticket */}
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Original Ticket</p>
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
              <p className="text-sm text-zinc-300 italic leading-relaxed">
                "{ticketText}"
              </p>
            </div>
          </div>

          {/* Agent proposal */}
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Agent Proposal</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                <p className="text-[10px] text-zinc-600 mb-0.5">Category</p>
                <p className="text-sm text-indigo-400 font-medium">{proposedCategory}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                <p className="text-[10px] text-zinc-600 mb-0.5">Priority</p>
                <p className="text-sm text-red-400 font-medium">{proposedPriority}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500 italic">
              "{escalationReason}"
            </p>
          </div>

          {/* Actions */}
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Reviewer Action</p>
            <div className="space-y-2">
              {actions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a.id)}
                  className={`w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                    selected === a.id
                      ? "border-indigo-500/50 bg-indigo-500/10"
                      : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border mt-0.5 shrink-0 flex items-center justify-center ${
                    selected === a.id ? "border-indigo-400 bg-indigo-500" : "border-zinc-700"
                  }`}>
                    {selected === a.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{a.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{a.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={!selected || submitted}
            className="w-full py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-400 transition-colors"
          >
            {submitted ? "Submitting…" : "Submit Decision"}
          </button>
        </div>
      </div>
    </div>
  );
}

type InvestigationProps = {
  ticket: string;
  setTicket: (s: string) => void;
  runStatus: RunStatus;
  setRunStatus: (s: RunStatus) => void;
  triageData: TriageData | null;
  setTriageData: (d: TriageData | null) => void;
  isExamplePreview: boolean;
  setIsExamplePreview: (b: boolean) => void;
  errorMessage: string | null;
  setErrorMessage: (s: string | null) => void;
  visibleSteps: number;
  setVisibleSteps: (n: number | ((prev: number) => number)) => void;
  activeLabel: string | null;
  setActiveLabel: (s: string | null) => void;
  reviewOpen: boolean;
  setReviewOpen: (b: boolean) => void;
  reviewState: string | null;
  setReviewState: (s: string | null) => void;
  onResetToPreview: () => void;
};

function InvestigationScreen({
  ticket,
  setTicket,
  runStatus,
  setRunStatus,
  triageData,
  setTriageData,
  isExamplePreview,
  setIsExamplePreview,
  errorMessage,
  setErrorMessage,
  visibleSteps,
  setVisibleSteps,
  activeLabel,
  setActiveLabel,
  reviewOpen,
  setReviewOpen,
  reviewState,
  setReviewState,
  onResetToPreview,
}: InvestigationProps) {
  const centerRef = useRef<HTMLDivElement>(null);

  async function runInvestigation() {
    if (!ticket.trim()) return;

    setIsExamplePreview(false);
    setRunStatus("running");
    setTriageData(null);
    setErrorMessage(null);
    setVisibleSteps(0);
    setActiveLabel("Analyzing IT ticket issue…");
    setReviewState(null);

    try {
      const res = await fetch("/api/v3/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ticket }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to process triage request.`);
      }

      const data: TriageData = await res.json();
      setTriageData(data);

      const dynamicSteps = transformTrajectoryToSteps(data);
      const totalSteps = dynamicSteps.length;

      // Animate steps
      for (let i = 0; i < totalSteps; i++) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        setVisibleSteps(i + 1);
        setActiveLabel(`Processing step ${i + 1} of ${totalSteps}…`);
        if (centerRef.current) {
          centerRef.current.scrollTop = centerRef.current.scrollHeight;
        }
      }

      setActiveLabel(null);

      if (data.status === "escalated") {
        setRunStatus("done-human");
      } else {
        setRunStatus("done-auto");
      }
    } catch {
      setErrorMessage("Unable to connect to ResolveAI backend.");
      setRunStatus("error");
      setActiveLabel(null);
    }
  }

  const currentSteps = triageData ? transformTrajectoryToSteps(triageData) : [];

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Page header */}
        <div className="px-6 py-4 border-b border-white/[0.06] shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">New Ticket Investigation</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Agent-driven triage · classify → search → verify → route</p>
          </div>
          {!isExamplePreview && (
            <button
              onClick={onResetToPreview}
              className="px-3 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-300 font-medium transition-colors flex items-center gap-1.5"
            >
              <span className="text-indigo-400 font-bold">+</span> New Investigation
            </button>
          )}
        </div>

        {/* Three columns */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT: Input */}
          <div className="w-64 shrink-0 border-r border-white/[0.06] flex flex-col p-5 gap-4">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Describe your IT issue</p>
              <textarea
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                placeholder="Describe the issue in plain language…"
                className="w-full h-36 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-3 text-sm text-zinc-300 placeholder-zinc-700 resize-none focus:outline-none focus:border-indigo-500/50 transition-colors leading-relaxed"
              />
            </div>

            <button
              onClick={runInvestigation}
              disabled={runStatus === "running" || !ticket.trim()}
              className="w-full py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {runStatus === "running" ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
                  Investigating…
                </>
              ) : "Investigate Ticket"}
            </button>

            <p className="text-[11px] text-zinc-600 leading-relaxed">
              ResolveAI will analyze the issue, check for similar open tickets, and decide whether it can safely route the request.
            </p>

            {/* Category guide */}
            <div className="mt-auto pt-4 border-t border-white/[0.05]">
              <p className="text-[10px] text-zinc-700 uppercase tracking-widest mb-2">Supported Categories</p>
              <div className="space-y-1">
                {["Account Access", "Hardware", "Network", "Software"].map((c) => (
                  <div key={c} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                    <span className="text-xs text-zinc-600">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER: Agent Activity */}
          <div className="flex-1 flex flex-col border-r border-white/[0.06] min-w-0">
            <div className="px-5 py-3.5 border-b border-white/[0.06] shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-indigo-400 text-sm">◈</span>
                <span className="text-sm font-semibold text-white">Agent Investigation</span>
              </div>
              {isExamplePreview && (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-dot" />
                  <span className="text-[11px] font-medium text-amber-300">EXAMPLE PREVIEW</span>
                </div>
              )}
              {!isExamplePreview && runStatus === "running" && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-dot" />
                  <span className="text-xs text-indigo-400">Active</span>
                </div>
              )}
              {!isExamplePreview && runStatus !== "idle" && runStatus !== "running" && runStatus !== "error" && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-400">Complete</span>
                </div>
              )}
            </div>

            <div ref={centerRef} className="flex-1 overflow-y-auto p-5">
              {isExamplePreview && (
                <div className="mb-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between animate-fade-in-up">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 text-xs">ⓘ</span>
                    <span className="text-xs text-indigo-300 font-medium">Example preview — submit a ticket to run the live agent</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Static Preview</span>
                </div>
              )}
              {runStatus === "idle" ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-xs">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
                      <span className="text-indigo-400 text-xl">◈</span>
                    </div>
                    <p className="text-zinc-400 text-sm font-medium mb-1">Agent on standby</p>
                    <p className="text-zinc-600 text-xs leading-relaxed">Submit a ticket and the agent will classify, search for duplicates, verify, and decide.</p>
                  </div>
                </div>
              ) : errorMessage ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-xs p-5 rounded-xl bg-red-500/10 border border-red-500/20">
                    <span className="text-red-400 text-2xl mb-2 block">⚠</span>
                    <p className="text-red-300 text-sm font-semibold mb-1">Backend Connection Error</p>
                    <p className="text-zinc-400 text-xs">{errorMessage}</p>
                  </div>
                </div>
              ) : (
                <div>
                  {currentSteps.slice(0, visibleSteps).map((step, i) => (
                    <AgentStepRow key={step.id} step={step} index={i} visible={true} />
                  ))}
                  {activeLabel && runStatus === "running" && (
                    <ActiveStep label={activeLabel} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Decision Summary */}
          <div className="w-72 shrink-0 flex flex-col min-w-0">
            <div className="px-5 py-3.5 border-b border-white/[0.06] shrink-0">
              <span className="text-sm font-semibold text-white">Decision Summary</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <DecisionSummary
                runStatus={runStatus}
                reviewState={reviewState}
                setReviewOpen={setReviewOpen}
                triageData={triageData}
                errorMessage={errorMessage}
                isExamplePreview={isExamplePreview}
              />
            </div>
          </div>
        </div>
      </div>

      {reviewOpen && (
        <HumanReviewModal
          ticketText={triageData?.ticket_text || ticket}
          ticketId={triageData?.ticket_id || "EVAL-008"}
          proposedCategory={triageData?.final_decision?.category || "Account Access"}
          proposedPriority={triageData?.final_decision?.priority || "High"}
          escalationReason={triageData?.final_decision?.escalation_reason || "Verifier disagreement detected"}
          onClose={() => setReviewOpen(false)}
          onDecide={(msg) => setReviewState(msg)}
        />
      )}
    </>
  );
}

// ─── Open Tickets screen ──────────────────────────────────────────────────────

type OpenTicketData = {
  ticket_id: string;
  title: string;
  category: string;
  priority: string;
  department: string;
  status: string;
  opened: string;
  duplicate_id?: string;
  linked_count?: number;
};

function OpenTicketsScreen() {
  const [tickets, setTickets] = useState<OpenTicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<OpenTicketData | null>(null);

  useEffect(() => {
    fetch("/api/v3/open-tickets")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch open tickets");
        return res.json();
      })
      .then((data) => {
        setTickets(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  function getStatusStyle(status: string) {
    if (status === "Human Review") return { dot: "bg-amber-400 animate-pulse-dot", text: "text-amber-300 font-medium" };
    if (status === "Completed") return { dot: "bg-emerald-400", text: "text-emerald-300" };
    if (status === "Reassigned") return { dot: "bg-indigo-400", text: "text-indigo-300" };
    if (status === "Waiting for Info") return { dot: "bg-zinc-400", text: "text-zinc-400" };
    return { dot: "bg-emerald-500", text: "text-zinc-400" };
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-white/[0.06] shrink-0">
        <h1 className="text-base font-semibold text-white">Open Tickets</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Active incidents used for duplicate detection during agent investigation</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin-slow" />
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  {["Ticket ID", "Title", "Category", "Priority", "Status", "Opened"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] text-zinc-600 uppercase tracking-widest font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {tickets.map((t) => {
                  const st = getStatusStyle(t.status);
                  return (
                    <tr
                      key={t.ticket_id}
                      onClick={() => setSelectedTicket(t)}
                      className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-indigo-400 text-xs font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {t.ticket_id}
                          </span>
                          {t.linked_count ? (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 text-[10px] font-mono">
                              +{t.linked_count} linked
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-zinc-300 max-w-xs">
                        <span className="line-clamp-1 group-hover:text-white transition-colors">{t.title}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge label={t.category} color={CATEGORY_COLOR[t.category] ?? "text-zinc-400 bg-zinc-400/10 border-zinc-400/20"} />
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge label={t.priority} color={PRIORITY_COLOR[t.priority] ?? "text-zinc-400 bg-zinc-400/10 border-zinc-400/20"} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          <span className={`text-xs ${st.text}`}>{t.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-zinc-600">{t.opened}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-700 text-center">
          {tickets.length} open incidents · Agent searches these when investigating new tickets
        </p>
      </div>

      {/* Ticket detail modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[480px] rounded-xl border border-white/[0.1] bg-[#111114] shadow-2xl p-6 animate-fade-in-up">
            <div className="flex items-start justify-between mb-4 border-b border-white/[0.06] pb-3">
              <div>
                <span className="text-xs text-indigo-400 font-mono font-medium">{selectedTicket.ticket_id}</span>
                <h3 className="text-sm font-semibold text-white mt-1">{selectedTicket.title}</h3>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="text-zinc-600 hover:text-zinc-400 text-lg leading-none transition-colors">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Category</p>
                  <p className="text-sm text-indigo-300 font-medium">{selectedTicket.category}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Priority</p>
                  <p className="text-sm text-red-400 font-medium">{selectedTicket.priority}</p>
                </div>
              </div>
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-zinc-600 mb-0.5">Current Status</p>
                  <p className="text-sm text-zinc-200 font-medium">{selectedTicket.status}</p>
                </div>
                <span className="text-xs text-zinc-500">{selectedTicket.opened}</span>
              </div>
              {selectedTicket.linked_count ? (
                <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-3">
                  <p className="text-xs text-indigo-300">
                    ℹ {selectedTicket.linked_count} duplicate ticket{selectedTicket.linked_count > 1 ? "s" : ""} linked to this master incident during agent triage.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-5 pt-3 border-t border-white/[0.06] flex justify-end">
              <button
                onClick={() => setSelectedTicket(null)}
                className="px-4 py-2 rounded-lg bg-white/[0.06] text-xs text-zinc-300 font-medium hover:bg-white/[0.1] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent Runs screen ────────────────────────────────────────────────────────

type BackendRunStep = {
  step_number: number;
  action: string;
  reason: string;
  input: Record<string, any>;
  output: Record<string, any>;
};

type BackendAgentRun = {
  run_id: string;
  ticket_id: string;
  input: string;
  status: string;
  action: string;
  category?: string;
  priority?: string;
  duration_seconds: number;
  duration_str: string;
  duplicate_id?: string;
  escalation_reason?: string;
  trajectory: BackendRunStep[];
  human_review?: {
    human_action: string;
    status: string;
    reviewer_notes?: string;
    timestamp?: string;
  };
  created_at?: string;
};

// Static fallback run for default initial preview
const PREVIEW_AGENT_RUN: BackendAgentRun = {
  run_id: "A-2048 (PREVIEW)",
  ticket_id: "INC-1010",
  input: "vpn gone again since morning cant access internal tools and deployment is blocked",
  status: "escalated",
  action: "escalate",
  category: "Network",
  priority: "Medium",
  duration_seconds: 6.4,
  duration_str: "6.4s",
  trajectory: [
    {
      step_number: 1,
      action: "classify_ticket",
      reason: "Classified based on corporate VPN accessibility mention.",
      input: { text: "vpn gone again..." },
      output: { category: "Network", priority: "Medium" },
    },
    {
      step_number: 2,
      action: "search_duplicate_tickets",
      reason: "Searched open incidents for VPN connection drops.",
      input: { text: "vpn gone again..." },
      output: {
        is_duplicate_found: true,
        best_match: { id: "INC-1001", similarity_score: 0.82 },
      },
    },
    {
      step_number: 3,
      action: "verify_classification",
      reason: "Verifier checked network logs vs ticket description.",
      input: {},
      output: { agreement: false, reason: "Vague error trace requires human review." },
    },
    {
      step_number: 4,
      action: "escalate_to_human",
      reason: "Verifier disagreement detected. Escalated for human triage.",
      input: {},
      output: { status: "escalated" },
    },
  ],
  human_review: {
    human_action: "confirm",
    status: "Completed",
    reviewer_notes: "Confirmed Network / Medium",
  },
};

function AgentRunsScreen() {
  const [runs, setRuns] = useState<BackendAgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v3/agent-runs")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch agent runs");
        return res.json();
      })
      .then((data: BackendAgentRun[]) => {
        setRuns(data);
        if (data.length > 0) {
          setSelectedRunId(data[0].run_id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeRun = runs.find((r) => r.run_id === selectedRunId) || runs[0] || PREVIEW_AGENT_RUN;

  // Helper to map run status into Figma badge style & text
  function getStatusBadge(run: BackendAgentRun) {
    const st = run.status?.toLowerCase() || "";
    if (st === "completed" || run.human_review?.human_action === "confirm") {
      return { label: "Completed", style: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" };
    }
    if (st === "reassigned") {
      return { label: "Reassigned", style: "border-indigo-500/25 bg-indigo-500/10 text-indigo-300" };
    }
    if (st === "waiting_for_info" || st === "waiting for info") {
      return { label: "Waiting for Info", style: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400" };
    }
    if (st === "auto_routed" || run.action === "auto_route") {
      return { label: "Complete / Routed", style: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" };
    }
    if (st === "duplicate_linked" || run.action === "duplicate_route") {
      return { label: "Duplicate Linked", style: "border-indigo-500/25 bg-indigo-500/10 text-indigo-300" };
    }
    return { label: "Escalated", style: "border-amber-500/25 bg-amber-500/8 text-amber-300" };
  }

  // Helper to build timeline steps from backend run
  function buildTimelineSteps(run: BackendAgentRun) {
    const steps: { type: "input" | "action" | "observation" | "human"; label: string; badge?: string; detail?: string }[] = [];

    // 1. Input step
    steps.push({
      type: "input",
      label: "INPUT",
      detail: `"${run.input}"`,
    });

    // 2. Trajectory steps
    (run.trajectory || []).forEach((step) => {
      if (step.action === "classify_ticket") {
        steps.push({
          type: "action",
          label: "AGENT ACTION",
          badge: "classify_ticket()",
          detail: step.reason,
        });
        if (step.output?.category || step.output?.priority) {
          steps.push({
            type: "observation",
            label: "OBSERVATION",
            detail: `Category: ${step.output.category || "General"} · Priority: ${step.output.priority || "Medium"}`,
          });
        }
      } else if (step.action === "search_duplicate_tickets") {
        steps.push({
          type: "action",
          label: "AGENT ACTION",
          badge: "search_duplicate_tickets()",
          detail: step.reason,
        });
        if (step.output?.is_duplicate_found && step.output?.best_match) {
          const match = step.output.best_match;
          const scorePct = Math.round((match.similarity_score || 0) * 100);
          steps.push({
            type: "observation",
            label: "OBSERVATION",
            detail: `${match.id} — similarity: ${match.similarity_score} (${scorePct}% match)`,
          });
        } else {
          steps.push({
            type: "observation",
            label: "OBSERVATION",
            detail: `No duplicate open incidents found above similarity threshold (${step.output?.threshold_used ?? 0.8})`,
          });
        }
      } else if (step.action === "verify_classification") {
        steps.push({
          type: "action",
          label: "AGENT ACTION",
          badge: "verify_classification()",
          detail: step.reason,
        });
        if (step.output?.agreement !== undefined) {
          steps.push({
            type: "observation",
            label: "OBSERVATION",
            detail: step.output.agreement
              ? "Verifier agreed — Proposed classification supported by ticket text."
              : `Verifier disagreed — ${step.output.reason || "Ambiguous ticket text requires human review."}`,
          });
        }
      } else if (step.action === "escalate_to_human") {
        steps.push({
          type: "human",
          label: "FINAL ACTION",
          badge: "escalate_to_human()",
          detail: step.reason || "Escalated for human triage.",
        });
      } else if (step.action === "final_decision") {
        const dec = step.output || {};
        if (dec.action === "auto_route") {
          steps.push({
            type: "observation",
            label: "FINAL DECISION",
            badge: "auto_route()",
            detail: `Auto-routed incident to ${dec.category || run.category} queue with ${dec.priority || run.priority} priority.`,
          });
        } else if (dec.action === "duplicate_route") {
          steps.push({
            type: "observation",
            label: "FINAL DECISION",
            badge: "duplicate_route()",
            detail: `Linked incident to existing master incident ${dec.duplicate_id || run.duplicate_id}.`,
          });
        }
      } else if (step.action === "human_review") {
        const hr = step.output || {};
        const act = hr.human_action || run.human_review?.human_action || "confirm";
        if (act === "confirm") {
          steps.push({
            type: "human",
            label: "HUMAN DECISION",
            badge: "Confirmed",
            detail: `Confirmed: ${run.category || "General"} / ${run.priority || "Medium"}`,
          });
        } else if (act === "reassign") {
          steps.push({
            type: "human",
            label: "HUMAN DECISION",
            badge: "Reassigned",
            detail: "Reassigned to appropriate queue",
          });
        } else if (act === "ask_more_info") {
          steps.push({
            type: "human",
            label: "HUMAN DECISION",
            badge: "Waiting for Info",
            detail: "Requested additional information from submitter",
          });
        }
      }
    });

    // Check if human review occurred outside step trajectory array
    if (run.human_review && !steps.some((s) => s.label === "HUMAN DECISION")) {
      const act = run.human_review.human_action;
      if (act === "confirm") {
        steps.push({
          type: "human",
          label: "HUMAN DECISION",
          badge: "Confirmed",
          detail: `Confirmed: ${run.category || "General"} / ${run.priority || "Medium"}`,
        });
      } else if (act === "reassign") {
        steps.push({
          type: "human",
          label: "HUMAN DECISION",
          badge: "Reassigned",
          detail: "Reassigned to appropriate queue",
        });
      } else if (act === "ask_more_info") {
        steps.push({
          type: "human",
          label: "HUMAN DECISION",
          badge: "Waiting for Info",
          detail: "Requested additional information from submitter",
        });
      }
    }

    return steps;
  }

  const badgeInfo = getStatusBadge(activeRun);
  const steps = buildTimelineSteps(activeRun);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-white/[0.06] shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Agent Runs</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Complete execution trace for each investigation</p>
        </div>

        {/* Run Selector if multiple runs exist */}
        {runs.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Select Run:</span>
            <select
              value={activeRun.run_id}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-[#18181b] border border-white/[0.1] rounded-lg px-2.5 py-1 text-xs text-indigo-300 font-mono focus:outline-none focus:border-indigo-500/50"
            >
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  #{r.run_id} — {r.ticket_id} ({r.input.slice(0, 25)}...)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin-slow" />
          </div>
        ) : (
          <div className="max-w-xl">
            {/* Run header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Run</p>
                <p className="text-xl font-semibold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  #{activeRun.run_id}
                </p>
                {activeRun.ticket_id && (
                  <span className="text-xs text-indigo-400 font-mono">Ticket: {activeRun.ticket_id}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] text-zinc-600 mb-0.5">Duration</p>
                  <p className="text-xs text-zinc-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {activeRun.duration_str || `${activeRun.duration_seconds || 0}s`}
                  </p>
                </div>
                <div className={`rounded-lg border px-3 py-1.5 ${badgeInfo.style}`}>
                  <span className="text-xs font-medium">{badgeInfo.label}</span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="relative">
              {steps.map((step, i) => {
                const isLast = i === steps.length - 1;
                const typeStyle = {
                  input: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
                  action: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
                  observation: "border-emerald-500/20 bg-emerald-500/8 text-emerald-400",
                  human: "border-amber-500/25 bg-amber-500/8 text-amber-300",
                }[step.type] ?? "border-zinc-700 bg-zinc-800/60 text-zinc-400";

                const dotColor = {
                  input: "bg-zinc-600",
                  action: "bg-indigo-500",
                  observation: "bg-emerald-500",
                  human: "bg-amber-400",
                }[step.type] ?? "bg-zinc-600";

                return (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full mt-3.5 shrink-0 ${dotColor}`} />
                      {!isLast && <div className="w-px flex-1 mt-1 bg-white/[0.05]" style={{ minHeight: 20 }} />}
                    </div>

                    <div className={`flex-1 mb-3 rounded-lg border px-4 py-3 ${typeStyle}`}>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">{step.label}</p>
                        {step.badge && (
                          <span className="text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {step.badge}
                          </span>
                        )}
                      </div>
                      {step.detail && (
                        <p className={`text-sm leading-relaxed ${step.type === "input" ? "italic text-zinc-300" : ""}`}>
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("investigation");

  const [ticket, setTicket] = useState(EXAMPLE_TICKET);
  const [runStatus, setRunStatus] = useState<RunStatus>("done-auto");
  const [triageData, setTriageData] = useState<TriageData | null>(PREVIEW_TRIAGE_DATA);
  const [isExamplePreview, setIsExamplePreview] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [visibleSteps, setVisibleSteps] = useState<number>(4);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState<boolean>(false);
  const [reviewState, setReviewState] = useState<string | null>(null);

  function resetToDefaultPreview() {
    setTicket(EXAMPLE_TICKET);
    setRunStatus("done-auto");
    setTriageData(PREVIEW_TRIAGE_DATA);
    setIsExamplePreview(true);
    setErrorMessage(null);
    setVisibleSteps(4);
    setActiveLabel(null);
    setReviewOpen(false);
    setReviewState(null);
  }

  function handleSelectNav(targetView: View) {
    if (targetView === "investigation") {
      if (view === "investigation") {
        // Clicked "New Investigation" while already on investigation tab -> reset to fresh preview!
        resetToDefaultPreview();
      } else {
        // Navigated back from another view -> preserve current investigation state!
        setView("investigation");
      }
    } else {
      setView(targetView);
    }
  }

  return (
    <div className="h-full flex bg-[#09090b] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar view={view} onSelectNav={handleSelectNav} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {view === "investigation" && (
          <InvestigationScreen
            ticket={ticket}
            setTicket={setTicket}
            runStatus={runStatus}
            setRunStatus={setRunStatus}
            triageData={triageData}
            setTriageData={setTriageData}
            isExamplePreview={isExamplePreview}
            setIsExamplePreview={setIsExamplePreview}
            errorMessage={errorMessage}
            setErrorMessage={setErrorMessage}
            visibleSteps={visibleSteps}
            setVisibleSteps={setVisibleSteps}
            activeLabel={activeLabel}
            setActiveLabel={setActiveLabel}
            reviewOpen={reviewOpen}
            setReviewOpen={setReviewOpen}
            reviewState={reviewState}
            setReviewState={setReviewState}
            onResetToPreview={resetToDefaultPreview}
          />
        )}
        {view === "tickets" && <OpenTicketsScreen />}
        {view === "runs" && <AgentRunsScreen />}
      </main>
    </div>
  );
}
