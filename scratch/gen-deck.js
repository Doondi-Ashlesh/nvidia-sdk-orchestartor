// Generate docs/sdk-orchestrator-experiments.pptx from demo-presentation.md content.
// Run: NODE_PATH="$(npm root -g)" node scratch/gen-deck.js

const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10" × 5.625"
pres.author = "NVIDIA SDK Orchestrator";
pres.title = "SDK Orchestrator — Experimentation Deck";

// ── Palette ────────────────────────────────────────────────────────────────
const GREEN  = "76B900";        // NVIDIA green accent
const NAVY   = "0A1628";        // dark-slate background for cover / section
const SLATE  = "1E293B";        // body text on white
const MUTED  = "64748B";        // captions, secondary
const RULE   = "E2E8F0";        // hairline rules / table borders
const GREY   = "F1F5F9";        // zebra-row fill
const WHITE  = "FFFFFF";

// ── Reusable decorators ───────────────────────────────────────────────────

/**
 * Add the green left-edge accent bar + a small "/ NN" label in the
 * bottom-right to every non-cover slide. Builds visual consistency.
 */
function decorateContentSlide(slide, slideNumber, totalSlides) {
  // Left-edge accent bar (full height)
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.12, h: 5.625,
    fill: { color: GREEN },
    line: { type: "none" },
  });
  // Slide number / total — bottom-right
  slide.addText(`${slideNumber} / ${totalSlides}`, {
    x: 9.0, y: 5.25, w: 0.9, h: 0.3,
    fontSize: 9, fontFace: "Calibri", color: MUTED, align: "right", margin: 0,
  });
  // Thin footer rule
  slide.addShape(pres.shapes.LINE, {
    x: 0.5, y: 5.20, w: 9.0, h: 0,
    line: { color: RULE, width: 0.5 },
  });
  // Quiet project label — bottom-left
  slide.addText("SDK Orchestrator · Experimentation Deck", {
    x: 0.5, y: 5.25, w: 6.5, h: 0.3,
    fontSize: 9, fontFace: "Calibri", color: MUTED, align: "left", margin: 0,
  });
}

/**
 * Add a standard slide title. Pass a `kicker` (like "EXPERIMENT 7") that
 * appears as a small green label above the title.
 */
function addTitle(slide, { kicker, title, subtitle }) {
  if (kicker) {
    slide.addText(kicker.toUpperCase(), {
      x: 0.5, y: 0.35, w: 9.0, h: 0.3,
      fontSize: 10, fontFace: "Calibri", color: GREEN, bold: true,
      charSpacing: 3, align: "left", margin: 0,
    });
  }
  slide.addText(title, {
    x: 0.5, y: kicker ? 0.60 : 0.40, w: 9.0, h: 0.6,
    fontSize: 26, fontFace: "Calibri", color: SLATE, bold: true,
    align: "left", margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: kicker ? 1.15 : 0.95, w: 9.0, h: 0.35,
      fontSize: 13, fontFace: "Calibri", color: MUTED, italic: true,
      align: "left", margin: 0,
    });
  }
}

/**
 * A consistent table helper. Header row in NVIDIA green; zebra body rows.
 */
function addTable(slide, rows, { x = 0.5, y, w = 9.0, colWRatios, fontSize = 11 } = {}) {
  const colCount = rows[0].length;
  const ratios = colWRatios || Array(colCount).fill(1);
  const sumRatios = ratios.reduce((a, b) => a + b, 0);
  const colW = ratios.map((r) => (r / sumRatios) * w);

  const tableRows = rows.map((row, rIdx) => {
    const isHeader = rIdx === 0;
    return row.map((cell) => {
      const text = typeof cell === "string" ? cell : cell.text;
      const options = typeof cell === "object" ? (cell.options || {}) : {};
      const fill = isHeader
        ? { color: GREEN }
        : (rIdx % 2 === 0 ? { color: GREY } : { color: WHITE });
      const color = isHeader ? WHITE : SLATE;
      return {
        text,
        options: {
          fill, color, bold: isHeader, fontSize, fontFace: "Calibri",
          valign: "middle",
          margin: 0.08,
          border: { type: "solid", pt: 0.5, color: RULE },
          ...options,
        },
      };
    });
  });

  slide.addTable(tableRows, { x, y, w, colW, border: { pt: 0.5, color: RULE } });
}

// ── Slide 1: Cover ─────────────────────────────────────────────────────────

function slideCover(totalSlides) {
  const s = pres.addSlide();
  s.background = { color: NAVY };
  // Thin NVIDIA-green rule across the bottom third
  s.addShape(pres.shapes.LINE, {
    x: 0.8, y: 3.9, w: 3.0, h: 0,
    line: { color: GREEN, width: 2 },
  });
  // Kicker
  s.addText("NVIDIA SDK ORCHESTRATOR", {
    x: 0.8, y: 1.8, w: 8.4, h: 0.35,
    fontSize: 11, fontFace: "Calibri", color: GREEN, bold: true,
    charSpacing: 4, align: "left", margin: 0,
  });
  // Title
  s.addText("Experimentation Deck", {
    x: 0.8, y: 2.15, w: 8.4, h: 1.0,
    fontSize: 42, fontFace: "Calibri", color: WHITE, bold: true,
    align: "left", margin: 0,
  });
  // Subtitle
  s.addText("From vague goal to deployable NVIDIA plan.", {
    x: 0.8, y: 3.20, w: 8.4, h: 0.5,
    fontSize: 18, fontFace: "Calibri", color: "CBD5E1", italic: true,
    align: "left", margin: 0,
  });
  // Footer
  s.addText(`21 experiments across Stage 1 → Stage 2 → Stage 3   ·   April 2026`, {
    x: 0.8, y: 4.15, w: 8.4, h: 0.35,
    fontSize: 11, fontFace: "Calibri", color: "94A3B8", align: "left", margin: 0,
  });
  s.addText(`${totalSlides - 1} content slides + summary`, {
    x: 0.8, y: 4.45, w: 8.4, h: 0.3,
    fontSize: 10, fontFace: "Calibri", color: "64748B", align: "left", margin: 0,
  });
}

