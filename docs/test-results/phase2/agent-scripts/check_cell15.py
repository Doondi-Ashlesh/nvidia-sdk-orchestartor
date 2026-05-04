import modelopt.torch.quantization as mtq
import inspect
sig = inspect.signature(mtq.quantize)
print("mtq.quantize signature:", sig)
print()
print("INT8_DEFAULT_CFG:", mtq.INT8_DEFAULT_CFG)
