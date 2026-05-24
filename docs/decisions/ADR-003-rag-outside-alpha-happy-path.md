# ADR-003: RAG fuera del happy path del MVP Alpha

Fecha: 2026-05-24
Estado: aceptada

## Contexto

La rama `arnau` contiene un modulo RAG lateral con pgvector, embeddings, context packs, ingesta y busqueda. La auditoria concluye que es rescatable como referencia tecnica, pero no esta conectado al `problem_definition_agent` y aumentaria la complejidad operativa del primer MVP.

El Alpha necesita demostrar propuesta, documentos, gaps, problema, solucion y reporte basico antes de introducir retrieval avanzado.

## Decision

RAG avanzado queda fuera del happy path del MVP Alpha.

Se permite preparar una arquitectura desacoplada:

- `RetrievalPort`.
- `NoopRetrieval` por defecto.
- `UploadedDocumentsRetrieval` simple si ayuda a trabajar con fuentes internas.

El RAG de `arnau` se evaluara mas adelante como adapter opcional, no como dependencia obligatoria.

## Condiciones para RAG avanzado

Antes de activar RAG avanzado debe existir:

- Corpus aprobado.
- Politica de citas/fuentes.
- Versionado editorial.
- Decision explicita de producto/arquitectura.
- Tests y auditoria de fuentes usadas.

## Consecuencias

- pgvector no es requisito de Alpha.
- Embeddings no son requisito de Alpha.
- Ausencia de indice/corpus no bloquea el flujo.
- Retrieval no puede autocompletar hechos no aportados.
- Context packs externos no aprobados quedan fuera.