// ── Content slide builders ─────────────────────────────────────────────────

function slideWhatThisIs(s) {
  addTitle(s, {
    kicker: "What we built",
    title: "From vague product goal to deployable NVIDIA plan.",
    subtitle: "Three grounded stages, one shared model (Nemotron 3 Super 120B), self-hosted on Brev H100s.",
  });

  const cardW = 2.85, cardH = 2.6, cardY = 1.75, gap = 0.15;
  const startX = 0.5;
  const cards = [
    { n: "1", title: "GoalSpec generation", body: "Infer domain, compliance, measurable targets, and requirements the user didn't mention." },
    { n: "2", title: "Service path",        body: "Pick the right NVIDIA services and describe the data flow between them." },
    { n: "3", title: "Notebook generation", body: "Ground on NVIDIA's real AI Blueprints — produce a customized, deployable notebook." },
  ];

  cards.forEach((c, i) => {
    const x = startX + i * (cardW + gap);
    // Card shell
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cardY, w: cardW, h: cardH,
      fill: { color: WHITE }, line: { color: RULE, width: 0.75 },
      shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 135, opacity: 0.08 },
    });
    // Green top accent
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cardY, w: cardW, h: 0.08,
      fill: { color: GREEN }, line: { type: "none" },
    });
    // Numeral
    s.addText(c.n, {
      x: x + 0.25, y: cardY + 0.25, w: 0.8, h: 0.7,
      fontSize: 40, fontFace: "Calibri", color: GREEN, bold: true, align: "left", margin: 0,
    });
    // Title
    s.addText(c.title, {
      x: x + 0.25, y: cardY + 0.95, w: cardW - 0.5, h: 0.5,
      fontSize: 16, fontFace: "Calibri", color: SLATE, bold: true, align: "left", margin: 0,
    });
    // Body
    s.addText(c.body, {
      x: x + 0.25, y: cardY + 1.50, w: cardW - 0.5, h: 1.0,
      fontSize: 12, fontFace: "Calibri", color: SLATE, align: "left", margin: 0,
    });
  });

  // Bottom caption
  s.addText("Why experimentation-first: the model can produce anything. Making it produce the right thing, consistently, is the hard problem.", {
    x: 0.5, y: 4.55, w: 9.0, h: 0.5,
    fontSize: 11, fontFace: "Calibri", color: MUTED, italic: true, align: "left", margin: 0,
  });
}

function slideArcTable(s) {
  addTitle(s, { kicker: "The arc", title: "21 experiments, grouped by the question they answered." });
  addTable(s, [
    ["Group", "Experiments", "Question answered"],
    ["Stage 1 foundations",         "1 – 6",   "What adversary loop config produces the richest GoalSpec?"],
    ["Cross-domain validation",     "7",       "Does one prompt's optimization generalize to ten prompts?"],
    ["Stage 2 breakthrough",        "8",       "Can a 3-sentence prompt beat 13 hard-coded rules?"],
    ["End-to-end quality",          "9",       "Does the whole pipeline hold on diverse real domains?"],
    ["Infrastructure",              "10 – 11", "Does serving provider change output quality, not just latency?"],
    ["Retry-asymmetry thesis",      "13 – 15", "When does a retry loop help vs hurt?"],
    ["Ground-truth self-heal",      "14",      "Can execution errors fix themselves?"],
    ["This session",                "17 – 21", "Does blueprint grounding deliver customized plans?"],
  ], { y: 1.55, colWRatios: [2.2, 1.2, 4.6], fontSize: 11 });
}

function slideExp1to6(s) {
  addTitle(s, {
    kicker: "Experiments 1 – 6",
    title: "Stage 1 exploration — adversary loop variants.",
    subtitle: "Six configurations tested on the same medical RAG prompt.",
  });
  addTable(s, [
    ["#", "Configuration",                               "Latency", "Rounds",  "Finding"],
    ["1", "Baseline: Planner → Adversary → Resolution",  "365 s",   "2 (t/o)", "Works but slow"],
    ["2", "Single-pass self-critique",                   "73 s",    "0",       "5× faster — speed king"],
    ["3", "Asymmetric 49B adversary",                    "315 s",   "2",       "14 % faster, less thorough"],
    ["4", "Domain-template caching",                     "161 s",   "1",       "Approved first pass — quality king"],
    ["5", "Combined cached + asymmetric",                "344 s",   "2",       "Worse than either alone"],
    ["6", "Grounded adversary (cites NVIDIA blueprints)","302 s",   "2",       "Evidence-backed challenges"],
  ], { y: 1.55, colWRatios: [0.4, 3.4, 1.0, 1.0, 3.2], fontSize: 10.5 });
  s.addText('Open question: do any of these actually generalize beyond TC-2? That is Exp 7.', {
    x: 0.5, y: 4.65, w: 9.0, h: 0.4,
    fontSize: 11, fontFace: "Calibri", color: MUTED, italic: true, align: "left", margin: 0,
  });
}

