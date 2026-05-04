import json

with open('/home/shadeform/work/exp14-input.healed.ipynb') as f:
    nb = json.load(f)

cells = nb['cells']

# ── Cell 17: Broaden except clause to catch RuntimeError from MPI load failure ──
# tensorrt-llm raises RuntimeError (not ImportError) when system MPI .so is missing
new_cell17_source = '''\
# TensorRT-LLM: Build optimized engine
import torch
from transformers import AutoTokenizer
import os

# Guard tensorrt_llm import: requires system MPI libraries; raises RuntimeError if absent
try:
    import tensorrt_llm
    from tensorrt_llm import LLM
    HAS_TRT_LLM = True
except Exception:
    HAS_TRT_LLM = False
    print("NOTE: tensorrt-llm not available (missing system MPI libs) — showing build instructions only")

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

with open('/home/shadeform/work/exp14-input.healed.ipynb', 'w') as f:
    json.dump(nb, f, indent=1)

print("Patch 3 applied: cell 17 except clause broadened to catch RuntimeError (MPI)")
