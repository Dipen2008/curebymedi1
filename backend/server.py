from dotenv import load_dotenv
from pathlib import Path

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

import os
import io
import json
import asyncio
import logging
import subprocess
from typing import Optional

import httpx

from PIL import Image

from google import genai
from google.genai import types

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

log = logging.getLogger("bridge")

NODE_BASE = os.environ.get(
    "NODE_BASE",
    "https://curebymedi.onrender.com"
)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

client = genai.Client(api_key=GEMINI_API_KEY)

_node_proc: Optional[subprocess.Popen] = None

# ------------------------------------------------------------
# Start / Stop Node Backend
# ------------------------------------------------------------

def _start_node():
    global _node_proc

    env = {
        **os.environ,
        "NODE_PORT": str(NODE_PORT),
        "NODE_HOST": NODE_HOST,
    }

    log.info("Starting Node backend...")

    _node_proc = subprocess.Popen(
        ["node", "server.js"],
        cwd=str(ROOT / "node"),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        bufsize=1,
    )

    def pump():
        assert _node_proc and _node_proc.stdout

        for line in _node_proc.stdout:
            print("[NODE]", line, end="")

    import threading

    threading.Thread(target=pump, daemon=True).start()


def _stop_node():
    global _node_proc

    if _node_proc and _node_proc.poll() is None:

        log.info("Stopping Node backend...")

        _node_proc.terminate()

        try:
            _node_proc.wait(timeout=10)

        except subprocess.TimeoutExpired:

            _node_proc.kill()


# ------------------------------------------------------------
# FastAPI
# ------------------------------------------------------------

app = FastAPI(title="CureByMedi AI Bridge")


@app.on_event("startup")
async def startup():
    pass

    # Wait until Node is alive

    for _ in range(60):

        try:

            async with httpx.AsyncClient(timeout=2) as client_http:

                r = await client_http.get(f"{NODE_BASE}/api/health")

                if r.status_code == 200:

                    log.info("Node backend is ready")

                    return

        except Exception:

            pass

        await asyncio.sleep(1)

    log.warning("Node backend not ready yet.")


@app.on_event("shutdown")
async def shutdown():

    _stop_node()
    # ------------------------------------------------------------
# IMAGE SCAN
# ------------------------------------------------------------

class ScanBody(BaseModel):
    image_base64: str
    mime: str = "image/jpeg"


@app.post("/api/_python/scan")
async def python_scan(body: ScanBody):

    if not GEMINI_API_KEY:
        return JSONResponse(
            {"error": "GEMINI_API_KEY not configured"},
            status_code=500,
        )

    try:

        image_bytes = base64.b64decode(body.image_base64)

        image = Image.open(io.BytesIO(image_bytes))

        prompt = """
You are a pharmacist.

Read the medicine strip, bottle or box.

Return ONLY JSON.

{
"name":"medicine name",
"summary":"one short sentence explaining what it is used for"
}

If the medicine name cannot be read:

{
"name":"",
"summary":"Unable to identify medicine."
}
"""

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                prompt,
                image,
            ],
            config=types.GenerateContentConfig(
                temperature=0.2
            ),
        )

        text = response.text.strip()

        start = text.find("{")
        end = text.rfind("}")

        if start == -1 or end == -1:
            raise Exception("Gemini returned invalid response.")

        data = json.loads(text[start:end + 1])

        return {
            "name": data.get("name", ""),
            "summary": data.get("summary", "")
        }

    except Exception as e:

        return JSONResponse(
            {"error": str(e)},
            status_code=500,
        )
    # ------------------------------------------------------------
# AI MEDICINE ENRICHMENT
# ------------------------------------------------------------

class EnrichBody(BaseModel):
    name: str
    composition: str = ""
    manufacturer: str = ""
    type: str = ""
    category: str = ""


@app.post("/api/_python/enrich")
async def python_enrich(body: EnrichBody):

    if not GEMINI_API_KEY:
        return JSONResponse(
            {"error": "GEMINI_API_KEY not configured"},
            status_code=500,
        )

    prompt = f"""
You are an experienced pharmacist.

Generate medicine information for:

Medicine: {body.name}
Composition: {body.composition}
Manufacturer: {body.manufacturer}
Type: {body.type}
Category: {body.category}

Return ONLY valid JSON.

{{
"usedFor":"",
"dailyDosage":"",
"howToTake":"",
"benefits":"",
"bodyEffects":"",
"sideEffects":"",
"warnings":""
}}

Rules:

- Use simple English.
- Keep every field short.
- Never use Markdown.
- Never add explanations outside JSON.
- If information is unavailable, write:
"Consult your doctor."
"""

    try:

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3
            ),
        )

        text = response.text.strip()

        start = text.find("{")
        end = text.rfind("}")

        if start == -1 or end == -1:
            raise Exception("Invalid JSON returned by Gemini.")

        data = json.loads(text[start:end + 1])

        return {
            "usedFor": str(data.get("usedFor", "")),
            "dailyDosage": str(data.get("dailyDosage", "")),
            "howToTake": str(data.get("howToTake", "")),
            "benefits": str(data.get("benefits", "")),
            "bodyEffects": str(data.get("bodyEffects", "")),
            "sideEffects": str(data.get("sideEffects", "")),
            "warnings": str(data.get("warnings", "")),
        }

    except Exception as e:

        return JSONResponse(
            {"error": str(e)},
            status_code=500,
        )
    # ------------------------------------------------------------
