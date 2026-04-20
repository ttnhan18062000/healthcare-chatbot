import json
import requests
import os
import argparse
import time
from dotenv import load_dotenv

load_dotenv()

# Configuration
API_URL = "http://localhost:3000/api/chat"
DATA_DIR = "data"
INPUT_FILE = os.path.join(DATA_DIR, "synthetic_dataset.json")
REPORT_FILE = os.path.join(DATA_DIR, "validation_report.md")

def parse_stream(response):
    """Parses the Vercel AI SDK DataStream format to extract the final text."""
    full_text = ""
    for line in response.iter_lines():
        if not line:
            continue
        line_str = line.decode('utf-8')
        if line_str.startswith('data: '):
            try:
                chunk = json.loads(line_str[6:])
                if chunk.get("type") == "text-delta":
                    # AI SDK v3+ uses 'delta', v2 used 'textDelta'
                    full_text += chunk.get("delta", chunk.get("textDelta", ""))
            except json.JSONDecodeError:
                continue
    return full_text

def validate_response(actual, expected, persona_context):
    """Performs automated checks for tone, citations, and content."""
    scores = {
        "citation_markers": "[" in actual and "]" in actual,
        "source_footer": "Nguồn:" in actual,
        "tone_ok": "bạn" in actual.lower() and "mình" in actual.lower(),
        "emotional_validation": any(phrase in actual.lower() for phrase in ["hiểu", "chia sẻ", "thông cảm", "biết bạn"]),
        "sufficient_length": len(actual) > 300,
        "has_structure": "- " in actual or "1. " in actual or "###" in actual,
    }
    
    # Calculate overall score
    total = sum(1 for v in scores.values() if v)
    score_pct = (total / len(scores)) * 100
    
    return {
        "scores": scores,
        "score_pct": score_pct,
        "length": len(actual),
        "feedback": "Passed all checks" if score_pct == 100 else "Failed some quality checks"
    }

def run_validation(sample_count=5):
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found.")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    samples = dataset[:sample_count]
    results = []

    print(f"Starting validation for {sample_count} samples...")

    for i, sample in enumerate(samples):
        print(f"[{i+1}/{sample_count}] Testing: {sample['input'][:50]}...")
        
        payload = {
            "id": f"val-{int(time.time())}-{i}",
            "messages": [
                {
                    "id": f"msg-{i}",
                    "role": "user",
                    "parts": [{"type": "text", "text": sample["input"]}]
                }
            ],
            "mode": "rag"
        }
        
        headers = {
            "Content-Type": "application/json",
            "x-test-bypass": "true" # Custom header if needed to bypass certain checks
        }

        try:
            start_time = time.time()
            response = requests.post(API_URL, json=payload, headers=headers, stream=True)
            if response.status_code != 200:
                print(f"  FAILED: Status {response.status_code}")
                continue
                
            actual_text = parse_stream(response)
            latency = time.time() - start_time
            
            evaluation = validate_response(actual_text, sample["expected_output"], sample["persona_context"])
            
            results.append({
                "input": sample["input"],
                "expected": sample["expected_output"],
                "actual": actual_text,
                "type": sample["type"],
                "latency": latency,
                "evaluation": evaluation
            })
            
            print(f"  Score: {evaluation['score_pct']}% | Latency: {latency:.2f}s")
            
        except Exception as e:
            print(f"  ERROR: {e}")

    # Generate Report
    generate_markdown_report(results)

def generate_markdown_report(results):
    total_samples = len(results)
    if total_samples == 0:
        return

    avg_score = sum(r["evaluation"]["score_pct"] for r in results) / total_samples
    avg_latency = sum(r["latency"] for r in results) / total_samples
    avg_length = sum(r["evaluation"]["length"] for r in results) / total_samples
    
    report = f"""# RAG Validation Report: {time.strftime('%Y-%m-%d %H:%M:%S')}

## Executive Summary
- **Total Samples Tested**: {total_samples}
- **Average Quality Score**: {avg_score:.1f}%
- **Average Response Length**: {avg_length:.1f} chars
- **Average Latency**: {avg_latency:.2f}s

## Detailed Results

"""
    for i, r in enumerate(results):
        eval = r["evaluation"]
        status = "✅ PASS" if eval["score_pct"] == 100 else "⚠️ FAIL"
        
        report += f"### Sample {i+1}: {status}\n"
        report += f"- **Type**: {r['type']}\n"
        report += f"- **Score**: {eval['score_pct']}%\n"
        report += f"- **Length**: {eval['length']} chars\n"
        report += f"- **Citations**: {'✅' if eval['scores']['citation_markers'] else '❌'}\n"
        report += f"- **Source Footer**: {'✅' if eval['scores']['source_footer'] else '❌'}\n"
        report += f"- **Tone (Mình-Bạn)**: {'✅' if eval['scores']['tone_ok'] else '❌'}\n"
        report += f"- **Structure**: {'✅' if eval['scores']['has_structure'] else '❌'}\n\n"
        
        report += "#### Input\n"
        report += f"> {r['input']}\n\n"
        
        report += "#### Actual Output\n"
        report += f"```text\n{r['actual']}\n```\n\n"
        
        report += "---\n\n"

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(report)
    
    print(f"Validation complete. Report saved to {REPORT_FILE}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate RAG mode against synthetic benchmarks.")
    parser.add_argument("--n", type=int, default=5, help="Number of samples to test.")
    args = parser.parse_args()
    
    run_validation(args.n)
