/**
 * Static NVIDIA agent skills catalog.
 *
 * Source: https://github.com/nvidia/skills (v0.2.0, 2026-03-31)
 *
 * This file is the compiled-in baseline. The skills-retriever module fetches
 * live updates from GitHub on server startup and merges them over this data.
 * The app always falls back to this file if GitHub is unreachable.
 *
 * To update manually: fetch the latest SKILL.md files from the individual
 * product repositories listed in the nvidia/skills README.
 */

import type { ServiceSkills } from '@/types/ecosystem';

export const STATIC_SKILLS: ServiceSkills[] = [
  // ── TensorRT-LLM ─────────────────────────────────────────────────────────
  // Source: https://github.com/NVIDIA/TensorRT-LLM/.claude/skills/
  {
    serviceId: 'tensorrt-llm',
    skills: [
      {
        name: 'llm-inference-optimization',
        version: '0.16.0',
        description: 'Optimize LLM inference performance and throughput using TensorRT-LLM compilation, batching strategies, and quantization-aware engine building.',
        repoUrl: 'https://github.com/NVIDIA/TensorRT-LLM/blob/main/.claude/skills/llm-inference-optimization/SKILL.md',
      },
      {
        name: 'model-onboarding',
        version: '0.16.0',
        description: 'Onboard a new LLM architecture into TensorRT-LLM by implementing the model definition, weight conversion, and inference engine configuration.',
        repoUrl: 'https://github.com/NVIDIA/TensorRT-LLM/blob/main/.claude/skills/model-onboarding/SKILL.md',
      },
      {
        name: 'autodeploy',
        version: '0.16.0',
        description: 'Automatically deploy a TensorRT-LLM model using the AutoDeploy pipeline with minimal configuration for rapid production deployment.',
        repoUrl: 'https://github.com/NVIDIA/TensorRT-LLM/blob/main/.claude/skills/autodeploy/SKILL.md',
      },
      {
        name: 'ci-diagnostics',
        version: '0.16.0',
        description: 'Diagnose and resolve CI/CD pipeline failures in TensorRT-LLM by analyzing test logs, identifying root causes, and applying targeted fixes.',
        repoUrl: 'https://github.com/NVIDIA/TensorRT-LLM/blob/main/.claude/skills/ci-diagnostics/SKILL.md',
      },
    ],
  },

  // ── Model Optimizer ───────────────────────────────────────────────────────
  // Source: https://github.com/NVIDIA/ModelOpt/.claude/skills/
  {
    serviceId: 'model-optimizer',
    skills: [
      {
        name: 'quantization',
        version: '0.21.0',
        description: 'Apply post-training quantization (INT8, FP8, INT4 AWQ/GPTQ) to neural network models using NVIDIA ModelOpt to reduce memory footprint and accelerate inference.',
        repoUrl: 'https://github.com/NVIDIA/ModelOpt/blob/main/.claude/skills/quantization/SKILL.md',
      },
      {
        name: 'sparsity',
        version: '0.21.0',
        description: 'Apply structured and unstructured sparsity to model weights using ModelOpt pruning algorithms to achieve compute and memory savings.',
        repoUrl: 'https://github.com/NVIDIA/ModelOpt/blob/main/.claude/skills/sparsity/SKILL.md',
      },
      {
        name: 'distillation',
        version: '0.21.0',
        description: 'Apply knowledge distillation to transfer capabilities from a large teacher model to a smaller student model using ModelOpt distillation recipes.',
        repoUrl: 'https://github.com/NVIDIA/ModelOpt/blob/main/.claude/skills/distillation/SKILL.md',
      },
      {
        name: 'export-optimization',
        version: '0.21.0',
        description: 'Export and optimize compressed models to deployment-ready formats (ONNX, TensorRT, TensorRT-LLM) using ModelOpt export utilities.',
        repoUrl: 'https://github.com/NVIDIA/ModelOpt/blob/main/.claude/skills/export-optimization/SKILL.md',
      },
    ],
  },

  // ── NeMo Evaluator ────────────────────────────────────────────────────────
  // Source: https://github.com/NVIDIA-NeMo/Evaluator/.claude/skills/
  {
    serviceId: 'nemo-evaluator',
    skills: [
      {
        name: 'nel-assistant',
        version: '26.06.00',
        description: 'Interactively guide LLM evaluation setup using the NeMo Evaluator Launcher (NEL), covering dataset configuration, model endpoints, and job submission.',
        repoUrl: 'https://github.com/NVIDIA-NeMo/Evaluator/blob/main/.claude/skills/nel-assistant/SKILL.md',
      },
      {
        name: 'nemo-evaluator-byob',
        version: '26.06.00',
        description: 'Design and run custom LLM benchmarks by bringing your own benchmark (BYOB) into the NeMo Evaluator framework.',
        repoUrl: 'https://github.com/NVIDIA-NeMo/Evaluator/blob/main/.claude/skills/nemo-evaluator-byob/SKILL.md',
      },
      {
        name: 'launching-evals',
        version: '26.06.00',
        description: 'Execute and monitor LLM evaluation jobs using NeMo Evaluator, including job configuration, submission, status tracking, and results retrieval.',
        repoUrl: 'https://github.com/NVIDIA-NeMo/Evaluator/blob/main/.claude/skills/launching-evals/SKILL.md',
      },
      {
        name: 'accessing-mlflow',
        version: '26.06.00',
        description: 'Browse, filter, and analyze LLM evaluation results stored in MLflow, including metric comparison across model versions and experiment tracking.',
        repoUrl: 'https://github.com/NVIDIA-NeMo/Evaluator/blob/main/.claude/skills/accessing-mlflow/SKILL.md',
      },
    ],
  },

  // ── NeMo Gym ──────────────────────────────────────────────────────────────
  // Source: https://github.com/NVIDIA-NeMo/Gym/.claude/skills/
  {
    serviceId: 'nemo-gym',
    skills: [
      {
        name: 'benchmark-addition',
        version: '0.5.0',
        description: 'Add new reinforcement learning benchmark environments to NeMo Gym, including reward function design, environment registration, and integration with training pipelines.',
        repoUrl: 'https://github.com/NVIDIA-NeMo/Gym/blob/main/.claude/skills/benchmark-addition/SKILL.md',
      },
    ],
  },

  // ── Megatron-LM ───────────────────────────────────────────────────────────
  // Source: https://github.com/NVIDIA/Megatron-LM/.claude/skills/
  {
    serviceId: 'megatron-lm',
    skills: [
      {
        name: 'model-parallelism',
        version: '0.10.0',
        description: 'Configure tensor, sequence, and expert parallelism for large model training in Megatron-LM to maximize GPU utilization across multi-node clusters.',
        repoUrl: 'https://github.com/NVIDIA/Megatron-LM/blob/main/.claude/skills/model-parallelism/SKILL.md',
      },
      {
        name: 'pipeline-parallelism',
        version: '0.10.0',
        description: 'Set up pipeline parallelism across multiple GPU nodes in Megatron-LM, including stage assignment, micro-batch scheduling, and gradient synchronization.',
        repoUrl: 'https://github.com/NVIDIA/Megatron-LM/blob/main/.claude/skills/pipeline-parallelism/SKILL.md',
      },
    ],
  },

  // ── Megatron Bridge ───────────────────────────────────────────────────────
  // Source: https://github.com/NVIDIA-NeMo/Megatron-Bridge/skills/
  // Maps to megatron-lm as it bridges NeMo ↔ Megatron training
  {
    serviceId: 'megatron-lm',
    skills: [
      {
        name: 'data-processing',
        version: '0.3.0',
        description: 'Process and tokenize raw text datasets into Megatron-format indexed binary files for efficient large-scale pretraining.',
        repoUrl: 'https://github.com/NVIDIA-NeMo/Megatron-Bridge/blob/main/skills/data-processing/SKILL.md',
      },
      {
        name: 'model-conversion',
        version: '0.3.0',
        description: 'Convert model checkpoints between Megatron and HuggingFace formats for interoperability with the broader LLM ecosystem.',
        repoUrl: 'https://github.com/NVIDIA-NeMo/Megatron-Bridge/blob/main/skills/model-conversion/SKILL.md',
      },
      {
        name: 'training-utilities',
        version: '0.3.0',
        description: 'Use Megatron Bridge training utilities for checkpoint management, learning rate scheduling, and distributed training configuration.',
        repoUrl: 'https://github.com/NVIDIA-NeMo/Megatron-Bridge/blob/main/skills/training-utilities/SKILL.md',
      },
    ],
  },

  // ── Nemotron Voice Agent (Blueprint) ─────────────────────────────────────
  // Source: https://github.com/NVIDIA-AI-Blueprints/nemotron-voice-agent/
  // Maps to blueprints service as it is a reference architecture
  {
    serviceId: 'blueprints',
    skills: [
      {
        name: 'nemotron-voice-agent',
        version: '1.0.0',
        description: 'Deploy a real-time speech-to-speech conversational voice agent using Nemotron models, ASR, and TTS NIMs in a low-latency streaming pipeline.',
        repoUrl: 'https://github.com/NVIDIA-AI-Blueprints/nemotron-voice-agent/blob/main/.agents/skills/SKILL.md',
      },
    ],
  },

  // ── cuOpt ─────────────────────────────────────────────────────────────────
  // Source: https://github.com/NVIDIA/cuOpt/skills/
  {
    serviceId: 'cuopt',
    skills: [
      {
        name: 'cuopt-developer',
        version: '26.06.00',
        description: 'Contribute to the NVIDIA cuOpt codebase with expert guidance on architecture, testing, and GPU-accelerated optimization algorithms.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/cuopt-developer/SKILL.md',
      },
      {
        name: 'cuopt-installation-api-python',
        version: '26.06.00',
        description: 'Install and configure cuOpt for Python, including environment setup, dependency management, and verification of the Python API.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/cuopt-installation-api-python/SKILL.md',
      },
      {
        name: 'cuopt-installation-api-c',
        version: '26.06.00',
        description: 'Install and configure cuOpt for C/C++, including CMake configuration, library linking, and verification of the C API.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/cuopt-installation-api-c/SKILL.md',
      },
      {
        name: 'routing-formulation',
        version: '26.06.00',
        description: 'Model and solve vehicle routing problems (VRP, CVRP, VRPTW) using cuOpt, including fleet definition, location data, and constraint specification.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/routing-formulation/SKILL.md',
      },
      {
        name: 'lp-milp-solver',
        version: '26.06.00',
        description: 'Formulate and solve linear programming (LP) and mixed-integer linear programming (MILP) problems using cuOpt\'s GPU-accelerated solver.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/lp-milp-solver/SKILL.md',
      },
      {
        name: 'qp-solver',
        version: '26.06.00',
        description: 'Formulate and solve quadratic programming (QP) problems with linear constraints using cuOpt\'s GPU-accelerated optimization engine.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/qp-solver/SKILL.md',
      },
      {
        name: 'cuopt-server',
        version: '26.06.00',
        description: 'Deploy and manage cuOpt as a REST server, including containerization, API endpoint configuration, and request/response handling.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/cuopt-server/SKILL.md',
      },
      {
        name: 'routing-rules',
        version: '26.06.00',
        description: 'Define and apply routing constraints and business rules in cuOpt, including time windows, vehicle capacities, and mandatory stops.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/routing-rules/SKILL.md',
      },
      {
        name: 'waypoint-graph',
        version: '26.06.00',
        description: 'Build and optimize waypoint graph networks for path planning in cuOpt, enabling routing over road networks and indoor maps.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/waypoint-graph/SKILL.md',
      },
      {
        name: 'pdptw-formulation',
        version: '26.06.00',
        description: 'Model pickup and delivery problems with time windows (PDPTW) in cuOpt for logistics and supply chain optimization.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/pdptw-formulation/SKILL.md',
      },
      {
        name: 'cuopt-data-model',
        version: '26.06.00',
        description: 'Structure and validate input data for cuOpt using the cuOpt DataModel API, ensuring correct formatting for solver ingestion.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/cuopt-data-model/SKILL.md',
      },
      {
        name: 'solution-analysis',
        version: '26.06.00',
        description: 'Parse, validate, and visualize cuOpt optimization solutions, including route analysis, KPI extraction, and feasibility checks.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/solution-analysis/SKILL.md',
      },
      {
        name: 'benchmark-cuopt',
        version: '26.06.00',
        description: 'Run performance benchmarks on cuOpt solvers using standard OR datasets (CVRPLIB, Solomon benchmarks) to measure solution quality and speed.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/benchmark-cuopt/SKILL.md',
      },
      {
        name: 'microservices-integration',
        version: '26.06.00',
        description: 'Integrate cuOpt optimization into microservices architectures via REST or gRPC, including authentication, async job handling, and callback patterns.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/microservices-integration/SKILL.md',
      },
      {
        name: 'multi-objective-optimization',
        version: '26.06.00',
        description: 'Configure and solve multi-objective optimization problems in cuOpt, balancing competing objectives like cost, time, and resource utilization.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/multi-objective-optimization/SKILL.md',
      },
      {
        name: 'fleet-management',
        version: '26.06.00',
        description: 'Model heterogeneous vehicle fleets in cuOpt with varying capacities, skills, and cost structures for real-world logistics optimization.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/fleet-management/SKILL.md',
      },
      {
        name: 'dynamic-rerouting',
        version: '26.06.00',
        description: 'Implement dynamic rerouting with cuOpt to handle real-time order insertions, cancellations, and vehicle breakdowns while preserving existing routes.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/dynamic-rerouting/SKILL.md',
      },
      {
        name: 'cuopt-testing',
        version: '26.06.00',
        description: 'Write unit and integration tests for cuOpt-based applications, including solver correctness validation and performance regression testing.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/cuopt-testing/SKILL.md',
      },
      {
        name: 'skill-evolution',
        version: '26.06.00',
        description: 'Detect learning opportunities from cuOpt usage sessions and propose targeted improvements to existing skills using the skill-evolution protocol.',
        repoUrl: 'https://github.com/NVIDIA/cuOpt/blob/main/skills/skill-evolution/SKILL.md',
      },
    ],
  },
];

