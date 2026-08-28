Design a modern, clean, professional web application UI called “ResolveAI”.

ResolveAI is an agentic IT support ticket triage system for a hypothetical 200-person software company.

The application is NOT a full helpdesk or enterprise ticket management dashboard. The main purpose is to demonstrate an AI agent that takes an unstructured IT support ticket, decides which tools to use, checks for duplicate open tickets, verifies its classification, and either auto-routes the ticket or escalates it to a human reviewer.

Design a polished desktop-first web application with a modern AI SaaS aesthetic.

========================================
CORE PRODUCT FLOW
========================================

The user submits a raw IT support complaint.

Example:

“vpn gone again since morning cant access internal tools and deployment is blocked”

The ResolveAI agent then:

1. Classifies the ticket
2. Identifies:
   - Category
   - Priority
3. Decides whether to search for duplicate open tickets
4. Searches existing open tickets when needed
5. Proposes a routing decision
6. Sends the decision to a verification step
7. Either:
   - Auto-routes the ticket
   - Or escalates it to a human for review

The UI should make this entire reasoning and decision process visually understandable.

========================================
LOCKED PRODUCT SCOPE
========================================

Only support IT tickets.

Categories:
- Account Access
- Hardware
- Network
- Software

Priorities:
- Low
- Medium
- High

There are no other departments.
Do not include HR, Finance, Customer Support, or Critical priority.

Do not add:
- Voice input
- OCR
- Screenshot upload
- WebSockets
- Real-time monitoring
- Complex analytics dashboards
- Extra AI agents
- Full ticket management features

Keep the interface focused on the agentic ticket triage workflow.

========================================
MAIN SCREEN / PRIMARY EXPERIENCE
========================================

Create a main workspace called:

“New Ticket Investigation”

Use a three-column layout.

LEFT COLUMN:
A ticket input area.

Header:
“Describe your IT issue”

Include a large text input box where a user can enter an unstructured complaint.

Use realistic example text:

“vpn gone again since morning cant access internal tools and deployment is blocked”

Below the input, include a primary button:

“Investigate Ticket”

Also include a small subtitle:

“ResolveAI will analyze the issue, check for similar open tickets, and decide whether it can safely route the request.”

Keep this area simple and focused.

----------------------------------------

CENTER COLUMN:
This is the most important section.

Create an “Agent Activity” or “Agent Investigation” panel.

Visually show the AI agent performing steps in sequence.

Example:

Agent Investigation

✓ Ticket received

✓ Tool used: classify_ticket()

Result:
Category: Network
Priority: High

✓ Agent decision:
“This issue may be related to an existing VPN incident.”

✓ Tool used: search_duplicate_tickets()

Searching open tickets...

Possible match found:
INC-1042
“Corporate VPN connectivity issue affecting engineering”

Similarity:
91%

✓ Proposed decision created

✓ Verification started

The activity should look like a clear agent trajectory, not hidden chain-of-thought.

Do NOT display private chain-of-thought or detailed internal reasoning.
Instead show concise action summaries, tool calls, observations, and decisions.

Use a visual timeline with:
- Tool icons
- Check marks
- Active processing states
- Connecting lines
- Clear progression

The user should immediately understand:

The agent is actively choosing tools and investigating before making a decision.

----------------------------------------

RIGHT COLUMN:
Create a “Decision Summary” card.

Show:

PROPOSED CLASSIFICATION

Category
Network

Priority
High

Department
IT

Duplicate Status
Possible duplicate found

Then include a Verification section.

Example:

Verification Status

✓ Category supported

⚠ Priority requires review

Reason:
“The ticket indicates blocked work, but widespread impact is not confirmed.”

Then show the final outcome.

For an auto-routed example:

✓ SAFE TO AUTO-ROUTE

Route:
IT → Network

For an uncertain example:

⚠ HUMAN REVIEW REQUIRED

Reason:
“Verifier disagreement detected”

Include a visually clear status distinction between:

AUTO-ROUTED
and
HUMAN REVIEW REQUIRED

========================================
HUMAN REVIEW SCREEN / STATE
========================================

Design a human-in-the-loop review modal or dedicated screen.

Header:

“Human Review Required”

Subtitle:

“The agent could not safely finalize this routing decision.”

Show the original ticket prominently.

Example:

