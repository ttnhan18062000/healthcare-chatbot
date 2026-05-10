# Design Spec: Augmented RAG Validation Pipeline

**Date**: 2026-04-26
**Topic**: Validation Pipeline Hardening
**Status**: Approved

## 1. Goal
Stabilize and quantify the performance of the Healthcare Chatbot's Document (RAG) mode by implementing a structured validation pipeline that compares synthetic benchmarks against actual chatbot responses using custom heuristic metrics.

## 2. Architecture
The pipeline consists of a Python-based execution engine (`validate_rag.py`) that interacts with the Chatbot API, processes responses, and generates structured artifacts.

### Data Flow
1. **Input**: `data/synthetic_dataset.json` (The benchmark).
2. **Process**: 
   - Iterate through dataset entries.
   - Send requests to `/api/chat` with `mode: "rag"`.
   - Extract final text from the AI SDK stream.
   - Evaluate against 6 heuristic metrics (Tone, Citations, Length, Structure, Emotional Validation).
3. **Output**:
   - `data/synthetic_data_validation.json`: Augmented version of the input dataset.
   - `data/validation_report.md`: Human-readable summary.

## 3. Data Structures

### Augmented JSON Entry
```json
{
  "input": "string",
  "expected_output": "string",
  "actual_output": "string",
  "difficulty": "number",
  "type": "string",
  "persona_context": "string",
  "source_doc": "string",
  "validation": {
    "score_pct": "float",
    "metrics": {
      "citation_markers": "boolean",
      "source_footer": "boolean",
      "tone_ok": "boolean",
      "emotional_validation": "boolean",
      "sufficient_length": "boolean",
      "has_structure": "boolean"
    },
    "latency": "float",
    "summary": "string"
  }
}
```

## 4. Evaluation Logic
The following rules define the `Pass/Fail` criteria for each metric:
- **Citation Markers**: Presence of `[` and `]`.
- **Source Footer**: Presence of `Nguồn:`.
- **Tone (Mình-Bạn)**: Presence of both `mình` and `bạn` (case-insensitive).
- **Emotional Validation**: Presence of empathetic keywords (e.g., `hiểu`, `chia sẻ`).
- **Sufficient Length**: Response length > 300 characters.
- **Has Structure**: Presence of markdown lists (`- `, `1. `) or headers (`###`).

## 5. Implementation Steps
1. Update `validate_rag.py` to support the augmented JSON format.
2. Refine the markdown report generator for better clarity.
3. Ensure the script correctly handles streaming responses and errors.
