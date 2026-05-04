import json
with open('/home/shadeform/work/exp14-input.healed.ipynb') as f:
    nb = json.load(f)

cells = nb['cells']

# Verify cell 8 is now markdown
print(f"Cell 8 type: {cells[8]['cell_type']}")

# Check cell 13 - print statement fix
src13 = ''.join(cells[13]['source'])
if 'print(\\n"' in src13:
    print("Cell 13: BUG STILL PRESENT")
else:
    print("Cell 13: print fix OK")

# Check cell 17 - no unclosed string
src17 = ''.join(cells[17]['source'])
if 'tensorrt_llm' in src17 and 'ImportError' in src17:
    print("Cell 17: try/except guard present")
if '\\")\n' in src17 or 'print("  trtllm-build' not in src17:
    pass
# Check the print line with backslash
lines17 = src17.split('\n')
for line in lines17:
    if 'trtllm-build' in line:
        print(f"Cell 17 trtllm line: {repr(line)}")

# Check cell 15 - no QuantizerConfig
src15 = ''.join(cells[15]['source'])
if 'QuantizerConfig' in src15:
    print("Cell 15: QuantizerConfig still present - BUG")
elif 'INT8_DEFAULT_CFG' in src15:
    print("Cell 15: INT8_DEFAULT_CFG present - OK")

# Check cell 9 - indentation
src9 = ''.join(cells[9]['source'])
if 'import pandas as pd' in src9:
    print("Cell 9: pandas import present - OK")
lines9 = src9.split('\n')
for i, line in enumerate(lines9):
    if 'def tokenize_function' in line:
        print(f"Cell 9 tokenize_function indentation: {repr(line[:30])}")
        break

# Validate JSON
print(f"\nHealed notebook cells: {len(nb['cells'])}")
print("JSON valid: OK")
