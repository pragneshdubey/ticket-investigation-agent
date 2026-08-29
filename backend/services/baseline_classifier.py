import json
from urllib import request, error

from backend.models.baseline import BaselineClassification

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "gemma3:4b"


def classify_ticket(text: str) -> BaselineClassification:
    prompt = (
        "You are an IT support ticket classifier.\n\n"
        "Classify the ticket into exactly one category:\n"
        "Account Access\n"
        "Hardware\n"
        "Network\n"
        "Software\n\n"
        "Classify the ticket into exactly one priority:\n"
        "Low\n"
        "Medium\n"
        "High\n\n"
        "Use the labels EXACTLY as written.\n"
        "Do not invent or modify labels.\n\n"
        "Return only JSON.\n\n"
        f"Ticket:\n{text}"
    )

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "format": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["Account Access", "Hardware", "Network", "Software"],
                },
                "priority": {
                    "type": "string",
                    "enum": ["Low", "Medium", "High"],
                },
            },
            "required": ["category", "priority"],
            "additionalProperties": False,
        },
    }

    req = request.Request(
        f"{OLLAMA_BASE_URL}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=120) as response:
            body = response.read().decode("utf-8")
    except error.URLError as exc:
        raise RuntimeError(f"Ollama request failed: {exc}") from exc

    try:
        result = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Ollama response was not valid JSON: {exc}") from exc

    content = result.get("message", {}).get("content")
    if not content:
        raise RuntimeError("Ollama returned no classification content")

    raw_json = content.strip()
    if raw_json.startswith("```"):
        raw_json = raw_json.strip("`")
        if raw_json.lower().startswith("json"):
            raw_json = raw_json[4:].lstrip()

    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Ollama returned malformed JSON: {exc}") from exc

    try:
        return BaselineClassification.model_validate(parsed)
    except Exception as exc:
        raise RuntimeError(
            "Ollama returned an invalid classification; category and priority must match the allowed baseline taxonomy."
        ) from exc