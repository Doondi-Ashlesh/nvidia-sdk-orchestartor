import json, copy

with open('/home/shadeform/work/exp14-input.ipynb') as f:
    nb = json.load(f)

healed = copy.deepcopy(nb)
cells = healed['cells']
fixes = []

# ── Cell 3: Setup ──────────────────────────────────────────────────────────────
# Bugs:
#   1. subprocess.check_call with stdin=string (wrong API)
#   2. import torch before pip install
#   3. transformersdatasets typo, faiss-gpu not on PyPI, non-existent pkgs
new_cell3_source = '''\
# Setup: Install dependencies and check environment
import subprocess, sys, os, shutil

# Install core ML packages with CUDA 12.8 support
subprocess.check_call([
    sys.executable, "-m", "pip", "install", "--quiet",
    "torch",
    "--index-url", "https://download.pytorch.org/whl/cu128",
])

# Install remaining packages
subprocess.check_call([
    sys.executable, "-m", "pip", "install", "--quiet",
    "transformers",
    "datasets",
    "sentence-transformers",
    "faiss-cpu",       # faiss-gpu is conda-only; faiss-cpu works for this workload
    "pandas",
    "numpy",
    "scikit-learn",
    "pyyaml",
    "nvidia-modelopt[torch]",
    "nemoguardrails",
    "tritonclient[all]",
])

# tensorrt-llm: try installing; cell 17 guards against ImportError
try:
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--quiet", "tensorrt-llm",
    ])
except subprocess.CalledProcessError:
    print("WARNING: tensorrt-llm install failed — cell 17 will use stub mode")

import torch

# Environment detection
HAS_GPU = torch.cuda.is_available()
HAS_TRITON = shutil.which("tritonserver") is not None
HAS_KUBECTL = shutil.which("kubectl") is not None
HAS_HELM = shutil.which("helm") is not None

print(f"GPU available: {HAS_GPU}")
if HAS_GPU:
    print(f"  Device: {torch.cuda.get_device_name(0)}")
    print(f"  Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

print(f"Triton Server: {HAS_TRITON}")
print(f"kubectl: {HAS_KUBECTL}")
print(f"Helm: {HAS_HELM}")

# Check for NVIDIA API key
if "NVIDIA_API_KEY" not in os.environ:
    print("WARNING: NVIDIA_API_KEY environment variable not set")
    print("Some steps requiring model access may fail")
else:
    print("NVIDIA_API_KEY found")
'''
cells[3]['source'] = new_cell3_source
fixes.append({"cell_index": 3, "class": "setup-failure",
               "summary": "Fixed subprocess.check_call: replaced stdin=string with proper arg list; "
                          "moved torch import after pip install; fixed transformersdatasets typo to "
                          "separate packages; replaced faiss-gpu (conda-only) with faiss-cpu; removed "
                          "non-existent packages (nemo-collections, nemo-microservices, "
                          "nemo-evaluator-launcher, nemo-curator); added graceful tensorrt-llm install"})

# ── Cell 8: Wrong cell type (markdown content in code cell) ────────────────────
cells[8]['cell_type'] = 'markdown'
fixes.append({"cell_index": 8, "class": "syntax-error",
               "summary": "Converted cell_type from 'code' to 'markdown': cell contained only "
                          "markdown text (**Purpose:**, bullet lists) which caused SyntaxError in Python"})

