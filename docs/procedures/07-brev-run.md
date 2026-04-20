# 07 — Brev Run

Invoked when you provision a Brev instance and want to run the self-improvement
orchestrator against real GPUs.

## Before you start

You need:
- A Brev account with a GPU instance (A100 or H100 — T4 may work for CPU-side verification of cell 3)
- The instance running, SSH accessible
- Python 3.10+ on the instance

## Step 1 — Provision and launch

```bash
# On brev.dev: pick a Launchable with "PyTorch + CUDA 12.1"
# (or a fresh Ubuntu 22.04 instance, and install the NVIDIA container toolkit)

# After the instance is running, note its public IP or Brev-provided URL.
```

## Step 2 — Install the NVIDIA Python stack

On the Brev instance terminal:

```bash
pip install --upgrade pip

# RAPIDS (cuDF, cuML, cuGraph) — the Linux + CUDA 12.x pip path
pip install cudf-cu12 cuml-cu12 cugraph-cu12 \
  --extra-index-url=https://pypi.nvidia.com

# PyTorch with CUDA 12.1
pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cu121

# Inference
pip install tensorrt tritonclient[all]

# Jupyter + execution stack
pip install nbclient nbformat jupyter

# ML misc
pip install scikit-learn xgboost lightgbm datasets

# Optional (depending on notebook content)
pip install nvidia-modelopt
```

Verify GPU is visible:

```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
```

## Step 3 — Clone the repo on the instance

```bash
cd ~
git clone https://github.com/Doondi-Ashlesh/nvidia-ecosystem-visualizer.git
cd nvidia-ecosystem-visualizer
git checkout feat/grounded-notebook-pipeline
```

Copy your `.env.local` over (contains `NVIDIA_API_KEY`):

```bash
# from your laptop
scp .env.local brev-host:~/nvidia-ecosystem-visualizer/
```

## Step 4 — Start the Next.js server on the Brev instance

```bash
cd ~/nvidia-ecosystem-visualizer
npm install
npm run build            # sanity check build
LLM_SAVE_FIXTURES=1 npm run dev
```

Leave this running. The server exposes the fix-pass route at
`http://localhost:3000/api/fix-notebook-cell`.

## Step 5 — Run the orchestrator on the GPU

In a second SSH session on the Brev instance:

```bash
cd ~/nvidia-ecosystem-visualizer

# Pick one of the existing generated fraud notebooks to improve,
# or generate a fresh one via the UI first.

npx tsx scripts/self-improve-notebook.ts <path-to.ipynb> \
  --services=rapids,tensorrt,model-optimizer,triton,ai-enterprise,ai-workbench \
  --max=5 \
  --goal='Real-time fraud detection at 50K TPS'
```

Expected trajectory (compare against the laptop baseline in
`docs/test-results/orchestrator-trajectory-laptop-01f17be.json`):

- **iter 1:** install cell should pass (RAPIDS already installed). First
  real root cause surfaces — likely `cuml.neural_network.MLPClassifier`
  (fake).
- **iter 2:** fix-pass replaces with `cuml.ensemble.RandomForestClassifier`.
  Cascade failures dissolve. TensorRT deprecated calls may surface.
- **iter 3:** fix TensorRT API migration (modern `create_builder_config()`
  + `set_flag(BuilderFlag.FP16)` + `build_serialized_network()`).
- **iter 4–5:** remaining cleanup.

Copy the final notebook and trajectory back:

```bash
# from laptop
scp brev-host:~/.../final.ipynb .
scp brev-host:~/.../trajectory.json docs/test-results/
```

## Step 6 — Record the result in the quality log

Once you have a Brev trajectory, commit it to
`docs/test-results/orchestrator-trajectory-brev-<sha>.json` and append a
row to `docs/quality-log.md` comparing the laptop baseline to the Brev
result. This is the honest measurement that tells us whether this
branch's infrastructure delivers on its design.

## If something goes wrong

- **Server won't start on Brev:** check `NIM_BASE_URL` in `.env.local`. For
  Brev + managed NIM, leave it as the default (`integrate.api.nvidia.com/v1`).
  For self-hosted NIM on the Brev GPU itself, set
  `NIM_BASE_URL=http://localhost:8000/v1` after starting the NIM container.
- **Orchestrator's `python` command not found:** the executor uses the
  system Python. On Brev you may need `python3` — either alias or edit
  `scripts/self-improve-notebook.ts` line ~70 to spawn `python3`.
- **Cells 15–20 min per LLM fix:** normal for NIM managed. If you see
  504s on retries, consider self-hosted NIM on the Brev instance to
  bypass the 15-min gateway ceiling.
- **Cells need more than the defaults:** add packages to Step 2 as the
  orchestrator surfaces `ModuleNotFoundError` for anything not in the
  default pip block.

## Revert path

If the Brev run shows regression vs the rubric-baseline:

```bash
git checkout fallback/pre-session-rubric-8-8-8
```

See `docs/procedures/06-brev-swap.md` for the env-var swap procedure.