“nothing is working and I cant do my work”

Then show:

Agent Proposal

Category:
Network

Priority:
High

Reason for escalation:
“The verifier could not confirm that the priority is supported by the available information.”

Provide exactly three actions:

1. Confirm Decision
2. Reassign
3. Ask User for More Information

The human reviewer interaction should feel like a real decision point, not just a status label.

After the reviewer makes a choice, show a small activity entry:

Human reviewer confirmed:
Network / Medium

or:

Human reviewer requested more information.

========================================
DUPLICATE TICKET EXPERIENCE
========================================

Create a state where the agent finds a possible duplicate.

Show a card:

Possible Existing Incident

INC-1042

Corporate VPN connectivity issue affecting engineering teams

Status:
Open

Similarity:
91%

Matched signals:
- VPN connection failure
- Internal tools inaccessible
- Engineering workflow affected

Do not make this look like an automatic decision.

Show that the agent uses this evidence before deciding whether to route or escalate.

========================================
VERIFICATION EXPERIENCE
========================================

Create a clear verification component.

Title:

“Decision Verification”

Show a comparison between:

Agent Proposal

and

Verification Result

Example:

Agent Proposal:
Network / High

Verifier:
Category supported
Priority partially supported

Final action:
Human Review Required

Use a clean comparison layout.

Do not create a complicated multi-agent diagram.

The UI should communicate that the system has a verification step after the initial agent decision.

========================================
OPTIONAL SECONDARY SCREEN
========================================

Create a lightweight “Open Tickets” screen.

This is NOT a full dashboard.

Show only 5–10 seeded open IT tickets used for duplicate detection.

Example rows:

INC-1042
Corporate VPN connectivity issue
Network
High
Open

INC-1043
Unable to access GitHub Enterprise
Account Access
Medium
Open

INC-1044
Laptop not powering on
Hardware
High
Open

INC-1045
Slack desktop application crashing
Software
Medium
Open

The purpose of this screen is to visually support the duplicate search feature.

Keep it minimal.

========================================
OPTIONAL AGENT TRAJECTORY SCREEN
========================================

Create a clean “Run Details” screen showing one complete agent execution.

Example:

Run #A-2048

Input
↓
Agent Action
classify_ticket()

Observation
Network / High

Agent Action
search_duplicate_tickets()

Observation
INC-1042 similarity: 0.91

Agent Action
Verification

Observation
Priority not fully supported

Final Action
escalate_to_human()

Human Decision
Confirmed: Network / Medium

Use a vertical timeline.

This should look polished enough to be shown in a hackathon demo video.

========================================
DESIGN STYLE
========================================

Style:
Modern AI SaaS application.

Visual personality:
- Professional
- Minimal
- Intelligent
- Technical
- Trustworthy
- Not overly futuristic
- Not overly corporate

Use:
- Clean whitespace
- Rounded cards
- Subtle borders
- Soft shadows
- Clear visual hierarchy
- Modern typography
- Minimal icons
- Status badges
- Timeline components

Suggested visual direction:
A refined combination of Linear, Vercel, Stripe Dashboard, and modern AI developer tools.

Use a neutral light background with subtle dark text.

Use accent colors sparingly for:
- Active agent processing
- Successful verification
- Warning / human review

Do not make the interface overly colorful.

========================================
NAVIGATION
========================================

Simple left sidebar:

ResolveAI logo

Navigation:

New Investigation
Open Tickets
Agent Runs

At the bottom:

System Status
● Agent Ready

Do not add unnecessary pages such as:
Analytics
Settings
Billing
Team Management
Integrations
Notifications

========================================
KEY DESIGN PRINCIPLE
========================================

The UI must visually communicate the core idea:

“Investigate before you route.”

The agent should feel like it is actively investigating a ticket by choosing tools, gathering evidence, checking for duplicate incidents, and verifying its decision.

The main screen should be optimized for a hackathon demo.

A viewer should understand the complete workflow within 10 seconds:

RAW TICKET
→ AGENT INVESTIGATES
→ TOOL CALLS
→ DUPLICATE CHECK
→ VERIFICATION
→ AUTO-ROUTE OR HUMAN REVIEW

Focus on this flow rather than building a feature-heavy helpdesk application.

Create high-fidelity desktop web screens with consistent components and realistic sample data.