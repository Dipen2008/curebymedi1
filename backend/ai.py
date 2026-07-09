import os
import logging

from google import genai
from google.genai import types

from groq import Groq
from openai import OpenAI
import httpx

log = logging.getLogger("AI")

# ----------------------------------------------------
# Models
# ----------------------------------------------------

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash",
)

GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "llama-3.3-70b-versatile",
)

OPENROUTER_MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "qwen/qwen3-32b",
)

# ----------------------------------------------------
# Lazy Clients
# ----------------------------------------------------

def get_gemini():
    return genai.Client(
        api_key=os.getenv("GEMINI_API_KEY")
    )


def get_groq():
    return Groq(
        api_key=os.getenv("GROQ_API_KEY"),
        timeout=30.0,
    )


def get_openrouter():

    client = httpx.Client(timeout=30.0)

    return OpenAI(
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url="https://openrouter.ai/api/v1",
        http_client=client,
    )

# ----------------------------------------------------
# Gemini
# ----------------------------------------------------

def _gemini(prompt, image=None, temperature=0.3):

    gemini = get_gemini()

    if image is None:

        response = gemini.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=temperature,
            ),
        )

    else:

        response = gemini.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                prompt,
                image,
            ],
            config=types.GenerateContentConfig(
                temperature=temperature,
            ),
        )

    return response.text.strip()

# ----------------------------------------------------
# Groq
# ----------------------------------------------------

def _groq(prompt):

    groq = get_groq()

    response = groq.chat.completions.create(
        model=GROQ_MODEL,
        temperature=0.3,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )

    return response.choices[0].message.content.strip()

# ----------------------------------------------------
# OpenRouter
# ----------------------------------------------------

def _openrouter(prompt):

    client = get_openrouter()

    response = client.chat.completions.create(
        model=OPENROUTER_MODEL,
        temperature=0.3,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )

    return response.choices[0].message.content.strip()

# ----------------------------------------------------
# Main AI
# ----------------------------------------------------

def ask_ai(prompt, image=None, temperature=0.3):

    # ---------------- Gemini ----------------

    try:
        log.info("Using Gemini")
        return _gemini(prompt, image, temperature)

    except Exception as e:
        import traceback
    traceback.print_exc()
    log.exception("Gemini failed")
    # ---------------- Groq ----------------

    if image is None:

        try:
            log.info("Using Groq")
            return _groq(prompt)

        except Exception as e:
             import traceback
    traceback.print_exc()
    log.exception("Groq failed")
    # ---------------- OpenRouter ----------------

    if image is None:

        try:
            log.info("Using OpenRouter")
            return _openrouter(prompt)

        except Exception as e:

             import traceback
    traceback.print_exc()
    log.exception("OpenRouter failed")

    raise Exception("All AI providers are unavailable.")

# ----------------------------------------------------
# Public API
# ----------------------------------------------------

def ask_ai_text(prompt, temperature=0.3):

    return ask_ai(
        prompt=prompt,
        image=None,
        temperature=temperature,
    )


def ask_ai_image(prompt, image, temperature=0.2):

    return _gemini(
        prompt,
        image=image,
        temperature=temperature,
    )