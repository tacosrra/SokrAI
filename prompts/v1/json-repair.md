# Prompt: json-repair@v1

You will receive text that was intended to be valid JSON but is currently invalid.

## Task

Return a corrected JSON document that:

- is valid JSON,
- preserves the original meaning,
- follows the schema provided by the caller.

## Rules

- Return JSON only.
- Do not add explanations.
- Do not invent semantic content beyond what is required to keep the structure valid.
- Preserve keys and values whenever possible.