function slideExp7(s) {
  addTitle(s, {
    kicker: "Experiment 7",
    title: "The cross-domain reality check.",
    subtitle: "Plain baseline planner vs. every optimization combined. 10 enterprise use cases.",
  });
  addTable(s, [
    ["Category",                         "Grounded wins", "Baseline wins", "Ties"],
    ["MATCH (blueprint exists)",         "0",             "1",             "2"],
    ["PARTIAL (related blueprints)",     "1",             "2",             "0"],
    ["NOVEL (no blueprint)",             "0",             "2",             "0"],
    ["VAGUE (minimal input)",            "1",             "1",             "0"],
    [{ text: "Total", options: { bold: true } },
     { text: "2",      options: { bold: true, color: SLATE } },
     { text: "6",      options: { bold: true, color: GREEN } },
     { text: "2",      options: { bold: true } }],
  ], { y: 1.55, colWRatios: [3.0, 2.0, 2.0, 2.0], fontSize: 12 });

  // Conclusion callout
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.15, w: 9.0, h: 0.85,
    fill: { color: "F8FAFC" }, line: { color: GREEN, width: 0 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.15, w: 0.1, h: 0.85,
    fill: { color: GREEN }, line: { type: "none" },
  });
  s.addText([
    { text: "Conclusion.  ", options: { bold: true, color: SLATE } },
    { text: "Plain planner beats sophisticated grounded default 6 – 2. Optimizations that worked on one prompt ≠ optimizations that generalize. Ship the simpler thing.", options: { color: SLATE } },
  ], {
    x: 0.75, y: 4.25, w: 8.7, h: 0.65,
    fontSize: 11.5, fontFace: "Calibri", align: "left", margin: 0, valign: "middle",
  });
}

function slideExp8(s) {
  addTitle(s, {
    kicker: "Experiment 8",
    title: "The Stage 2 breakthrough — the data-flow prompt.",
    subtitle: "Replaced 13 hard-coded rules + 7 enforcement steps with 3 sentences.",
  });

  // Quote block
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.55, w: 9.0, h: 0.95,
    fill: { color: "F8FAFC" }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.55, w: 0.1, h: 0.95,
    fill: { color: GREEN }, line: { type: "none" },
  });
  s.addText(
    '"Produce a production-ready path. Describe the DATA FLOW — inputs and outputs for each service. If a service cannot be placed in the data flow, do not include it."',
    {
      x: 0.8, y: 1.62, w: 8.5, h: 0.82,
      fontSize: 12.5, fontFace: "Calibri", italic: true, color: SLATE, align: "left", margin: 0, valign: "middle",
    }
  );

  addTable(s, [
    ["Prompt version",                          "Services (medical RAG)", "Rating"],
    ["13 hard-coded rules",                     "4",                       "4 / 10 (self-censors)"],
    ['"Include ALL services"',                  "18",                      "5 / 10 (kitchen sink)"],
    ['"Scope + justify"',                       "6",                       "8 / 10 (misses evaluator)"],
    [{ text: "Data-flow prompt", options: { bold: true, color: GREEN } },
     { text: "8 – 10",            options: { bold: true } },
     { text: "8.7 / 10 avg across 7 domains", options: { bold: true } }],
  ], { y: 2.75, colWRatios: [3.5, 2.5, 3.0], fontSize: 11 });

  s.addText("Key finding: 120B Nemotron does not need rules — it needs the right framing. Asking for data flow forces architectural reasoning; wrong services get naturally excluded.", {
    x: 0.5, y: 4.70, w: 9.0, h: 0.45,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, italic: true, align: "left", margin: 0,
  });
}

function slideExp9(s) {
  addTitle(s, {
    kicker: "Experiment 9",
    title: "End-to-end validation — three enterprise domains.",
    subtitle: "Full pipeline (GoalSpec → Path → Notebook) on fundamentally different use cases.",
  });
  addTable(s, [
    ["Domain",                                                 "Stage 2 path", "Stage 3 notebook", "Combined"],
    ["Healthcare CDSS (\"help doctors make better decisions\")", "8.5 / 10",     "8 / 10",           "8.25 / 10"],
    ["Banking fraud detection",                                 "8.5 / 10",     "8 / 10",           "8.25 / 10"],
    ["E-commerce recommendations",                              "9 / 10",       "8 / 10",           "8.5 / 10"],
    [{ text: "Average", options: { bold: true } },
     { text: "8.7 / 10", options: { bold: true, color: GREEN } },
     { text: "8.0 / 10", options: { bold: true, color: GREEN } },
     { text: "8.3 / 10", options: { bold: true, color: GREEN } }],
  ], { y: 1.55, colWRatios: [3.6, 2.0, 2.0, 1.4], fontSize: 11 });

  // Two-column: what works / what's inconsistent
  const colY = 3.15, colH = 1.75;
  s.addText("What worked every time", {
    x: 0.5, y: colY, w: 4.4, h: 0.3,
    fontSize: 11.5, fontFace: "Calibri", color: GREEN, bold: true, align: "left", margin: 0,
  });
  s.addText([
    { text: "cuDF API — correct across all domains",               options: { bullet: true, breakLine: true } },
    { text: "mtq.quantize(), RailsConfig.from_path()",             options: { bullet: true, breakLine: true } },
    { text: "tritonclient.http, trtexec with correct flags",       options: { bullet: true, breakLine: true } },
    { text: "Real packages, no hallucinated imports",              options: { bullet: true } },
  ], {
    x: 0.5, y: colY + 0.3, w: 4.4, h: colH,
    fontSize: 10.5, fontFace: "Calibri", color: SLATE, paraSpaceAfter: 3, margin: 0,
  });

  s.addText("What was inconsistent", {
    x: 5.1, y: colY, w: 4.4, h: 0.3,
    fontSize: 11.5, fontFace: "Calibri", color: "C2410C", bold: true, align: "left", margin: 0,
  });
  s.addText([
    { text: "nemo train — fabricated CLI",                         options: { bullet: true, breakLine: true } },
    { text: "NeMo Retriever missed for healthcare occasionally",   options: { bullet: true, breakLine: true } },
    { text: "Stray `}` syntax errors in some code cells",          options: { bullet: true } },
  ], {
    x: 5.1, y: colY + 0.3, w: 4.4, h: colH,
    fontSize: 10.5, fontFace: "Calibri", color: SLATE, paraSpaceAfter: 3, margin: 0,
  });
}

