from fastapi import FastAPI

app = FastAPI()

@app.get(" GET /health")
def health():
    return {"status": "ok"}