/**
 * Known raw URLs for SKILL.md files — used by the background GitHub refresh.
 * Indexed by serviceId so the retriever can update specific service entries.
 */
export const SKILL_SOURCE_URLS: Array<{ serviceId: string; name: string; rawUrl: string }> = [
  // TensorRT-LLM
  { serviceId: 'tensorrt-llm', name: 'llm-inference-optimization', rawUrl: 'https://raw.githubusercontent.com/NVIDIA/TensorRT-LLM/main/.claude/skills/llm-inference-optimization/SKILL.md' },
  { serviceId: 'tensorrt-llm', name: 'model-onboarding', rawUrl: 'https://raw.githubusercontent.com/NVIDIA/TensorRT-LLM/main/.claude/skills/model-onboarding/SKILL.md' },
  { serviceId: 'tensorrt-llm', name: 'autodeploy', rawUrl: 'https://raw.githubusercontent.com/NVIDIA/TensorRT-LLM/main/.claude/skills/autodeploy/SKILL.md' },
  { serviceId: 'tensorrt-llm', name: 'ci-diagnostics', rawUrl: 'https://raw.githubusercontent.com/NVIDIA/TensorRT-LLM/main/.claude/skills/ci-diagnostics/SKILL.md' },
  // Model Optimizer
  { serviceId: 'model-optimizer', name: 'quantization', rawUrl: 'https://raw.githubusercontent.com/NVIDIA/Model-Optimizer/main/.claude/skills/quantization/SKILL.md' },
  { serviceId: 'model-optimizer', name: 'sparsity', rawUrl: 'https://raw.githubusercontent.com/NVIDIA/Model-Optimizer/main/.claude/skills/sparsity/SKILL.md' },
  { serviceId: 'model-optimizer', name: 'distillation', rawUrl: 'https://raw.githubusercontent.com/NVIDIA/Model-Optimizer/main/.claude/skills/distillation/SKILL.md' },
  { serviceId: 'model-optimizer', name: 'export-optimization', rawUrl: 'https://raw.githubusercontent.com/NVIDIA/Model-Optimizer/main/.claude/skills/export-optimization/SKILL.md' },
  // NeMo Evaluator
  { serviceId: 'nemo-evaluator', name: 'nel-assistant', rawUrl: 'https://raw.githubusercontent.com/NVIDIA-NeMo/Evaluator/main/.claude/skills/nel-assistant/SKILL.md' },
  { serviceId: 'nemo-evaluator', name: 'nemo-evaluator-byob', rawUrl: 'https://raw.githubusercontent.com/NVIDIA-NeMo/Evaluator/main/.claude/skills/nemo-evaluator-byob/SKILL.md' },
  { serviceId: 'nemo-evaluator', name: 'launching-evals', rawUrl: 'https://raw.githubusercontent.com/NVIDIA-NeMo/Evaluator/main/.claude/skills/launching-evals/SKILL.md' },
  { serviceId: 'nemo-evaluator', name: 'accessing-mlflow', rawUrl: 'https://raw.githubusercontent.com/NVIDIA-NeMo/Evaluator/main/.claude/skills/accessing-mlflow/SKILL.md' },
  // NeMo Gym
  { serviceId: 'nemo-gym', name: 'benchmark-addition', rawUrl: 'https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.claude/skills/benchmark-addition/SKILL.md' },
];
