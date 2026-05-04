from nemoguardrails import RailsConfig
import inspect, sys

# Try minimal yaml config
yaml_content = """
models:
  - type: main
    engine: openai
    model: gpt-4o
"""

colang_content = """
flow check phi input
  $phi = execute detect_phi

flow redact phi output
  $phi = execute detect_phi
"""

try:
    config = RailsConfig.from_content(yaml_content=yaml_content, colang_content=colang_content)
    print("from_content succeeded:", type(config))
except Exception as e:
    print("from_content failed:", e)

# Try from_path with just yaml file
import tempfile, os
with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, 'config.yml'), 'w') as f:
        f.write(yaml_content.strip())
    with open(os.path.join(d, 'flows.co'), 'w') as f:
        f.write(colang_content.strip())
    try:
        config2 = RailsConfig.from_path(d)
        print("from_path succeeded:", type(config2))
    except Exception as e:
        print("from_path failed:", e)