# AI DRUG INTERACTION CHECKER
# ------------------------------------------------------------

class InteractionsBody(BaseModel):
    medicines: list
    language: str = "en"


@app.post("/api/_python/interactions")
async def python_interactions(body: InteractionsBody):

    if not GEMINI_API_KEY:
        return JSONResponse(
            {"error": "GEMINI_API_KEY not configured"},
            status_code=500,
        )

    language = "English"

    if body.language == "hi":
        language = "Hindi"

    prompt = f"""
You are an experienced pharmacist.

Analyse these medicines:

{json.dumps(body.medicines, indent=2)}

Reply ONLY in {language}.

Return ONLY valid JSON.

{{
  "riskLevel":"safe",
  "summary":"",
  "pairs":[
      {{
         "a":"",
         "b":"",
         "level":"",
         "explanation":""
      }}
  ],
  "advice":""
}}

Rules:

riskLevel must be one of

safe
caution
avoid

Keep explanations short.

Always finish advice with:

Please consult your doctor.
"""

    try:

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2
            ),
        )

        text = response.text.strip()

        start = text.find("{")
        end = text.rfind("}")

        if start == -1 or end == -1:
            raise Exception("Gemini returned invalid JSON.")

        data = json.loads(text[start:end + 1])

        risk = str(data.get("riskLevel", "caution")).lower()

        if risk not in ["safe", "caution", "avoid"]:
            risk = "caution"

        pairs = []

        for item in data.get("pairs", []):

            pairs.append({
                "a": str(item.get("a", "")),
                "b": str(item.get("b", "")),
                "level": str(item.get("level", "caution")).lower(),
                "explanation": str(item.get("explanation", "")),
            })

        return {
            "riskLevel": risk,
            "summary": str(data.get("summary", "")),
            "pairs": pairs,
            "advice": str(data.get("advice", "")),
        }

    except Exception as e:

        return JSONResponse(
            {"error": str(e)},
            status_code=500,
        )
   # ------------------------------------------------------------
# AI SYMPTOM → MEDICINE SUGGESTIONS
# ------------------------------------------------------------

class SuggestBody(BaseModel):
    symptoms: str
    language: str = "en"


@app.post("/api/_python/suggest")
async def python_suggest(body: SuggestBody):

    if not GEMINI_API_KEY:
        return JSONResponse(
            {"error": "GEMINI_API_KEY not configured"},
            status_code=500,
        )

    language = "English"

    if body.language == "hi":
        language = "Hindi"

    prompt = f"""
You are an experienced pharmacist.

The user reports these symptoms:

{body.symptoms}

Reply ONLY in {language}.

Suggest ONLY common over-the-counter medicines that are commonly available.

Never recommend antibiotics, narcotics or prescription-only medicines.

Return ONLY valid JSON.

{{
    "disclaimer":"",
    "suggestions":[
        {{
            "name":"",
            "composition":"",
            "reason":"",
            "dosage":""
        }}
    ],
    "redFlags":[]
}}

Rules:

- Suggest between 2 and 4 medicines.
- Use simple language.
- Keep every answer short.
- If symptoms appear serious, mention that immediate medical attention is needed.
- Always recommend consulting a doctor if symptoms persist.
"""

    try:

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.4
            ),
        )

        text = response.text.strip()

        start = text.find("{")
        end = text.rfind("}")

        if start == -1 or end == -1:
            raise Exception("Gemini returned invalid JSON.")

        data = json.loads(text[start:end + 1])

        suggestions = []

        for item in data.get("suggestions", []):

            suggestions.append({
                "name": str(item.get("name", "")),
                "composition": str(item.get("composition", "")),
                "reason": str(item.get("reason", "")),
                "dosage": str(item.get("dosage", "")),
            })

        return {
            "disclaimer": str(data.get("disclaimer", "")),
            "suggestions": suggestions,
            "redFlags": [
                str(flag) for flag in data.get("redFlags", [])
            ],
        }

    except Exception as e:

        return JSONResponse(
            {"error": str(e)},
            status_code=500,
        ) 
    # ------------------------------------------------------------
# PROXY ALL OTHER REQUESTS TO NODE.JS
# ------------------------------------------------------------

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "host",
}


@app.api_route(
    "/{full_path:path}",
    methods=[
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
        "OPTIONS",
    ],
)
async def proxy(full_path: str, request: Request):

    # Don't proxy internal Gemini endpoints
    if full_path.startswith("api/_python/"):
        return JSONResponse(
            {"detail": "Not found"},
            status_code=404,
        )

    url = f"{NODE_BASE}/{full_path}"

    body = await request.body()

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP
    }

    headers["x-forwarded-host"] = request.headers.get("host", "")

    headers["x-forwarded-proto"] = request.headers.get(
        "x-forwarded-proto",
        "https",
    )

    try:

        async with httpx.AsyncClient(timeout=180.0) as client_http:

            response = await client_http.request(
                method=request.method,
                url=url,
                headers=headers,
                params=dict(request.query_params),
                content=body,
            )

        response_headers = {
            k: v
            for k, v in response.headers.items()
            if k.lower() not in HOP_BY_HOP
        }

        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=response_headers,
            media_type=response.headers.get("content-type"),
        )

    except httpx.ConnectError:

        return JSONResponse(
            {
                "detail": "Node backend is starting. Please retry in a moment."
            },
            status_code=503,
        )

    except Exception as e:

        log.exception(e)

        return JSONResponse(
            {
                "detail": str(e),
            },
            status_code=500,
        )