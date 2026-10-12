from fastapi import FastAPI

app = FastAPI(title="Enigma Engine")


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "service": "enigma-engine"}
