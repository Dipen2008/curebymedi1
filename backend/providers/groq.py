from groq import Groq
import os

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def generate(prompt):
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role":"user",
                "content":prompt
            }
        ],
        temperature=0.4,
    )

    return response.choices[0].message.content