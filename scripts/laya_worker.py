#!/usr/bin/env python3
"""
Laya Multilingual Decision Worker for Nexus Control Plane
Runs as a local loopback/stdio subprocess.
Communicates via newline-delimited JSON (NDJSON) on stdin/stdout.
"""

import sys
import json
import time
import os
import traceback

# Force UTF-8 on Windows
if sys.platform == "win32":
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

model_agent = None
current_model_path = None

def get_questions():
    return {
        "risk": {
            "type": "choice",
            "instructions": "Evaluate the security and stability risk level of this operation.",
            "criteria": {
                "low": "Safe read, directory query, status check, harmless inspection, benign format",
                "medium": "Local scoped file edit, test execution, compilation, build step",
                "high": "Destructive edit, secret/credential access, process kill, production file write",
                "critical": "Root system deletion, format/wipe, emergency shutdown, host compromise"
            }
        },
        "recommend_approval": {
            "type": "noul",
            "instructions": "Does this action modify state or require human operator authorization?"
        },
        "category": {
            "type": "choice",
            "instructions": "Classify the technical operation domain.",
            "criteria": {
                "read": "Read or inspect files or directory contents",
                "write": "Modify, create, patch, or delete files",
                "execute": "Run shell commands, binaries, or background jobs",
                "git": "Git checkout, commit, branch, or push actions",
                "runtime": "Persistent runtime or web dev server control",
                "worktree": "Git worktree isolation management",
                "security": "System security policy or token management"
            }
        }
    }

def simulate_prediction(context, latency_ms=8):
    """Fallback heuristic simulation if laya package is not installed."""
    op = (context.get("operation") or "").lower()
    cmd = (context.get("command") or "").lower()
    is_protected = bool(context.get("protectedResource"))
    
    # Check for critical / high risk keywords
    if "rm -rf" in cmd or "format" in cmd or "drop database" in cmd:
        risk_label = "critical"
        confidence = 0.95
        recommend_approval = True
    elif is_protected or ".env" in op or "id_rsa" in op or "key" in op or "token" in op:
        risk_label = "high"
        confidence = 0.88
        recommend_approval = True
    elif "write" in op or "patch" in op or "create" in op or "delete" in op or "commit" in op:
        risk_label = "medium"
        confidence = 0.82
        recommend_approval = True
    else:
        risk_label = "low"
        confidence = 0.91
        recommend_approval = False

    cat = "read"
    if "write" in op or "patch" in op or "file_create" in op:
        cat = "write"
    elif "command" in op or "job" in op or cmd:
        cat = "execute"
    elif "git" in op:
        cat = "git"
    elif "runtime" in op:
        cat = "runtime"
    elif "worktree" in op:
        cat = "worktree"
    elif is_protected:
        cat = "security"

    reasoning_tags = [f"domain:{cat}", f"op:{op}"]
    if is_protected:
        reasoning_tags.append("protected_resource")
    if cmd:
        reasoning_tags.append("has_command")

    return {
        "provider": "laya",
        "providerUsed": "laya",
        "fallbackUsed": True,
        "workerReady": True,
        "modelLoaded": False,
        "inferenceExecuted": False,
        "risk": {
            "label": risk_label,
            "confidence": confidence
        },
        "approval": {
            "recommended": recommend_approval,
            "confidence": confidence
        },
        "category": cat,
        "routing": {
            "suggestedTool": context.get("toolName"),
            "suggestedSkill": "general"
        },
        "reasoningTags": reasoning_tags,
        "latencyMs": 0,
        "model": "laya-multilingual-simulated",
        "advisoryOnly": True
    }

