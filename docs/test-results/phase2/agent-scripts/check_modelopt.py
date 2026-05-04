import modelopt.torch.quantization as mtq
print("Available in mtq:", [x for x in dir(mtq) if not x.startswith('_')])
print()
for name in ['quantize', 'QuantizerConfig', 'INT8_DEFAULT_CFG', 'INT8_SMOOTHQUANT_CFG', 'FP8_DEFAULT_CFG']:
    obj = getattr(mtq, name, None)
    if obj:
        print(f'{name}: {type(obj)}')
    else:
        print(f'{name}: NOT FOUND')
