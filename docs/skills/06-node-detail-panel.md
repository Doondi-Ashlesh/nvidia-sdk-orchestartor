# Skill 06 — NodeDetailPanel Component

**File:** `components/NodeDetailPanel.tsx`

---

## What it does

A slide-in panel that appears when any graph node is clicked. Displays the service's full official description, a link to the official NVIDIA page, searchable tags, and a list of services it officially connects to. Works alongside WorkflowSidebar without overlapping.

---

## How it works

### Props
```typescript
interface NodeDetailPanelProps {
  service: Service | null;    // null = panel hidden
  allServices: Service[];     // used to resolve connection IDs to names/layers
  onClose: () => void;
  rightOffset?: number;       // pixels from right edge (defaults to 0)
}
```

### Animation
Uses Framer Motion `AnimatePresence` + `key={service.id}` so the panel animates out then back in when switching between nodes:
```typescript
initial={{ x: 40, opacity: 0 }}
animate={{ x: 0, opacity: 1 }}
exit={{ x: 40, opacity: 0 }}
```

### `rightOffset` — avoiding overlap
When `WorkflowSidebar` is open, `page.tsx` passes `rightOffset={320}` (the sidebar's width). The panel shifts left by that amount so both panels are visible simultaneously.

### Panel structure

```
┌─── Header ────────────────────────┐
│  [Layer badge]              [✕]   │
│  Service Name (h2)                │
├─── Body ──────────────────────────┤
│  Full official description (2–3   │
│  sentences, sourced from NVIDIA   │
│  documentation)                   │
│                                   │
│  [Visit official page →]          │
│                                   │
│  Tags                             │
│  [inference] [LLM] [microservice] │
│                                   │
│  Connects to                      │
│  ● NeMo Guardrails    Framework   │
│  ● NVIDIA AI Enterprise Enterprise│
└───────────────────────────────────┘
```

### "Visit official page"
Opens `service.officialUrl` in a new tab. URL points directly to the official NVIDIA product page (e.g., `developer.nvidia.com/nim`). All URLs are verified against official NVIDIA documentation.

### Connected services
Each `service.connections` ID is resolved to its name and layer from `allServices`. Renders with a colored dot matching the **target** service's layer color, so the user can see at a glance what layer each downstream dependency belongs to.

---

## Example — NIM Microservices panel

- **Layer badge**: amber — Serving
- **Name**: NIM Microservices
- **Description**: "A set of optimized cloud-native microservices designed to shorten time-to-market and simplify deployment of generative AI models anywhere..."
- **Official URL**: https://developer.nvidia.com/nim
- **Tags**: inference, LLM, VLM, microservice, containerized, API
- **Connects to**:
  - 🔴 NVIDIA AI Enterprise — Enterprise
  - 🟢 NeMo Guardrails — Framework

---

## How to verify

1. **Click NIM node** → panel slides in with NIM's official description
2. **"Visit official page →"** → opens `https://developer.nvidia.com/nim` in a new tab
3. **Tags** → all render as individual chips
4. **Connects to** → shows "NVIDIA AI Enterprise" (rose dot) and "NeMo Guardrails" (emerald dot)
5. **Click ✕** → panel slides out with exit animation
6. **Click a different node while panel is open** → panel re-animates with new service data (key change triggers exit + enter)
7. **Select a workflow** (WorkflowSidebar opens) **then click a node** → panel appears to the LEFT of the sidebar, no overlap
8. **Click a dimmed (non-workflow) node** → panel still opens and shows correct data