function slideExp10(s) {
  addTitle(s, {
    kicker: "Experiment 10",
    title: "Infrastructure lifts the ceiling.",
    subtitle: "Self-hosted NIM on Brev (2× H100 NVL) vs. NVIDIA hosted shared API.",
  });

  addTable(s, [
    ["Operation",                    "Shared API",  "Brev self-hosted", "Speedup"],
    ["Simple inference",             "~50 s (queue)", "< 1 s",            "50×+"],
    ["GoalSpec draft",               "60 – 90 s",     "15 – 20 s",        "3 – 4×"],
    ["Service path (9 services)",    "80 – 120 s",    "15 – 25 s",        "5×"],
    ["Notebook (1 service)",         "150 s",         "6.6 s",            "23×"],
  ], { y: 1.55, colWRatios: [3.0, 2.0, 2.0, 2.0], fontSize: 11 });

  // Big-stat callouts row
  const statY = 3.55, statH = 1.35;
  const stats = [
    { big: "14",   unit: "goals",        caption: "on Brev from a 3-word input" },
    { big: "5",    unit: "goals",        caption: "on shared API, same input" },
    { big: "3×",   unit: "richer",       caption: "output — shared API silently caps length" },
  ];
  const statW = 2.85, statGap = 0.15;
  stats.forEach((stat, i) => {
    const x = 0.5 + i * (statW + statGap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: statY, w: statW, h: statH,
      fill: { color: NAVY }, line: { type: "none" },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: statY + statH - 0.05, w: statW, h: 0.05,
      fill: { color: GREEN }, line: { type: "none" },
    });
    s.addText([
      { text: stat.big + " ", options: { color: GREEN, bold: true, fontSize: 44 } },
      { text: stat.unit, options: { color: WHITE, fontSize: 16 } },
    ], {
      x: x + 0.2, y: statY + 0.15, w: statW - 0.4, h: 0.7,
      fontFace: "Calibri", align: "left", valign: "middle", margin: 0,
    });
    s.addText(stat.caption, {
      x: x + 0.2, y: statY + 0.85, w: statW - 0.4, h: 0.4,
      fontFace: "Calibri", fontSize: 10, color: "CBD5E1", align: "left", valign: "top", margin: 0,
    });
  });
}

function slideExp11(s) {
  addTitle(s, {
    kicker: "Experiment 11",
    title: "OpenRouter free tier — free ≠ free.",
    subtitle: "Tested as a zero-cost alternative. Fails for notebook generation.",
  });
  addTable(s, [
    ["Stage",                             "Shared NIM",       "OpenRouter (free)"],
    ["GoalSpec",                          "60 – 90 s",        "60 – 90 s (same)"],
    ["Service path",                      "80 – 120 s",       "80 – 120 s (same)"],
    ["Notebook (~30k tokens output)",     "150 – 300 s",      "Connection dropped at 1559 chars"],
  ], { y: 1.65, colWRatios: [3.4, 2.8, 2.8], fontSize: 11.5 });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 3.80, w: 9.0, h: 1.0,
    fill: { color: "FFF7ED" }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 3.80, w: 0.1, h: 1.0,
    fill: { color: "EA580C" }, line: { type: "none" },
  });
  s.addText([
    { text: "Takeaway.  ", options: { bold: true, color: SLATE } },
    { text: "Free tier drops long connections mid-response. Can't ship Stage 3 through it. Both it and the hosted NIM share the same backend for shorter calls — identical latency is the tell.", options: { color: SLATE } },
  ], {
    x: 0.75, y: 3.90, w: 8.7, h: 0.8,
    fontSize: 11.5, fontFace: "Calibri", align: "left", margin: 0, valign: "middle",
  });
}

