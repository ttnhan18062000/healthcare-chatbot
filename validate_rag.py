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
VALIDATION_FILE = os.path.join(DATA_DIR, "synthetic_data_validation.json")
REPORT_FILE = os.path.join(DATA_DIR, "validation_report.md")

def is_pass(metric_name, feedback_value):
    """Unified check for pass status based on metric name and descriptive feedback."""
    v_lower = feedback_value.lower()
    if metric_name == "sufficient_length": return "ok" in v_lower
    if metric_name == "tone_ok": return "correct" in v_lower
    return "found" in v_lower

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
                    full_text += chunk.get("delta", chunk.get("textDelta", ""))
            except json.JSONDecodeError:
                continue
    return full_text

def validate_response(actual, expected, sample, latency):
    """Performs automated checks for tone, citations, and content."""
    
    metrics = {
        "citation_markers": "Found citation brackets []" if ("[" in actual and "]" in actual) or ("【" in actual and "】" in actual) else "Missing citation brackets []",
        "source_footer": "Found 'Nguồn:' footer" if "Nguồn:" in actual else "Missing 'Nguồn:' footer",
        "tone_ok": "Correct 'mình-bạn' tone" if ("bạn" in actual.lower() and "mình" in actual.lower()) else "Missing 'mình' or 'bạn' tone",
        "emotional_validation": "Found empathetic validation" if any(phrase in actual.lower() for phrase in ["hiểu", "chia sẻ", "thông cảm", "biết bạn", "vất vả", "lo lắng", "thương", "đồng cảm", "bên cạnh bạn"]) else "Missing emotional validation",

        "sufficient_length": f"Length OK ({len(actual)} chars)" if len(actual) > 300 else f"Too short ({len(actual)} chars)",
        "has_structure": "Markdown structure found" if (("- " in actual or "1. " in actual or "###" in actual) and ("Thấu hiểu" in actual or "Giải pháp" in actual or "Lời khuyên" in actual)) else "Missing lists, headers or required sections",
    }


    # Calculate overall score
    total_passed = sum(1 for m, v in metrics.items() if is_pass(m, v))
    score_pct = (total_passed / len(metrics)) * 100
    
    # Generate summary
    failing = [k.replace("_", " ").title() for k, v in metrics.items() if not is_pass(k, v)]
    if not failing:
        summary = "Passed all quality checks."
    else:
        summary = f"Deficiencies found in: {', '.join(failing)}."

    return {
        "score_pct": score_pct,
        "metrics": metrics,
        "latency": round(latency, 2),
        "summary": summary
    }

def run_validation(sample_count=5):
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found.")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    samples = dataset[:sample_count]
    enriched_results = []

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
            "x-test-bypass": "true"
        }

        try:
            start_time = time.time()
            response = requests.post(API_URL, json=payload, headers=headers, stream=True)
            if response.status_code != 200:
                print(f"  FAILED: Status {response.status_code}")
                continue
                
            actual_text = parse_stream(response)
            latency = time.time() - start_time
            
            evaluation = validate_response(actual_text, sample["expected_output"], sample, latency)
            
            # Build augmented object
            enriched_sample = sample.copy()
            enriched_sample["actual_output"] = actual_text
            enriched_sample["validation"] = evaluation
            
            enriched_results.append(enriched_sample)
            
            print(f"  Score: {evaluation['score_pct']:.1f}% | Latency: {latency:.2f}s")
            
        except Exception as e:
            print(f"  ERROR: {e}")

    # Save Augmented JSON
    with open(VALIDATION_FILE, "w", encoding="utf-8") as f:
        json.dump(enriched_results, f, indent=2, ensure_ascii=False)
    print(f"Augmented data saved to {VALIDATION_FILE}")

    # Generate Markdown Report
    generate_markdown_report(enriched_results)

def generate_markdown_report(results):
    total_samples = len(results)
    if total_samples == 0:
        return

    avg_score = sum(r["validation"]["score_pct"] for r in results) / total_samples
    avg_latency = sum(r["validation"]["latency"] for r in results) / total_samples
    
    status_icon = "✅ HEALTHY" if avg_score >= 95 else ("⚠️ DEGRADED" if avg_score >= 80 else "❌ CRITICAL")

    report = f"""# RAG Validation Report: {time.strftime('%Y-%m-%d %H:%M:%S')}

## Executive Summary
- **Overall Status**: {status_icon}
- **Total Samples Tested**: {total_samples}
- **Average Quality Score**: {avg_score:.1f}%
- **Average Latency**: {avg_latency:.2f}s

## Metric Pass Rates
| Metric | Pass Rate | Status |
| :--- | :--- | :--- |
"""
    metrics_list = ["citation_markers", "source_footer", "tone_ok", "emotional_validation", "sufficient_length", "has_structure"]
    for m in metrics_list:
        pass_count = sum(1 for r in results if is_pass(m, r["validation"]["metrics"][m]))
        pass_rate = (pass_count / total_samples) * 100
        m_status = "✅" if pass_rate >= 90 else ("⚠️" if pass_rate >= 70 else "❌")
        report += f"| {m.replace('_', ' ').title()} | {pass_rate:.1f}% | {m_status} |\n"


    report += "\n## Detailed Diagnostic Results\n\n"
    
    for i, r in enumerate(results):
        val = r["validation"]
        status = "✅ PASS" if val["score_pct"] == 100 else "⚠️ FAIL"
        
        report += f"### Sample {i+1}: {status}\n"
        report += f"- **Type**: {r['type']}\n"
        report += f"- **Score**: {val['score_pct']:.1f}%\n"
        report += f"- **Summary**: {val['summary']}\n"
        
        report += "\n**Diagnostic Metrics**:\n"
        for m, v in val["metrics"].items():
            icon = "✅" if is_pass(m, v) else "❌"
            report += f"- {icon} **{m.replace('_', ' ').title()}**: {v}\n"
        
        report += "\n#### Input\n"
        report += f"> {r['input']}\n\n"
        
        report += "#### Expected vs Actual\n"
        report += "<details>\n<summary>View Comparison</summary>\n\n"
        report += "**Expected**:\n"
        report += f"```text\n{r['expected_output']}\n```\n\n"
        report += "**Actual**:\n"
        report += f"```text\n{r['actual_output']}\n```\n"
        report += "</details>\n\n"
        
        report += "---\n\n"

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(report)
    
    print(f"Validation report saved to {REPORT_FILE}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate RAG mode against synthetic benchmarks.")
    parser.add_argument("--n", type=int, default=5, help="Number of samples to test.")
    args = parser.parse_args()
    
    run_validation(args.n)
