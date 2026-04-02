# Skill 03 — EcosystemColumns (Horizontal Column Layout)

**Files:** `components/EcosystemColumns.tsx`, `components/LayerColumn.tsx`, `components/WaveDivider.tsx`

> Replaces: `components/EcosystemGraph.tsx` (React Flow canvas, removed)

---

## What it does

Renders the six NVIDIA stack layers as horizontal columns (left → right: Access → SDK → Framework → Agentic AI → Serving → Enterprise). Each column contains its layer's services as hexagonal nodes. Organic wavy dividers separate columns.

**No React Flow. No drag/pan canvas.** Pure CSS flex layout with Framer Motion animations.

---

## EcosystemColumns.tsx

### Props
```typescript
interface EcosystemColumnsProps {
  mode: AppMode;
  activeWorkflow: Workflow | null;
  activeStepIndex: number;
  onHoverService: (service: Service | null) => void;
  onClickService: (service: Service) => void;
}
```

### Layout
```
[Access col] [wave] [SDK col] [wave] [Framework col] [wave] [Agent col] [wave] [Serving col] [wave] [Enterprise col]
```
Renders by iterating `LAYER_ORDER`. Between each pair of columns, a `WaveDivider` is inserted with `isActive` computed from whether both adjacent columns have at least one workflow node.

### Wave activation logic
```typescript
function isWaveActive(leftLayer: Layer, rightLayer: Layer): boolean {
  if (mode !== 'workflow' || !activeWorkflow) return false;
  const leftHas  = servicesByLayer[leftLayer].some(s => workflowNodeIds.includes(s.id));
  const rightHas = servicesByLayer[rightLayer].some(s => workflowNodeIds.includes(s.id));
  return leftHas && rightHas;
}
```
Waves glow green when both adjacent columns have highlighted workflow nodes, visually showing the "flow" direction.

---

## LayerColumn.tsx

### Column-level dimming
- `initial` mode: entire column fades to `opacity: 0.25`
- `workflow` mode: columns with no workflow nodes fade to `opacity: 0.25`; columns with workflow nodes remain at full opacity
- `explore` mode: all columns at full opacity

The opacity is animated with `transition: { duration: 0.35 }` on the column wrapper.

### Column header
Each column shows:
- Colored dot (layer color with glow box-shadow)
- Layer name (e.g., "Agentic AI")
- Sub-label (e.g., "Orchestrate & deploy agents")
- Bottom border in `layerColor 30%`

### Hex grid
Services within the column are mapped to `ServiceHex` components, stacked vertically with `gap-4`. The column itself scrolls vertically if it has many services.

---

## WaveDivider.tsx

### Implementation
An SVG with a single Bézier-curve path that creates a repeating organic wave:
```svg
M 12 0
C 20 50, 4 50, 12 100
C 20 150, 4 150, 12 200
... (repeats every 100px for 800px total height)
```
`preserveAspectRatio="none"` stretches the path to fill the div height.

Framer Motion animates the `stroke`, `strokeWidth`, and `filter` properties:
- **Inactive**: `stroke: #1e293b`, `strokeWidth: 1`
- **Active**: `stroke: #76b900`, `strokeWidth: 2`, with green `drop-shadow` filter

---

## How to verify

1. **Load app** → 6 columns visible, separated by 5 wavy dividers; all initially dimmed
2. **Click "Explore freely"** → all 6 columns animate to full opacity; wavydividers remain slate
3. **Select "Build an Agentic AI system"** → Agent, Framework, Access, Serving columns highlight; SDK and Enterprise column dims (they have no workflow nodes)
4. **Check wavy dividers** → dividers between active columns glow green; divider between dimmed and active column stays slate
5. **Column header** → colored dot + "Agentic AI" + sublabel visible for agent column
