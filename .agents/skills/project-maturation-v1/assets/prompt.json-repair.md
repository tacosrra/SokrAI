# JSON repair prompt

You will receive text that was intended to be JSON but is invalid.

## Task

Return a corrected version that is:
- valid JSON
- faithful to the original meaning
- compliant with the required schema

## Rules

- Return JSON only.
- Do not add explanations.
- Do not invent missing semantic content unless required to preserve structure.
- Preserve keys and values whenever possible.
