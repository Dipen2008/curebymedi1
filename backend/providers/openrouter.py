from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
)

def generate(prompt):

    response = client.chat.completions.create(
        model=os.getenv(
            "OPENROUTER_MODEL",
            "qwen/qwen3-32b"
        ),
        messages=[
            {
                "role":"user",
                "content":prompt
            }
        ],
    )

    return response.choices[0].message.content