# ── Cell 9: Fine-tune ──────────────────────────────────────────────────────────
# Bugs:
#   1. def tokenize_function and training code unindented out of else block
#   2. pd not imported (used as pd.read_csv inside else block)
new_cell9_source = '''\
# NeMo: Fine-tune medical LLM (demonstration with smaller model)
import torch
import pandas as pd
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
import datasets
import os

# Check if we should skip due to resource constraints
SKIP_FINETUNE = os.environ.get('SKIP_FINETUNE', 'false').lower() == 'true'
if SKIP_FINETUNE:
    print("Skipping fine-tuning step (set SKIP_FINETUNE=false to run)")
    # Create dummy checkpoint for pipeline continuation
    os.makedirs('fine_tuned_model', exist_ok=True)
    with open('fine_tuned_model/checkpoint.txt', 'w') as f:
        f.write('dummy_checkpoint')
    print("Created dummy checkpoint for pipeline continuation")
else:
    print("Loading processed data for fine-tuning...")
    deidentified_ehr = pd.read_csv('deidentified_ehr.csv')
    cleaned_literature = pd.read_csv('cleaned_literature.csv')

    # Combine texts for language modeling
    texts = list(deidentified_ehr['clean_note']) + list(cleaned_literature['clean_abstract'])
    print(f"Total training examples: {len(texts)}")

    # Create dataset
    dataset = datasets.Dataset.from_dict({'text': texts})

    # Use a smaller model for demonstration (in production use Nemotron-3)
    model_name = "distilgpt2"  # Placeholder - replace with "nvidia/nemotron-3-8b-base" in production
    print(f"Loading base model: {model_name}")

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.pad_token = tokenizer.eos_token  # Set pad token

    model = AutoModelForCausalLM.from_pretrained(model_name)

    # Tokenize dataset
    def tokenize_function(examples):
        return tokenizer(examples['text'], truncation=True, max_length=128, padding='max_length')

    tokenized_dataset = dataset.map(tokenize_function, batched=True, remove_columns=['text'])

    # Set up training
    print("Setting up training...")
    training_args = TrainingArguments(
        output_dir='./results',
        num_train_epochs=1,
        per_device_train_batch_size=4,
        warmup_steps=100,
        weight_decay=0.01,
        logging_dir='./logs',
        logging_steps=10,
        save_strategy="epoch",
        fp16=torch.cuda.is_available(),
    )

    # Create Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset,
    )

    # Train model
    print("Starting training...")
    trainer.train()

    # Save fine-tuned model
    print("Saving fine-tuned model...")
    trainer.save_model('fine_tuned_model')
    tokenizer.save_pretrained('fine_tuned_model')

    print("Fine-tuning complete. Model saved to \'fine_tuned_model\'")
'''
cells[9]['source'] = new_cell9_source
fixes.append({"cell_index": 9, "class": "syntax-error",
               "summary": "Fixed indentation: def tokenize_function and all training code moved inside "
                          "the else block so they share scope with tokenizer/model/dataset; added "
                          "'import pandas as pd' which was missing"})

# ── Cell 11: NeMo Guardrails ────────────────────────────────────────────────────
# Bug: RailsConfig.from_path receives a file path instead of a directory path
src11 = ''.join(cells[11]['source'])
src11_fixed = src11.replace(
    'config = RailsConfig.from_path(config_path)',
    'config = RailsConfig.from_path(tmpdir)  # from_path takes a directory, not a file'
)
cells[11]['source'] = src11_fixed
fixes.append({"cell_index": 11, "class": "hallucinated-api",
               "summary": "Fixed RailsConfig.from_path: API expects a directory path, not a file "
                          "path; changed from_path(config_path) to from_path(tmpdir) so it reads "
                          "config.yml from the temp directory"})

# ── Cell 13: NeMo Evaluator ─────────────────────────────────────────────────────
# Bug: print(\n"text") — backslash before open-quote is SyntaxError
src13 = ''.join(cells[13]['source'])
src13_fixed = src13.replace(
    'print(\\n"To run evaluation (after deploying inference endpoint):")',
    'print("\\nTo run evaluation (after deploying inference endpoint):")'
)
cells[13]['source'] = src13_fixed
fixes.append({"cell_index": 13, "class": "syntax-error",
               "summary": "Fixed print(\\n\"text\"): backslash was outside the string causing "
                          "SyntaxError; moved \\n inside the string literal"})

# ── Cell 15: Model Optimizer ────────────────────────────────────────────────────
# Bug: mtq.QuantizerConfig is a hallucinated class; real API is mtq.INT8_DEFAULT_CFG + forward_loop
new_cell15_source = '''\
# Model Optimizer: INT8 quantization
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
import modelopt.torch.quantization as mtq
import os

# Check if fine-tuned model exists
if not os.path.exists('fine_tuned_model'):
    print("Fine-tuned model not found. Using base model for demonstration.")
    model_path = "distilgpt2"  # Fallback
else:
    model_path = "fine_tuned_model"

print(f"Loading model from {model_path}...")
tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForCausalLM.from_pretrained(model_path)

# Set pad token if not present
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

print("Model loaded. Applying INT8 quantization...")

# Define a calibration forward loop (required by mtq.quantize)
def forward_loop(model):
    input_ids = torch.ones((4, 128), dtype=torch.long)
    with torch.no_grad():
        model(input_ids=input_ids)

# Apply INT8 quantization using the canonical nvidia-modelopt API
# mtq.QuantizerConfig does not exist; use predefined configs like mtq.INT8_DEFAULT_CFG
quantized_model = mtq.quantize(model, mtq.INT8_DEFAULT_CFG, forward_loop=forward_loop)

# Save quantized model
quantized_model.save_pretrained('quantized_model')
tokenizer.save_pretrained('quantized_model')

print("Quantized model saved to \'quantized_model\'")
print("\\nQuantization complete. Ready for TensorRT-LLM conversion.")
'''
cells[15]['source'] = new_cell15_source
fixes.append({"cell_index": 15, "class": "hallucinated-api",
               "summary": "Replaced mtq.QuantizerConfig (non-existent class) with the real "
                          "nvidia-modelopt API: mtq.quantize(model, mtq.INT8_DEFAULT_CFG, "
                          "forward_loop=calibrate_fn); added required forward_loop calibration function"})

