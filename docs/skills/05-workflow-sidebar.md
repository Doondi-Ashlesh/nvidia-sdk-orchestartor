# Skill 05 — WorkflowSidebar Component

**File:** `components/WorkflowSidebar.tsx`

---

## What it does

A step-by-step guide that slides in from the right when a user selects a workflow goal. Shows each NVIDIA service in the path, its official role, and a concrete action to take. Navigation buttons walk through the steps while the graph camera pans to each node.

---

## How it works

### Props
```typescript
interface WorkflowSidebarProps {
  workflow: Workflow;
  services: Service[];      // full NVIDIA_SERVICES list for name/layer lookup
  activeStepIndex: number;
  onStepChange: (index: number) => void;
  onExit: () => void;
}
```

### Animation
Slides in from the right with Framer Motion spring:
```typescript
initial={{ x: '100%' }}
animate={{ x: 0 }}
exit={{ x: '100%' }}
```

### Structure
```
┌─── Header ────────────────────────┐
│  [Difficulty badge]               │
│  Workflow goal title     [✕ Exit] │
│  ██████░░░░  progress bar         │
│  Step 2 of 5                      │
├─── Step list (scrollable) ────────┤
│  ●  NVIDIA Brev                   │  ← completed
│     Access · GPU provisioning     │
│  ●  NGC Catalog                   │  ← active (highlighted bg + colored border)
│     Access · Model registry       │
│     [action text expanded here]   │
│  ○  NeMo Curator                  │  ← upcoming
│  ○  NVIDIA NeMo                   │
│  ○  NIM Microservices             │
├─── Footer ────────────────────────┤
│  [← Prev]  [Next step →]          │
└───────────────────────────────────┘
```

### Step number circles
- **Completed** (idx < activeStepIndex): filled with layer color, dark number
- **Active** (idx === activeStepIndex): filled + pulsing ring in layer color
- **Upcoming** (idx > activeStepIndex): slate background, muted number

### Action text expansion
Only the active step shows the `step.action` text (expanded below the step info). This keeps the sidebar compact while giving full detail for the current task.

### Progress bar
```
width = (activeStepIndex / (steps.length - 1)) * 100 + '%'
```
Animated with Framer Motion for smooth fill transitions. Color: NVIDIA green gradient (#76b900 → #a3e635).

### Navigation buttons
- **Prev**: disabled at index 0
- **Next step**: disabled at last step; styled with NVIDIA green background

---

## Example — "Fine-tune an LLM" at step 2 (NeMo Curator)

- Progress bar: 25% filled
- "Step 2 of 5"
- Step 1 (brev): completed circle, no action shown
- Step 2 (nemo-curator): active — emerald border, expanded action:
  > "Use NeMo Curator to clean, filter, and prepare your domain-specific training dataset. Remove low-quality content and format data into the structure NeMo expects."
- Steps 3–5: upcoming, outlined circles

---

## How to verify

1. **Select "Fine-tune an LLM"** → sidebar slides in from right; shows 5 steps with "NVIDIA Brev" first
2. **Step circles** → step 1 is active (pulsing); steps 2–5 are upcoming
3. **Action text** → only step 1's action is visible
4. **Click "Next step"** → step 2 becomes active; graph pans to NGC Catalog node; action text updates
5. **Click step 5 directly** → jumps to step 5; prev steps show filled (completed) circles
6. **"← Prev" at step 1** → button is disabled
7. **"Next step" at step 5** → button is disabled
8. **"✕ Exit"** → sidebar slides out; graph resets to full opacity