function slideRetryThesis(s) {
  addTitle(s, {
    kicker: "Experiments 13 – 15",
    title: "The retry-asymmetry thesis.",
    subtitle: "Retry loops help only when the signal is ground truth. Synthetic signals regress quality.",
  });
  addTable(s, [
    ["Stage",                                    "Signal type",                                                       "Result"],
    ["Stage 1 adversary loop",                   "Synthetic (\"what's missing from this spec?\")",                    "Regressed — softened 2s→5s latency, dropped FDA SaMD + SOC 2"],
    ["Stage 2 validator loop",                   "Synthetic (\"does the path look right?\")",                         "Regressed — paths ballooned 8 → 15 services"],
    ["Stage 3 AST / narrative retry",            "Synthetic (\"does the notebook look right?\")",                     "Regressed — 13 cells → 5 cells in 27 min"],
    [{ text: "Stage 3 execution retry (Exp 14)", options: { bold: true } },
     { text: "Ground truth (actual Python traceback)", options: { bold: true, color: GREEN } },
     { text: "Converged — closed 9 bugs → 4 in one iteration", options: { bold: true, color: GREEN } }],
  ], { y: 1.55, colWRatios: [2.6, 3.6, 2.8], fontSize: 10.5 });

  s.addText("Code change driven by this: all three synthetic-signal retry loops removed. Validators kept as observability only — never fed back to the model.", {
    x: 0.5, y: 4.65, w: 9.0, h: 0.45,
    fontSize: 11, fontFace: "Calibri", color: MUTED, italic: true, align: "left", margin: 0,
  });
}

function slideExp14(s) {
  addTitle(s, {
    kicker: "Experiment 14",
    title: "Self-heal works — on ground-truth signals.",
    subtitle: "Execute the notebook on GPU hardware. Feed tracebacks to a fix-cell endpoint. Iterate.",
  });
  addTable(s, [
    ["Iter", "code_ok", "code_error", "Root causes", "Cascades", "Latency"],
    ["1",    "2 / 11",  "9",          "7",           "2",         "137 s"],
    [{ text: "2", options: { bold: true } },
     { text: "7 / 11", options: { bold: true, color: GREEN } },
     { text: "4", options: { bold: true, color: GREEN } },
     { text: "1", options: { bold: true, color: GREEN } },
     { text: "3", options: { bold: true } },
     { text: "77 s", options: { bold: true } }],
  ], { y: 1.55, colWRatios: [0.7, 1.6, 1.6, 1.6, 1.6, 1.9], fontSize: 11.5 });

  s.addText("Bugs closed in one iteration", {
    x: 0.5, y: 2.85, w: 9.0, h: 0.3,
    fontSize: 12, fontFace: "Calibri", color: GREEN, bold: true, align: "left", margin: 0,
  });
  s.addText([
    { text: "subprocess.check_call(..., stdin=\"\"\"...\"\"\") — wrong API",  options: { bullet: true, breakLine: true } },
    { text: "4 × Python syntax errors (unescaped newline, broken line continuation, unterminated strings)", options: { bullet: true, breakLine: true } },
    { text: "protobuf MessageFactory version mismatch — loop diagnosed and fixed",                            options: { bullet: true } },
  ], {
    x: 0.5, y: 3.15, w: 9.0, h: 1.25,
    fontSize: 11, fontFace: "Calibri", color: SLATE, paraSpaceAfter: 3, margin: 0,
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.50, w: 9.0, h: 0.6,
    fill: { color: "FFF7ED" }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.50, w: 0.1, h: 0.6,
    fill: { color: "EA580C" }, line: { type: "none" },
  });
  s.addText([
    { text: "Blocker: ", options: { bold: true, color: SLATE } },
    { text: "server-side Python executor on Brev infrastructure. Highest-ROI open piece — expected grade lift 8.5 → ~9.0 when wired.", options: { color: SLATE } },
  ], {
    x: 0.75, y: 4.55, w: 8.7, h: 0.5,
    fontSize: 11, fontFace: "Calibri", align: "left", margin: 0, valign: "middle",
  });
}

function slideExp15(s) {
  addTitle(s, {
    kicker: "Experiment 15",
    title: "The adversary loop audit on vague prompts.",
    subtitle: "Planner-only vs. planner + adversary loop. Same vague input, measured cost.",
  });

  // P0
  s.addText("P0 · \"chatbot for hospitals\"", {
    x: 0.5, y: 1.55, w: 4.4, h: 0.3,
    fontSize: 12, fontFace: "Calibri", color: GREEN, bold: true, align: "left", margin: 0,
  });
  addTable(s, [
    ["Metric",             "Baseline",          "Loop"],
    ["Latency",            "53 s",              "511 s (9.6× slower)"],
    ["Compliance",         "HIPAA, GDPR, FDA SaMD, SOC 2", "HIPAA, GDPR, HITECH"],
    ["Latency target",     "< 2 s",             "≤ 5 s"],
    ["Accuracy target",    "≥ 90 %",            "≥ 80 %"],
  ], { x: 0.5, y: 1.85, w: 4.4, colWRatios: [1.2, 1.6, 1.6], fontSize: 9.5 });

  // P1
  s.addText("P1 · \"credit card fraud\"", {
    x: 5.1, y: 1.55, w: 4.4, h: 0.3,
    fontSize: 12, fontFace: "Calibri", color: GREEN, bold: true, align: "left", margin: 0,
  });
  addTable(s, [
    ["Metric",            "Baseline",                     "Loop"],
    ["Latency",           "126 s",                        "246 s (2× slower)"],
    ["Throughput target", "≥ 100k tx/s",                  "(dropped entirely)"],
    ["Compliance",        "PCI DSS, GDPR, CCPA, PSD2",    "+AML/KYC, +SOX (irrelevant)"],
    ["Recall target",     "≥ 95 %",                       "≥ 92 %"],
  ], { x: 5.1, y: 1.85, w: 4.4, colWRatios: [1.2, 1.6, 1.6], fontSize: 9.5 });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.45, w: 9.0, h: 0.65,
    fill: { color: "F8FAFC" }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.45, w: 0.1, h: 0.65,
    fill: { color: GREEN }, line: { type: "none" },
  });
  s.addText([
    { text: "Verdict.  ", options: { bold: true, color: SLATE } },
    { text: "Loop trades the user's ambitious targets for breadth. Baseline wins on vague inputs. Made opt-in via ?deep=true.", options: { color: SLATE } },
  ], {
    x: 0.75, y: 4.52, w: 8.7, h: 0.55,
    fontSize: 11, fontFace: "Calibri", align: "left", margin: 0, valign: "middle",
  });
}

