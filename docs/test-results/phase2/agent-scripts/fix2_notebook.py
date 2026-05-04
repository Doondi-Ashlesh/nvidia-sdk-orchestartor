import json

with open('/home/shadeform/work/exp14-input.healed.ipynb') as f:
    nb = json.load(f)

cells = nb['cells']

# ── Cell 8: Remove execution_count and outputs from markdown cell ───────────────
# nbformat requires markdown cells to NOT have these fields
cell8 = cells[8]
cell8.pop('execution_count', None)
cell8.pop('outputs', None)

# ── Cell 9: Add labels to tokenize_function for causal LM training ─────────────
# HuggingFace Trainer requires 'labels' in the dataset; for causal LM,
# labels == input_ids (the model predicts the next token at each position).
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

    # Tokenize dataset; labels=input_ids is required for causal LM training
    def tokenize_function(examples):
        result = tokenizer(examples['text'], truncation=True, max_length=128, padding='max_length')
        result['labels'] = result['input_ids'].copy()
        return result

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

with open('/home/shadeform/work/exp14-input.healed.ipynb', 'w') as f:
    json.dump(nb, f, indent=1)

print("Patch 2 applied: cell 8 metadata cleaned; cell 9 labels fix applied")
