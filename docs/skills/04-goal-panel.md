# Skill 04 — Sidebar (Unified Left Panel)

**File:** `components/Sidebar.tsx`

> Replaces: `components/GoalPanel.tsx`, `components/Header.tsx`, `components/NodeDetailPanel.tsx`, `components/WorkflowSidebar.tsx`

---

## What it does

The fixed left sidebar that serves as the single control surface for the entire app. It has three distinct views corresponding to the three app modes — all rendered within the same 288px panel. Eliminates the need for multiple floating panels.

---

## Three modes / views

### 1. `initial` — Goal selection

Shows:
- "What are you planning to work on?" question
- Text input with live keyword-matched workflow suggestions
- Divider + "Explore freely" button

**Workflow suggestions** update in real-time as the user types. `matchWorkflows()` from `data/nvidia.ts` does keyword matching. When the input is empty, all 6 workflows are shown. Clicking any workflow card calls `onSelectWorkflow(wf)`, switching to workflow mode.

**Explore freely** calls `onExplore()`, switching to explore mode.

### 2. `workflow` — Step navigator

Shows:
- Workflow goal title + difficulty badge
- NVIDIA green progress bar (fills proportionally to `activeStepIndex / (steps.length - 1)`)
- "Step N of M" counter
- Scrollable step list — each step shows the service name, role, and (for the active step) the full `step.action` text
- Prev/Next navigation buttons
- "← Change goal" link back to initial mode

Step circles are filled with NVIDIA green (#76b900) for completed/active steps, slate for upcoming steps. The active step circle glows.

### 3. `explore` — Service detail

Shows:
- "← Back to goals" link
- When no service is hovered: a centered compass icon with a "hover any service" hint
- When a service is hovered: animated entry showing layer badge, name, official description, "Official docs →" link, tags, and "Connects to" list

The detail panel uses `AnimatePresence` keyed by `hoveredService.id` so switching between services triggers a re-animation rather than an in-place update.

---

## NVIDIA branding

- Background: `#050505` (near-black, matches NVIDIA's site)
- Accent: `#76b900` (NVIDIA green) used on hover states, active steps, CTA buttons
- Font: Barlow (closest open-source match to NVIDIA Sans)
- "Official docs" button: NVIDIA green background, black text — matches NVIDIA's primary button style

---

## How to verify

**Initial mode:**
1. Type "agent" → only "Build an Agentic AI system" appears
2. Type "rag" → only "Build a RAG application" appears
3. Clear input → all 6 workflows shown
4. Click any workflow → sidebar switches to workflow mode; columns react

**Workflow mode:**
1. Progress bar fills as steps advance
2. "Next" at last step → disabled
3. Click a step directly → active step jumps to it
4. "← Change goal" → returns to initial mode; columns un-highlight

**Explore mode:**
1. Hover NGC hexagon → sidebar shows NGC's official description, tags, connections
2. Switch to another hex while sidebar is showing → sidebar re-animates with new data
3. "Official docs" link → opens correct NVIDIA URL in new tab
4. "← Back to goals" → returns to initial mode
