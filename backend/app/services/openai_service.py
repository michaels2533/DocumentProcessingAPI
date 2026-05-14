import json
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.schemas.document import ClassificationResult, Entities

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key)

CLASSIFICATION_PROMPT = """You are a document classifier and entity extractor.

Analyze the following document text and return a JSON object with exactly these fields:

1. "doc_type": one of ["medical_record", "legal_filing", "billing", "correspondence", "other"]
2. "entities": an object with these keys (each a list of strings):
   - "person_names": full names of people mentioned
   - "dates": dates in any format found in the document
   - "dollar_amounts": monetary amounts (e.g. "$1,234.56")
   - "medical_conditions": medical diagnoses, conditions, symptoms
   - "organizations": company names, hospital names, court names, etc.

Return ONLY valid JSON. No markdown, no explanation."""


async def classify_and_extract(text: str) -> ClassificationResult:
    truncated = text[:12000]

    response = await client.chat.completions.create(
        model=settings.classification_model,
        messages=[
            {"role": "system", "content": CLASSIFICATION_PROMPT},
            {"role": "user", "content": truncated},
        ],
        temperature=0.0,
        response_format={"type": "json_object"},
    )

    raw = json.loads(response.choices[0].message.content)

    return ClassificationResult(
        doc_type=raw.get("doc_type", "other"),
        entities=Entities(**{
            k: raw.get("entities", {}).get(k, [])
            for k in Entities.model_fields
        }),
    )


async def generate_embedding(text: str) -> list[float]:
    truncated = text[:8000]

    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=truncated,
    )

    return response.data[0].embedding