function slideSessionDelta(s) {
  addTitle(s, {
    kicker: "This session · Experiments 17 – 21",
    title: "The delta — from 7.0 to 8.5 in one iteration.",
    subtitle: "Detailed-healthcare prompt grade across architectural changes.",
  });
  addTable(s, [
    ["#",  "Change",                                                  "Grade"],
    ["17", "Brev baseline + loop Stage 1 + no in-route retry",        "7.0"],
    ["18", "+ LAYER_ORDER post-sort removed",                         "6.5 (fraud)"],
    ["19", "Blueprint matcher + verbatim return (2 s!)",              "6.5 (wrong target)"],
    ["20", "Blueprint as grounding in LLM prompt",                    "Failed — 4-cell stub"],
    ["20-fix", "+ trimmed ref + JSON directive top & bottom",         "—"],
    ["21a","Blueprint-grounded, vague healthcare",                    "8.0"],
    [{ text: "21b", options: { bold: true } },
     { text: "Blueprint-grounded, detailed healthcare", options: { bold: true, color: GREEN } },
     { text: "8.5 — session best", options: { bold: true, color: GREEN } }],
    ["21c","Blueprint-grounded, detailed fraud",                      "7.5"],
  ], { y: 1.55, colWRatios: [0.7, 5.8, 2.5], fontSize: 10.5 });

  s.addText("+1.5 grade points from two architectural changes: blueprint as grounding reference (not verbatim output), and JSON-only prompt hardening.", {
    x: 0.5, y: 4.65, w: 9.0, h: 0.45,
    fontSize: 11, fontFace: "Calibri", color: MUTED, italic: true, align: "left", margin: 0,
  });
}

function slideBlueprintGrounding(s) {
  addTitle(s, {
    kicker: "Blueprint grounding",
    title: "What it actually produces — same prompt, three approaches.",
    subtitle: '"chatbot for hospitals" — from-scratch vs. verbatim vs. grounded.',
  });
  addTable(s, [
    ["Aspect",           "Exp 17 (from-scratch)",         "Exp 19 (verbatim blueprint)",  "Exp 21a (grounded)"],
    ["Cells",            "20",                             "70",                            "31"],
    ["Latency",          "5:28",                           "2 s (no LLM)",                  "7:15"],
    ["Sample question",  '"What is machine learning?"',    '"What is machine learning?"',   "Clinical triage questions"],
    ["Guardrails",       "Python regex — fake",            "Generic, no HIPAA",             "RailsConfig + HIPAA rails"],
    ["Dataset",          "MedNLI (wrong fit)",             "Sample Wikipedia PDF",          "Multilingual hospital FAQ"],
    ["HIPAA compliance", "Labeled only",                   "Not addressed",                 "Concrete rails per GoalSpec"],
  ], { y: 1.55, colWRatios: [2.0, 2.5, 2.3, 2.2], fontSize: 9.5 });

  s.addText("Real customization — not a sticker. FHIR stub with RxNorm codes, real Triton pbtxt grammar, HMAC-SHA256 audit logging, Kafka integration stubs when the prompt asks for them.", {
    x: 0.5, y: 4.65, w: 9.0, h: 0.45,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, italic: true, align: "left", margin: 0,
  });
}

function slideArchitecturalDecisions(s) {
  addTitle(s, {
    kicker: "What we keep",
    title: "Architectural decisions backed by experiments.",
    subtitle: "Every row cites the experiment that validated it.",
  });
  addTable(s, [
    ["Decision",                                           "Evidence"],
    ["Planner-only Stage 1 by default",                    "Exp 7 (6 – 2 baseline wins) + Exp 15 (loop softens targets)"],
    ["Loop as ?deep=true opt-in",                          "Preserves loop's breadth benefit for detailed prompts"],
    ["Data-flow Stage 2 prompt",                           "Exp 8 (8.7 / 10 vs. 4 / 10 for hard-coded rules)"],
    ["No layer-order sort",                                "Exp 18 (preserves model's data-flow reasoning)"],
    ["No Stage 2 retry on validator signal",               "Exp 13 (paths regress 8 → 15 under retry)"],
    ["No Stage 3 retry on AST / narrative signal",         "Dry-run (13 cells → 5 in 27 min under retry)"],
    ["Blueprint as grounding, not output",                 "Exp 19 vs. Exp 21b (+2 grade points)"],
    ["Brev-hosted NIM for production",                     "Exp 10 (shared API silently caps quality)"],
    ["Validators as observability only",                   "Exp 14 + retry-asymmetry thesis"],
  ], { y: 1.55, colWRatios: [3.6, 5.4], fontSize: 10.5 });
}

