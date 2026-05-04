import json
with open('/home/shadeform/work/exp14-input.ipynb') as f:
    nb = json.load(f)

for idx in [3, 8, 9, 13, 15, 17, 19]:
    src = ''.join(nb['cells'][idx]['source'])
    ctype = nb['cells'][idx]['cell_type']
    print(f'=== CELL {idx} ({ctype}) ===')
    print(src)
    print()
