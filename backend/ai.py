import os
import json
import logging

from google import genai
from google.genai import types

from groq import Groq
from openai import OpenAI

log = logging.getLogger("AI")

# -----------------------------
# Gemini
# -----------------------------

gemini = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

# -----------------------------
# Groq
# -----------------------------

groq = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)

# -----------------------------
# OpenRouter
# -----------------------------

openrouter = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
)

OPENROUTER_MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "qwen/qwen3-32b"
)


def _gemini(prompt, image=None, temperature=0.3):

    if image is None:

        response = gemini.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=temperature
            ),
        )

    else:

        response = gemini.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                prompt,
                image,
            ],
            config=types.GenerateContentConfig(
                temperature=temperature
            ),
        )

    return response.text.strip()


def _groq(prompt):

    response = groq.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )

    return response.choices[0].message.content.strip()


def _openrouter(prompt):

    response = openrouter.chat.completions.create(
        model=OPENROUTER_MODEL,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        temperature=0.3,
    )

    return response.choices[0].message.content.strip()


def ask_ai(prompt, image=None, temperature=0.3):

    # ---------------- Gemini ----------------

    try:

        log.info("Using Gemini")

        return _gemini(
            prompt,
            image,
            temperature,
        )

    except Exception as e:

        log.warning(f"Gemini failed: {e}")

    # ---------------- Groq ----------------

    if image is None:

        try:

            log.info("Using Groq")

            return _groq(prompt)

        except Exception as e:

            log.warning(f"Groq failed: {e}")

    # ---------------- OpenRouter ----------------

    if image is None:

        try:

            log.info("Using OpenRouter")

            return _openrouter(prompt)

        except Exception as e:

            log.warning(f"OpenRouter failed: {e}")

    raise Exception(
        "All AI providers are unavailable."
    )
def ask_ai_image(prompt, image, temperature=0.2):
    """
    Image requests (Gemini only)
    """
    return _gemini(
        prompt,
        image=image,
        temperature=temperature,
    )


def ask_ai_text(prompt, temperature=0.3):
    """
    Text requests (Gemini → Groq → OpenRouter)
    """
    return ask_ai(
        prompt=prompt,
        image=None,
        temperature=temperature,
    )