# ── Cell 17: TensorRT-LLM ───────────────────────────────────────────────────────
# Bugs:
#   1. print("... \") — escaped quote leaves string unclosed (SyntaxError)
#   2. import tensorrt_llm / from tensorrt_llm import LLM needs ImportError guard
new_cell17_source = '''\
# TensorRT-LLM: Build optimized engine
import torch
from transformers import AutoTokenizer
import os

# Guard tensorrt_llm import: package install may fail on some environments
try:
    import tensorrt_llm
    from tensorrt_llm import LLM
    HAS_TRT_LLM = True
except ImportError:
    HAS_TRT_LLM = False
    print("NOTE: tensorrt-llm not available — showing build instructions only")

# Check if quantized model exists
if not os.path.exists('quantized_model'):
    print("Quantized model not found. Using base model for demonstration.")
    model_path = "distilgpt2"
else:
    model_path = "quantized_model"

print(f"Loading quantized model from {model_path}...")
tokenizer = AutoTokenizer.from_pretrained(model_path)

# TensorRT-LLM requires specific model format
# In production, use tensorrt_llm.build() or trtllm-build command
# For demonstration, we show the API usage

print("\\nTensorRT-LLM engine building process:")
print("1. Convert HuggingFace model to TensorRT-LLM checkpoint")
print("2. Configure build options (precision, batch size, etc.)")
print("3. Build engine using tensorrt_llm.builder")
print("4. Save engine for deployment")

# Example code structure (would run in production environment):
#
# from tensorrt_llm.builder import Builder
# from tensorrt_llm.network import net_guard
# from tensorrt_llm.models import PreTrainedWeightLoader
#
# builder = Builder()
# builder.config.max_batch_size = 8
# builder.config.max_input_len = 512
# builder.config.max_output_len = 100
# builder.config.opt_batch_size = 4
# builder.config.opt_input_len = 256
# builder.config.opt_output_len = 50
# builder.config.set_flag(\'FP16\')  # or \'INT8\' for quantized
#
# engine = builder.build(network, config)
# engine.save(\'medical_chatbot_engine\')
#
print("\\nIn a production environment, you would run:")
print("  trtllm-build --checkpoint_dir ./quantized_model --output_dir ./engine \\\\")
print("    --gemm_plugin=float16 --max_batch_size=8")

# Create placeholder engine file for pipeline continuation
os.makedirs('engine', exist_ok=True)
with open('engine/model.engine', 'w') as f:
    f.write('placeholder_tensorrt_engine')

print("\\nPlaceholder engine created at \'engine/model.engine\'")
print("Replace with actual engine built from quantized model in production.")
'''
cells[17]['source'] = new_cell17_source
fixes.append({"cell_index": 17, "class": "syntax-error",
               "summary": "Fixed unclosed string: print(\\\"... \\\\\\\") ended with escaped quote "
                          "causing SyntaxError; fixed by using \\\\\\\\\\\\ for literal backslash. "
                          "Added try/except ImportError guard around tensorrt_llm imports"})

# ── Cell 19: Dynamo-Triton ──────────────────────────────────────────────────────
# Bug: preprocess_script string contains ' \\n\\"' — generates broken Python in written file
src19 = ''.join(cells[19]['source'])
# Fix the broken join inside the triple-quoted preprocess_script
src19_fixed = src19.replace(
    'context_str = " \\n\\".join(contexts)',
    'context_str = "\\\\n".join(contexts)'
)
cells[19]['source'] = src19_fixed
fixes.append({"cell_index": 19, "class": "syntax-error",
               "summary": 'Fixed preprocess_script string content: \' \\\\n\\"\'.join(contexts) '
                          'generated invalid Python in the written file; corrected to '
                          '"\\\\\\\\n".join(contexts) which writes \'\\\\n\'.join(contexts) to the file'})

# ── Write healed notebook ───────────────────────────────────────────────────────
output_path = '/home/shadeform/work/exp14-input.healed.ipynb'
with open(output_path, 'w') as f:
    json.dump(healed, f, indent=1)

print(f"Healed notebook written to {output_path}")
print(f"Total fixes applied: {len(fixes)}")
for fix in fixes:
    print(f"  Cell {fix['cell_index']}: [{fix['class']}] {fix['summary'][:80]}...")
