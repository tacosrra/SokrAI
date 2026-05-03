# Context packs

Cada subcarpeta de este directorio es un **context pack**: un bundle de
documentos asociado a un dominio (legal, costes, glosario, etc.) que el
m\u00f3dulo RAG indexa y consulta.

## Estructura esperada

```text
<pack_name>/
\u251c\u2500\u2500 pack.yaml        # manifest declarativo
\u2514\u2500\u2500 sources/         # documentos crudos (.md, .markdown, .txt, .pdf)
```

El nombre del manifest (`pack.yaml > name`) debe coincidir con el nombre de
la carpeta.

## Comandos

```bash
pnpm rag:ingest --pack <pack_name>     # indexa un pack concreto
pnpm rag:ingest --all                  # indexa todos los packs
pnpm rag:search --pack <pack_name> --query "..."
```

## Notas

- Los archivos sin extensi\u00f3n soportada (`.md`, `.markdown`, `.txt`, `.pdf`) se
  ignoran.
- Si reingestas un fichero con el mismo `source_path` pero distinto
  `sha256`, la versi\u00f3n previa queda archivada y la nueva se inserta como
  documento activo.
- Los PDFs deben tener texto extra\u00edble; v1 no soporta OCR.
- El idioma principal del pack se declara en `pack.yaml > primary_language`
  y se hereda como filtro opcional en las b\u00fasquedas.

Consulta `docs/RAG.md` para la gu\u00eda completa.
