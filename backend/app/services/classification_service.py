"""Document classification + entity extraction.

Provider-agnostic: this module asks the configured `ChatProvider` for a JSON
object and validates it against the `ClassificationResult` schema. Adding a
new provider does not require any change here.
"""

from __future__ import annotations

from app.schemas.document import ClassificationResult, Entities
from app.services.llm import get_chat_provider


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


# Conservative cap on text sent to the model. Kept here (not in the provider)
# so the limit is provider-independent and the budgeting story stays simple.
_MAX_INPUT_CHARS = 12_000


async def classify_and_extract(text: str) -> ClassificationResult:
    provider = get_chat_provider()
    truncated = text[:_MAX_INPUT_CHARS]

    raw = await provider.complete_json(
        system_prompt=CLASSIFICATION_PROMPT,
        user_prompt=truncated,
    )

    return ClassificationResult(
        doc_type=raw.get("doc_type", "other"),
        entities=Entities(
            **{
                k: raw.get("entities", {}).get(k, [])
                for k in Entities.model_fields
            }
        ),
    )
