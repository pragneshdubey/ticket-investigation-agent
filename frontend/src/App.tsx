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
type RunStatus = "idle" | "running" | "done-human" | "done-auto";

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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ view, setView }: { view: View; setView: (v: View) => void }) {
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
            onClick={() => setView(item.id)}
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

const EXAMPLE_TICKET = "vpn gone again since morning cant access internal tools and deployment is blocked";

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

function DecisionSummary({ runStatus, reviewState, setReviewOpen }: {
  runStatus: RunStatus;
  reviewState: string | null;
  setReviewOpen: (b: boolean) => void;
}) {
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

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Classification */}
      <div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Proposed Classification</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Category", value: "Network", color: "indigo" },
            { label: "Priority", value: "High", color: "red" },
            { label: "Department", value: "IT", color: "zinc" },
            { label: "Duplicate", value: "Found · INC-1042", color: "amber" },
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
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-emerald-400 text-xs">✓</span>
            <span className="text-sm text-zinc-300">Category supported</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-amber-400 text-xs">⚠</span>
            <span className="text-sm text-zinc-300">Priority requires review</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500 italic leading-relaxed">
          "The ticket indicates blocked work, but widespread impact is not confirmed."
        </p>
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
            <p className="text-xs text-zinc-400 mb-3">Verifier disagreement detected — priority classification uncertain</p>

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
            <p className="text-xs text-zinc-400">Route: IT → Software · Ticket INC-1050 assigned</p>
          </div>
        )}
      </div>
    </div>
  );
}

function HumanReviewModal({ onClose, onDecide }: { onClose: () => void; onDecide: (s: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const actions = [
    { id: "confirm", label: "Confirm Decision", desc: "Accept agent proposal: Network / High", color: "emerald" },
    { id: "reassign", label: "Reassign", desc: "Override to: Network / Medium", color: "indigo" },
    { id: "moreinfo", label: "Ask User for More Information", desc: "Request clarification on scope", color: "zinc" },
  ];

  function handleSubmit() {
    if (!selected) return;
    setSubmitted(true);
    const msg = selected === "confirm"
      ? "Human reviewer confirmed: Network / High"
      : selected === "reassign"
      ? "Human reviewer confirmed: Network / Medium"
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
                "vpn gone again since morning cant access internal tools and deployment is blocked"
              </p>
            </div>
          </div>

          {/* Agent proposal */}
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Agent Proposal</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                <p className="text-[10px] text-zinc-600 mb-0.5">Category</p>
                <p className="text-sm text-indigo-400 font-medium">Network</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                <p className="text-[10px] text-zinc-600 mb-0.5">Priority</p>
                <p className="text-sm text-red-400 font-medium">High</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500 italic">
              "The verifier could not confirm that the priority is supported by the available information."
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

function InvestigationScreen() {
  const [ticket, setTicket] = useState(EXAMPLE_TICKET);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [visibleSteps, setVisibleSteps] = useState<number>(0);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewState, setReviewState] = useState<string | null>(null);
  const centerRef = useRef<HTMLDivElement>(null);

  const steps = AGENT_STEPS_HUMAN;

  const STEP_DELAYS = [400, 1000, 1600, 2400, 3100, 3900, 5000, 5700, 6500];
  const ACTIVE_LABELS = [
    "Receiving ticket…",
    "Calling classify_ticket()…",
    "Reading classification result…",
    "Agent evaluating context…",
    "Calling search_duplicate_tickets()…",
    "Parsing search results…",
    "Composing proposed decision…",
    "Running verification…",
    "Analyzing verification result…",
  ];

  function runInvestigation() {
    setRunStatus("running");
    setVisibleSteps(0);
    setActiveLabel(ACTIVE_LABELS[0]);
    setReviewState(null);

    STEP_DELAYS.forEach((delay, i) => {
      setTimeout(() => {
        setActiveLabel(i < ACTIVE_LABELS.length - 1 ? ACTIVE_LABELS[i + 1] : null);
        setVisibleSteps(i + 1);
        if (centerRef.current) {
          centerRef.current.scrollTop = centerRef.current.scrollHeight;
        }
        if (i === steps.length - 1) {
          setTimeout(() => {
            setRunStatus("done-human");
            setActiveLabel(null);
          }, 600);
        }
      }, delay);
    });
  }

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Page header */}
        <div className="px-6 py-4 border-b border-white/[0.06] shrink-0">
          <h1 className="text-base font-semibold text-white">New Ticket Investigation</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Agent-driven triage · classify → search → verify → route</p>
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
              {runStatus === "running" && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-dot" />
                  <span className="text-xs text-indigo-400">Active</span>
                </div>
              )}
              {runStatus !== "idle" && runStatus !== "running" && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-400">Complete</span>
                </div>
              )}
            </div>

            <div ref={centerRef} className="flex-1 overflow-y-auto p-5">
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
              ) : (
                <div>
                  {steps.slice(0, visibleSteps).map((step, i) => (
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
              />
            </div>
          </div>
        </div>
      </div>

      {reviewOpen && (
        <HumanReviewModal
          onClose={() => setReviewOpen(false)}
          onDecide={(msg) => setReviewState(msg)}
        />
      )}
    </>
  );
}

// ─── Open Tickets screen ──────────────────────────────────────────────────────

function OpenTicketsScreen() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-white/[0.06] shrink-0">
        <h1 className="text-base font-semibold text-white">Open Tickets</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Active incidents used for duplicate detection during agent investigation</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
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
              {OPEN_TICKETS.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3.5">
                    <span className="text-indigo-400 text-xs font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {t.id}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-zinc-300 max-w-xs">
                    <span className="line-clamp-1">{t.title}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge label={t.category} color={CATEGORY_COLOR[t.category] ?? "text-zinc-400 bg-zinc-400/10 border-zinc-400/20"} />
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge label={t.priority} color={PRIORITY_COLOR[t.priority]} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-zinc-400">{t.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-zinc-600">{t.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-zinc-700 text-center">
          {OPEN_TICKETS.length} open incidents · Agent searches these when investigating new tickets
        </p>
      </div>
    </div>
  );
}

// ─── Agent Runs screen ────────────────────────────────────────────────────────

function AgentRunsScreen() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-white/[0.06] shrink-0">
        <h1 className="text-base font-semibold text-white">Agent Runs</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Complete execution trace for each investigation</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl">
          {/* Run header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Run</p>
              <p className="text-xl font-semibold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                #A-2048
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] text-zinc-600 mb-0.5">Duration</p>
                <p className="text-xs text-zinc-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>6.4s</p>
              </div>
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-1.5">
                <span className="text-xs text-amber-300 font-medium">Escalated</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="relative">
            {RUN_STEPS.map((step, i) => {
              const isLast = i === RUN_STEPS.length - 1;
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
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("investigation");

  return (
    <div className="h-full flex bg-[#09090b] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar view={view} setView={setView} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {view === "investigation" && <InvestigationScreen />}
        {view === "tickets" && <OpenTicketsScreen />}
        {view === "runs" && <AgentRunsScreen />}
      </main>
    </div>
  );
}
