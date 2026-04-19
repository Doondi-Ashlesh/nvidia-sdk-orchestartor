<!-- BEGIN:engineering-philosophy -->
# Engineering Philosophy — Production-Correct, Not Demo-Driven

This project is being built as a lasting product, not a one-time demo. Every
decision should be made from the senior-architect frame: *"does this make the
pipeline correct for any user pasting any goal, or am I optimizing for one
specific run on one specific stage?"*

## Principles (non-negotiable)

1. **Solve the class, not the instance.** If a single notebook has a hallucinated
   import, the fix is to expand the grounding manifest / validator so that
   class of hallucination is caught for every future run — not to hand-patch
   the one output.

2. **Scoring frame:** "is this production-correct?" — not "will this survive
   a demo?" The word "demo" should not appear in decisions about what code
   to write.

3. **Small progress > big staged progress.** A real, durable 0.5 improvement
   is worth more than a cosmetic 2.0 that only holds for one test case.

4. **Validators exist to catch things in production, not to pass a specific
   run.** If a validator lets a bad output through, the validator is wrong —
   not the output.

5. **"Hand-edit this notebook / goalspec / path" is never a fix.** It is a
   hack. Reject it unless the user explicitly asks for that specific action.

6. **Progress is reusable.** An improvement that only helps this goal and
   this domain is not progress — it is a patch. Always generalize.

7. **Honest measurement > optimistic narration.** If the pipeline produced
   output with 6 hallucinated APIs, report that directly. Do not soften it
   with "good enough for the demo" framing. The user can decide scope; it
   is not your place to pre-approve shortcuts.

8. **When naming failure modes, be specific and general.** "Cell 11 used
   `cuml.neural_network.MLPClassifier` which does not exist" is correct.
   "This notebook is bad" is not. The fix follows from the specific naming.

## How this affects concrete decisions

- **When a validator fails to catch something:** the task is "extend the
  validator" — not "avoid demoing that input."
- **When the model hallucinates a specific symbol:** the task is "add that
  symbol (or its module) to a `KNOWN_FAKE` list with a fix hint" so the
  next run catches it deterministically — not "regenerate and hope."
- **When output is structurally good but factually wrong:** the task is
  "add a new validation layer" — not "ship it because the shape is right."
- **When time pressure conflicts with the principle:** say so to the user
  and let them decide. Do not silently adopt a demo-minded shortcut.

## Anti-patterns (things I catch myself doing and need to stop)

- Phrasing output quality as "would be embarrassing in front of senior
  engineers" — this is demo framing.
- Recommending "don't demo this one" instead of "fix the class that made
  this one wrong."
- Scoring output as "X/10 as a shippable deliverable" — the question is
  "X/10 as a product, measured by how many future outputs would it break
  on the same class of failure."
- Proposing to cherry-pick a clean test case to run in front of people.
- Optimizing retry loops for "gets past the demo" rather than "produces
  correct output most of the time across all inputs."

## Reinforced by

- `docs/procedures/00-before-coding.md` — pre-flight checklist
- `docs/procedures/02-validator.md` — validator-layering rules
- `docs/procedures/04-grounding-manifest.md` — how to extend the manifest
  when new hallucination classes are discovered
<!-- END:engineering-philosophy -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
