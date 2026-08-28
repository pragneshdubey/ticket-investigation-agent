from fastapi import FastAPI

app = FastAPI(
    title="ResolveAI",
    description="Agentic IT Support Ticket Triage System",
    version="0.1.0"
)


@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "ResolveAI backend is running"
    }