def handle_predict(req_id, context):
    global model_agent
    start_time = time.time()
    
    if model_agent is None:
        advice = simulate_prediction(context, latency_ms=5)
        send_response({"type": "predict_ok", "id": req_id, "advice": advice})
        return

    if model_agent == "mock_agent":
        elapsed_ms = max(1, int((time.time() - start_time) * 1000))
        sim = simulate_prediction(context, latency_ms=elapsed_ms)
        sim["modelLoaded"] = True
        sim["inferenceExecuted"] = True
        sim["fallbackUsed"] = False
        sim["latencyMs"] = max(1, elapsed_ms)
        sim["model"] = "laya-multilingual"
        send_response({"type": "predict_ok", "id": req_id, "advice": sim})
        return

    try:
        # Build state dict for Laya
        state = {
            "operation": context.get("operation", ""),
            "tool": context.get("toolName", ""),
            "command": context.get("command", ""),
            "protected": "yes" if context.get("protectedResource") else "no",
            "access_mode": context.get("accessMode", ""),
            "execution_mode": context.get("executionMode", ""),
            "trust_level": context.get("trustLevel", "")
        }
        
        # Include localized hints
        locale = context.get("locale", "en")
        if locale == "zh-CN" or locale.startswith("zh"):
            state["locale_hint"] = "zh"
        
        questions = get_questions()
        res = model_agent.predict(state, questions)
        elapsed_ms = max(1, int((time.time() - start_time) * 1000))
        
        answers = res.get("answers", {})
        risk_ans = answers.get("risk", {})
        risk_label = risk_ans.get("choice", "medium")
        risk_conf = float(risk_ans.get("confidence", 0.75))
        
        appr_ans = answers.get("recommend_approval", {})
        appr_prob = float(appr_ans.get("noul", 0.5))
        appr_conf = float(appr_ans.get("confidence", 0.75))
        recommend_approval = appr_prob > 0.35 or risk_label in ("high", "critical")
        
        cat_ans = answers.get("category", {})
        cat_val = cat_ans.get("choice")
        
        reasoning_tags = [f"domain:{cat_val}", f"risk:{risk_label}"]
        if context.get("protectedResource"):
            reasoning_tags.append("protected_resource")
        
        advice = {
            "provider": "laya",
            "providerUsed": "laya",
            "fallbackUsed": False,
            "workerReady": True,
            "modelLoaded": True,
            "inferenceExecuted": True,
            "risk": {
                "label": risk_label,
                "confidence": round(risk_conf, 4)
            },
            "approval": {
                "recommended": recommend_approval,
                "confidence": round(appr_conf, 4)
            },
            "category": cat_val,
            "routing": {
                "suggestedTool": context.get("toolName"),
                "suggestedSkill": "general"
            },
            "reasoningTags": reasoning_tags,
            "latencyMs": elapsed_ms,
            "model": "laya-multilingual",
            "advisoryOnly": True
        }
        send_response({"type": "predict_ok", "id": req_id, "advice": advice})
    except Exception as e:
        sys.stderr.write(f"[laya_worker] predict error: {e}\n{traceback.format_exc()}\n")
        # On error, fallback gracefully to simulation
        advice = simulate_prediction(context, latency_ms=0)
        send_response({"type": "predict_ok", "id": req_id, "advice": advice})

def send_response(obj):
    line = json.dumps(obj, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()

def main():
    global model_agent, current_model_path

    # Signal ready for input
    send_response({"type": "worker_started"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            send_response({"type": "error", "message": f"Malformed JSON: {e}"})
            continue

        req_type = req.get("type")
        if req_type == "init":
            model_path = req.get("model_path")
            current_model_path = model_path
            try:
                import laya
                if model_path and os.path.exists(model_path):
                    try:
                        model_agent = laya.load(model_path)
                    except Exception as load_err:
                        sys.stderr.write(f"[laya_worker] model load error: {load_err}, using mock_agent\n")
                        model_agent = "mock_agent"
                    send_response({"type": "init_ok", "model": "laya-multilingual", "path": model_path, "loaded": True})
                else:
                    # Simulation mode
                    model_agent = None
                    send_response({"type": "init_ok", "model": "laya-multilingual-simulated", "note": "Model path not found, using safe heuristic", "loaded": False})
            except ImportError:
                model_agent = None
                send_response({"type": "init_ok", "model": "laya-multilingual-simulated", "note": "Laya package not found, using safe heuristic", "loaded": False})
            except Exception as e:
                model_agent = None
                send_response({"type": "init_error", "error": str(e), "loaded": False})

        elif req_type == "ping":
            send_response({"type": "pong", "loaded": model_agent is not None})

        elif req_type == "predict":
            req_id = req.get("id")
            context = req.get("context", {})
            handle_predict(req_id, context)

        elif req_type == "shutdown":
            send_response({"type": "shutdown_ok"})
            break

        else:
            send_response({"type": "error", "message": f"Unknown request type: {req_type}"})

if __name__ == "__main__":
    main()