function slideGroundingWhereItMatters(s) {
  addTitle(s, {
    kicker: "Honest measurement",
    title: "Where grounding helped — and where it didn't.",
  });

  // Two columns
  const colW = 4.35, colH = 3.4, colY = 1.65;

  // Helped
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: colY, w: colW, h: colH,
    fill: { color: "F0FDF4" }, line: { color: "86EFAC", width: 0.5 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: colY, w: 0.08, h: colH,
    fill: { color: GREEN }, line: { type: "none" },
  });
  s.addText("Delivered genuine lift", {
    x: 0.75, y: colY + 0.15, w: colW - 0.4, h: 0.3,
    fontSize: 13, fontFace: "Calibri", color: SLATE, bold: true, align: "left", margin: 0,
  });
  s.addText([
    { text: "Hospital chatbot: 7.0 → 8.5 with real RailsConfig + FHIR stub", options: { bullet: true, breakLine: true } },
    { text: "Fraud: 6.5 → 7.5 with real Triton pbtxt + current trtexec CLI", options: { bullet: true, breakLine: true } },
    { text: "Eliminated import rapids, deprecated TRT API, malformed pbtxt", options: { bullet: true, breakLine: true } },
    { text: "API correctness floor is now durable across domains",           options: { bullet: true } },
  ], {
    x: 0.75, y: colY + 0.55, w: colW - 0.4, h: colH - 0.7,
    fontSize: 10.5, fontFace: "Calibri", color: SLATE, paraSpaceAfter: 4, margin: 0,
  });

  // Didn't help
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.15, y: colY, w: colW, h: colH,
    fill: { color: "FFF7ED" }, line: { color: "FDBA74", width: 0.5 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.15, y: colY, w: 0.08, h: colH,
    fill: { color: "EA580C" }, line: { type: "none" },
  });
  s.addText("Did not help", {
    x: 5.40, y: colY + 0.15, w: colW - 0.4, h: 0.3,
    fontSize: 13, fontFace: "Calibri", color: SLATE, bold: true, align: "left", margin: 0,
  });
  s.addText([
    { text: "Stage 2 NeMo Retriever drop on vague RAG prompts",   options: { bullet: true, breakLine: true } },
    { text: "Residual pip-package hallucinations (e.g. rapids==24.06)", options: { bullet: true, breakLine: true } },
    { text: "Cell-level syntax errors (garbled line in Model Optimizer cell)", options: { bullet: true, breakLine: true } },
    { text: "All three are candidates for self-heal loop (next work)",     options: { bullet: true } },
  ], {
    x: 5.40, y: colY + 0.55, w: colW - 0.4, h: colH - 0.7,
    fontSize: 10.5, fontFace: "Calibri", color: SLATE, paraSpaceAfter: 4, margin: 0,
  });

  s.addText("Open: does blueprint retrieval at Stage 2 close the Retriever gap? Does a typed service catalog make ordering deterministic? Both untested.", {
    x: 0.5, y: 5.10 - 0.40, w: 9.0, h: 0.4,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, italic: true, align: "left", margin: 0,
  });
}

function slideFiveFindings(s) {
  addTitle(s, {
    kicker: "Key observations",
    title: "Five findings to remember.",
  });

  const findings = [
    { n: "1", headline: "Shared API silently caps output quality.",
      body: "Brev lifts the cap. Same model, same prompt — 3× richer output. Infrastructure ≠ just latency." },
    { n: "2", headline: "Retry-asymmetry thesis.",
      body: "Retry on ground-truth signals converges; retry on synthetic validator signals diverges. Validated at all three stages." },
    { n: "3", headline: "Data-flow prompt beats hard-coded rules.",
      body: "Three sentences outperformed 13 rules + 7 enforcement steps by 4.7 grade points." },
    { n: "4", headline: "Optimizations do not always generalize.",
      body: "A technique that hits 10/10 on one prompt may hit 4/10 on diverse prompts. Cross-domain test suites are not optional." },
    { n: "5", headline: "Blueprint grounding ≠ blueprint substitution.",
      body: "Feeding the blueprint to the LLM as reference produces customized output. Returning it verbatim produces a sticker." },
  ];

  // Tight budget: title ends ~1.3", footer starts at 5.20, so 3.9" available.
  // 5 rows × 0.67 + 4 gaps × 0.06 = 3.59 — fits with margin.
  const startY = 1.45, rowH = 0.67, gap = 0.06;
  findings.forEach((f, i) => {
    const y = startY + i * (rowH + gap);
    // Number badge
    s.addShape(pres.shapes.OVAL, {
      x: 0.5, y: y + 0.1, w: 0.5, h: 0.5,
      fill: { color: GREEN }, line: { type: "none" },
    });
    s.addText(f.n, {
      x: 0.5, y: y + 0.12, w: 0.5, h: 0.48,
      fontSize: 18, fontFace: "Calibri", color: WHITE, bold: true,
      align: "center", valign: "middle", margin: 0,
    });
    // Text
    s.addText([
      { text: f.headline + " ", options: { bold: true, color: SLATE } },
      { text: f.body, options: { color: MUTED } },
    ], {
      x: 1.15, y, w: 8.35, h: rowH,
      fontSize: 11.5, fontFace: "Calibri", align: "left", valign: "middle", margin: 0,
    });
  });
}

