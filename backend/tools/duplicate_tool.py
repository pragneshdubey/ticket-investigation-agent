import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error, request

OLLAMA_BASE_URL = "http://localhost:11434"
EMBEDDING_MODEL = "nomic-embed-text"
DEFAULT_DUPLICATE_THRESHOLD = 0.80

ROOT_DIR = Path(__file__).resolve().parents[2]
OPEN_TICKETS_PATH = ROOT_DIR / "backend" / "data" / "open_tickets" / "open_tickets.json"

# In-memory cache for open ticket embeddings
_OPEN_TICKETS_CACHE: Optional[List[Dict[str, Any]]] = None
_EMBEDDINGS_CACHE: Optional[Dict[str, List[float]]] = None


def get_embedding(text: str) -> List[float]:
    """Generate text embedding using local Ollama nomic-embed-text model."""
    payload = {
        "model": EMBEDDING_MODEL,
        "prompt": text,
    }
    req = request.Request(
        f"{OLLAMA_BASE_URL}/api/embeddings",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            body = response.read().decode("utf-8")
            result = json.loads(body)
            embedding = result.get("embedding")
            if not embedding:
                raise RuntimeError("Ollama returned empty embedding response")
            return embedding
    except error.URLError as exc:
        raise RuntimeError(
            f"Failed to connect to Ollama embedding API ({OLLAMA_BASE_URL}): {exc}"
        ) from exc
    except Exception as exc:
        raise RuntimeError(f"Error generating embedding: {exc}") from exc


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculate cosine similarity between two vector embeddings."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    mag1 = math.sqrt(sum(a * a for a in v1))
    mag2 = math.sqrt(sum(b * b for b in v2))
    if not mag1 or not mag2:
        return 0.0
    return dot / (mag1 * mag2)


def _load_and_cache_open_tickets() -> None:
    """Load open tickets dataset and precompute/cache vector embeddings."""
    global _OPEN_TICKETS_CACHE, _EMBEDDINGS_CACHE
    if _OPEN_TICKETS_CACHE is not None and _EMBEDDINGS_CACHE is not None:
        return

    if not OPEN_TICKETS_PATH.exists():
        raise FileNotFoundError(f"Open tickets dataset not found at {OPEN_TICKETS_PATH}")

    tickets = json.loads(OPEN_TICKETS_PATH.read_text(encoding="utf-8"))
    embeddings_map: Dict[str, List[float]] = {}
    for ticket in tickets:
        ticket_id = ticket["id"]
        ticket_text = ticket["text"]
        embeddings_map[ticket_id] = get_embedding(ticket_text)

    _OPEN_TICKETS_CACHE = tickets
    _EMBEDDINGS_CACHE = embeddings_map


def search_duplicate_tickets(
    ticket_text: str, top_k: int = 3, threshold: float = DEFAULT_DUPLICATE_THRESHOLD
) -> Dict[str, Any]:
    """
    Search for similar/duplicate open tickets using semantic embeddings.

    Args:
        ticket_text: Text of the target ticket.
        top_k: Number of top similar matches to return.
        threshold: Cosine similarity threshold to flag a match as a likely duplicate.

    Returns:
        Structured result indicating matches, similarity scores, and duplicate flag.
    """
    _load_and_cache_open_tickets()
    assert _OPEN_TICKETS_CACHE is not None and _EMBEDDINGS_CACHE is not None

    query_embedding = get_embedding(ticket_text)

    scored_matches = []
    for ticket in _OPEN_TICKETS_CACHE:
        ticket_id = ticket["id"]
        ticket_embedding = _EMBEDDINGS_CACHE[ticket_id]
        score = cosine_similarity(query_embedding, ticket_embedding)
        scored_matches.append(
            {
                "id": ticket_id,
                "text": ticket["text"],
                "category": ticket.get("category"),
                "priority": ticket.get("priority"),
                "similarity_score": round(score, 4),
            }
        )

    # Sort descending by similarity score
    scored_matches.sort(key=lambda x: x["similarity_score"], reverse=True)
    top_matches = scored_matches[:top_k]

    best_match = top_matches[0] if top_matches else None
    is_duplicate_found = (
        best_match is not None and best_match["similarity_score"] >= threshold
    )

    return {
        "is_duplicate_found": is_duplicate_found,
        "best_match": best_match if is_duplicate_found else None,
        "top_matches": top_matches,
        "threshold_used": threshold,
    }

