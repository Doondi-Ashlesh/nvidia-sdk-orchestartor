# Skill 07 — Main Page Wiring

**File:** `app/page.tsx`

---

## What it does

The root page orchestrates all state and renders the two-panel layout: left `Sidebar` + right `EcosystemColumns`. No business logic lives here — it wires callbacks and passes state down.

---

## State

```typescript
const [mode, setMode] = useState<AppMode>('initial');
// 'initial' | 'explore' | 'workflow'

const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
const [activeStepIndex, setActiveStepIndex] = useState(0);
const [hoveredService, setHoveredService] = useState<Service | null>(null);
```

The `mode` value drives:
- Sidebar panel view
- Column opacity
- Hexagon highlight/dim state
- Wave divider glow

---

## Event handlers

| Handler | Triggered by | Effect |
|---|---|---|
| `handleSelectWorkflow(wf)` | Sidebar workflow card click | Sets workflow + step 0, mode → 'workflow' |
| `handleExplore()` | "Explore freely" button | Clears workflow, mode → 'explore' |
| `handleExitWorkflow()` | Sidebar ✕ button | Clears workflow, mode → 'initial' |
| `handleBackToInitial()` | "← Change goal" / "← Back" | Resets all state, mode → 'initial' |
| `handleStepChange(i)` | Sidebar Prev/Next/step click | Updates `activeStepIndex` |
| `handleHoverService(s\|null)` | ServiceHex hover (explore only) | Updates `hoveredService` → shown in sidebar |
| `handleClickService(s)` | ServiceHex click | Explore: opens official URL. Workflow: jumps to step |

---

## Layout

```
┌─── Sidebar (fixed left, 288px, z-30) ─────────────────────────────┐
│ NVIDIA branding                                                     │
│ [Initial / Workflow / Explore view]                                 │
│ footer                                                              │
└────────────────────────────────────────────────────────────────────┘
┌─── Main (flex-1, ml-72) ───────────────────────────────────────────┐
│ ┌─ Top bar (h-14) ─────────────────────────────────────────────┐   │
│ │ Status text          │     Layer legend (xl+ only)           │   │
│ └──────────────────────────────────────────────────────────────┘   │
│ ┌─ EcosystemColumns (flex-1, overflow-x-auto) ─────────────────┐   │
│ │ [wave][Access][wave][SDK][wave][Framework][wave][Agent]...    │   │
│ └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

The top bar text updates based on `mode`:
- Initial: "Select a goal on the left or explore all services"
- Explore: "Hover any service for details, click to open official docs"
- Workflow: Shows active workflow goal + navigation hint

---

## Hover guard

`handleHoverService` is a no-op in non-explore modes:
```typescript
const handleHoverService = useCallback((service: Service | null) => {
  if (mode === 'explore') setHoveredService(service);
}, [mode]);
```
This prevents sidebar flicker when mousing over hexagons in workflow or initial mode.

---

## How to verify (end-to-end)

1. **Load** → all 6 columns dim; sidebar shows question + 6 workflow suggestions
2. **Type "agent"** → only "Build an Agentic AI system" shown; click it → 6 hexagons highlight across columns; 12 dim; waves glow between active columns
3. **Click "Next" 5 times** → active step badge moves through each hexagon; sidebar action text updates
4. **Click a dimmed hexagon in workflow mode** → nothing (correctly ignored)
5. **Exit workflow** → sidebar returns to initial; columns restore to uniform dim
6. **"Explore freely"** → all columns light up; hover NGC → sidebar shows NGC official description
7. **Click NGC in explore mode** → opens catalog.ngc.nvidia.com in new tab
8. **"← Back to goals"** → app returns to initial state
9. **`npm run build`** → zero TypeScript errors