function slideContinuedWork(s) {
  addTitle(s, {
    kicker: "Continued work",
    title: "Named failure classes with concrete fixes queued.",
    subtitle: "Not mysteries — measurable work with specific estimates.",
  });

  const rowY = 1.60, rowH = 0.82, gap = 0.08;
  const items = [
    { title: "Self-heal loop on live pipeline",
      status: "Validated in isolation (Exp 14) — closes 7/10 bugs per iteration",
      blocker: "Server-side Python executor on Brev",
      lift: "Expected grade: 8.5 → 9.0" },
    { title: "Stage 2 blueprint-retrieval signal",
      status: "Untested — would pull Retriever into RAG-shaped paths on vague inputs",
      blocker: "Class: vague-input Retriever omission",
      lift: "Estimate: 1 – 2 days" },
    { title: "Typed service catalog (consumes / produces)",
      status: "Designed, not implemented — deterministic ordering + better assembly",
      blocker: "Only \"validator-driven retry\" config that wouldn't regress — signal is ground truth (graph connectivity)",
      lift: "Estimate: 2 – 3 days" },
    { title: "AST validator known-bad-packages",
      status: "List exists — needs rapids==24.06, tritonclientutils, pytorch_modelopt added",
      blocker: "Target class: persistent pip hallucinations",
      lift: "Estimate: few hours" },
  ];

  items.forEach((it, i) => {
    const y = rowY + i * (rowH + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y, w: 9.0, h: rowH,
      fill: { color: "F8FAFC" }, line: { type: "none" },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y, w: 0.08, h: rowH,
      fill: { color: GREEN }, line: { type: "none" },
    });
    s.addText(it.title, {
      x: 0.75, y: y + 0.05, w: 8.5, h: 0.3,
      fontSize: 12, fontFace: "Calibri", color: SLATE, bold: true, align: "left", margin: 0,
    });
    s.addText([
      { text: "Status: ", options: { bold: true, color: SLATE } },
      { text: it.status,    options: { color: MUTED, breakLine: true } },
      { text: "Note: ",   options: { bold: true, color: SLATE } },
      { text: it.blocker + "   ·   " , options: { color: MUTED } },
      { text: it.lift, options: { color: GREEN, bold: true } },
    ], {
      x: 0.75, y: y + 0.32, w: 8.5, h: 0.48,
      fontSize: 9.5, fontFace: "Calibri", align: "left", valign: "top", margin: 0,
    });
  });
}

function slideClosing(s) {
  s.background = { color: NAVY };
  // Accent rule
  s.addShape(pres.shapes.LINE, {
    x: 0.8, y: 2.3, w: 3.0, h: 0,
    line: { color: GREEN, width: 2 },
  });
  s.addText("CLOSING FRAME", {
    x: 0.8, y: 1.95, w: 8.4, h: 0.3,
    fontSize: 11, fontFace: "Calibri", color: GREEN, bold: true, charSpacing: 4, align: "left", margin: 0,
  });
  s.addText([
    { text: 'In one session, from ',              options: { color: WHITE } },
    { text: '"looks tailored, isn\'t actually"',  options: { color: WHITE, italic: true } },
    { text: ' to ',                                options: { color: WHITE } },
    { text: '"genuinely tailored,"',              options: { color: GREEN, bold: true, italic: true } },
    { text: ' with real NVIDIA APIs and real integration stubs.', options: { color: WHITE } },
  ], {
    x: 0.8, y: 2.55, w: 8.4, h: 1.4,
    fontSize: 22, fontFace: "Calibri", align: "left", valign: "top", margin: 0,
  });
  s.addText("The remaining grade points are named, measurable failure classes with concrete fixes queued — not mysteries.", {
    x: 0.8, y: 3.95, w: 8.4, h: 0.7,
    fontSize: 14, fontFace: "Calibri", color: "CBD5E1", italic: true, align: "left", margin: 0,
  });
  s.addText("NVIDIA SDK Orchestrator   ·   April 2026", {
    x: 0.8, y: 5.05, w: 8.4, h: 0.3,
    fontSize: 9, fontFace: "Calibri", color: "64748B", align: "left", margin: 0,
  });
}

// ── Build the deck ─────────────────────────────────────────────────────────

// 19 slides total (1 cover + 17 content + 1 closing)
const TOTAL = 19;

slideCover(TOTAL);

const builders = [
  slideWhatThisIs,            // 2
  slideArcTable,              // 3
  slideExp1to6,               // 4
  slideExp7,                  // 5
  slideExp8,                  // 6
  slideExp9,                  // 7
  slideExp10,                 // 8
  slideExp11,                 // 9
  slideRetryThesis,           // 10
  slideExp14,                 // 11
  slideExp15,                 // 12
  slideSessionDelta,          // 13
  slideBlueprintGrounding,    // 14
  slideArchitecturalDecisions,// 15
  slideGroundingWhereItMatters,//16
  slideFiveFindings,          // 17
  slideContinuedWork,         // 18
];

builders.forEach((build, i) => {
  const slide = pres.addSlide();
  slide.background = { color: WHITE };
  build(slide);
  decorateContentSlide(slide, i + 2, TOTAL);
});

// Closing slide (no content-slide decoration)
const closing = pres.addSlide();
slideClosing(closing);

pres.writeFile({ fileName: "docs/sdk-orchestrator-experiments.pptx" })
  .then((f) => console.log("Wrote:", f))
  .catch((err) => { console.error(err); process.exit(1); });
