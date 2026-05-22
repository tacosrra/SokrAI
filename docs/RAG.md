# Modulo RAG (v1.5)

Modulo lateral de **Retrieval Augmented Generation** para SokrAI. Permite
indexar documentos por dominio (legal, costes, glosarios, etc.) y consultar
los fragmentos mas relevantes mediante similitud semantica multilingue
(castellano, catalan e ingles).

> Esta entrega es **independiente** del lane `problem_definition_agent`. No
> se conecta a ningun agente todavia. Habilita el rail para que agentes
> futuros lo consuman con una sola llamada.

## Arquitectura resumida

```
context-packs/<pack>/sources/*  ->  IngestionService
        |                                |
        |                  parse + chunk + embed (Ollama)
        |                                v
        |                       PostgreSQL + pgvector
        |                       (context_packs, rag_documents, rag_chunks)
        v                                |
   pnpm rag:ingest                       v
                                  RetrievalService
                                         |
                              top-K cosine + audit
                                         v
                              GET /api/v1/rag/search
                              GET /api/v1/rag/packs
                              pnpm rag:search
```

## Decisiones de diseno

| Pieza             | Decision                                 |
|-------------------|------------------------------------------|
| Vector store      | `pgvector` sobre la Postgres existente   |
| Modelo embedding  | `bge-m3` via Ollama (1024 dimensiones)   |
| Idiomas           | castellano, catalan, ingles              |
| Almacen documental| filesystem bind-mount + metadata en DB   |
| Modo de ingesta   | CLI (`pnpm rag:ingest`)                  |
| Endpoints HTTP    | solo lectura (`GET /api/v1/rag/...`)     |
| Indice vectorial  | HNSW (`vector_cosine_ops`)               |
| Versionado de docs| sha256 por archivo, `status` archivado   |

## Variables de entorno

Anadelas a `.env` (ya estan en `.env.example` con sus defaults):

```bash
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024
EMBEDDING_TIMEOUT_MS=30000
EMBEDDING_BATCH_SIZE=16
RAG_DEFAULT_TOP_K=8
RAG_PACKS_DIR=./context-packs   # en docker: /app/context-packs
```

## Setup inicial

Desde la raíz del repo (con `docker compose up -d`), en el orden:

```bash
# 1. Pull del modelo de embeddings (una sola vez)
docker compose exec -T ollama ollama pull bge-m3

# 2. Aplicar migraciones (incluye 002_rag.sql).
#    Preferible desde el host con DATABASE_URL al puerto que expone Postgres en tu máquina,
#    o con `pnpm migrate` dentro del contenedor `api` si usas redes internas de Docker.
pnpm migrate

# 3. (Opcional) Probar el pack de ejemplo
pnpm rag:ingest --pack general_glossary
pnpm rag:search --pack general_glossary --query "sesión turno snapshot" --k 5
```

### Si `ollama pull bge-m3` falla (antivirus / firewall / CDN)

Ollama descarga blobs desde infraestructura que a veces pasa por **Cloudflare R2**.
Antivirus muy agresivos (p. ej. Norton) pueden **bloquear ese tráfico** y el `pull` termina en
timeouts o «connection refused» a dominios tipo `*.r2.cloudflarestorage.com`.

**Alternativa gratuita (misma pila):** desde Ollama **0.3+**, puedes obtener el GGUF público desde
**HuggingFace** (muchas redes bloquean R2 pero no el bridge `xethub` de HF) y crear el alias que ya
usa SokrAI (`bge-m3`):

```bash
docker compose exec -T ollama ollama pull hf.co/CompendiumLabs/bge-m3-gguf
docker compose exec -T ollama ollama cp hf.co/CompendiumLabs/bge-m3-gguf bge-m3
```

Comprueba que el vector tiene **1024** dimensiones (requerido por la migración `002_rag.sql`):

```bash
docker compose exec -T api node -e "fetch('http://ollama:11434/api/embed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'bge-m3',input:'prueba'})}).then(r=>r.json()).then(j=>console.log('dim',j.embeddings[0].length))"
```

## Crear un nuevo pack

1. Crea la carpeta:
   ```text
   context-packs/<pack_name>/
       pack.yaml
       sources/
           tu-documento.pdf
           otro-documento.md
   ```
2. Rellena `pack.yaml`:
   ```yaml
   name: <pack_name>
   description: ...
   primary_language: es
   embedding:
     provider: ollama
     model: bge-m3
     dimension: 1024
   chunking:
     strategy: markdown_first   # markdown_first | plain_text
     target_tokens: 600
     overlap_tokens: 100
   metadata:
     domain: legal
     jurisdiction: ES
   ```
3. Ingesta:
   ```bash
   pnpm rag:ingest --pack <pack_name>
   ```

### Reglas

- `name` en `pack.yaml` debe coincidir con el nombre de la carpeta.
- `embedding.dimension` debe coincidir con `EMBEDDING_DIMENSION`. Si cambias
  de modelo, dropea el pack y reingestalo.
- Extensiones soportadas: `.md`, `.markdown`, `.txt`, `.pdf` (texto extraible).
- Los archivos sin extension soportada se ignoran silenciosamente.

## Reingestion y versionado

- Si reingestas y un fichero **no ha cambiado** (mismo `sha256`), se marca
  como `skipped`.
- Si **ha cambiado**, la version anterior y sus chunks pasan a `archived` y
  se inserta la nueva como `active`. Nada se borra.
- Las busquedas filtran por defecto `status = 'active'`. Auditoria a traves
  de `rag_retrievals.retrieved_chunks_json`.

## Comprobar a ojo (navegador)

La SPA (`apps/web`) incluye **Explorador RAG**, que llama a los mismos endpoints
solo-lectura que el CLI (`GET /api/v1/rag/packs` y `GET /api/v1/rag/search`).

Arranque con proxy a la API (por ejemplo `pnpm --filter @sokrai/web dev` con
`API_PROXY_TARGET` apuntando a tu Fastify). En portada hay el botón
**Explorador RAG**, o puede abrirse directamente con la URL `http://localhost:3000/#rag`.

Ahi ves el modelo de embedding usado, la latencia, el `retrieval_id` y los
fragmentos recuperados tal como salen del vector store. Si el texto de un resultado
 coincide con lo que tienes en `context-packs/.../sources/`, **está** funcionando contra
 tus documentos reales.

## Comandos utiles

```bash
# Ingestar un pack concreto
pnpm rag:ingest --pack legal_es

# Ingestar todos los packs disponibles
pnpm rag:ingest --all

# Buscar en un pack
pnpm rag:search --pack legal_es --query "tratamiento de datos sensibles"

# Buscar en multiples packs
pnpm rag:search --pack legal_es,glossary_es --query "consentiment informat"

# Filtrar por idioma
pnpm rag:search --pack legal_es --query "consentiment" --language ca

# Inspeccion HTTP (solo lectura)
curl http://localhost:3001/api/v1/rag/packs
curl "http://localhost:3001/api/v1/rag/search?pack=legal_es&q=encriptacion&k=5"
```

## Punto de gancho para agentes futuros

Cuando llegue un agente que necesite RAG (legal, costes, regulatorio), el
codigo del service del agente solo necesita esto:

```ts
const result = await app.services.rag.retrieval.retrieve({
  query: queryText,
  packs: ['legal_es'],
  topK: 6,
  requester: 'agent_run',
  requesterRef: agentRunId,
});

const sourcesBlock = app.services.rag.buildSourcesBlock(result.chunks);
// inyectar sourcesBlock en el userPrompt del modelo
```

Y al validar la respuesta del modelo (cuando incluya `citations: string[]`):

```ts
const { valid, invented } = app.services.rag.validateCitations(
  output.citations,
  result.chunks,
);
```

Cero cambios en `LlmOrchestrator`, en domain ni en otros services.

## Tablas de la base de datos

- `context_packs`: registro por pack (`name` UNIQUE, modelo embedding, dim).
- `rag_documents`: un documento por archivo+sha. `status` activo o
  archivado.
- `rag_chunks`: chunks con `embedding vector(1024)`. Indexado con HNSW
  cosine.
- `rag_retrievals`: auditoria por consulta (`requester`, `query_text`,
  `query_embedding`, `retrieved_chunks_json`, `latency_ms`).

No hay foreign key a `agent_runs` en esta entrega. Cuando se conecte un
agente real, se anadira via migracion 003.

## Limitaciones conocidas

- PDFs **escaneados** sin texto extraible no se soportan (no hay OCR).
- Solo proveedor Ollama en v1. Cambiar a OpenAI o Cohere es trivial: nueva
  clase que implemente `EmbeddingClient` y un switch en `index.ts`.
- Sin reranker hibrido (BM25 + cosine), sin HyDE, sin multi-query. Solo
  top-K cosine puro.
- Sin endpoints HTTP de escritura (`POST /rag/ingest`). Ingesta solo via
  CLI para reducir superficie.
- Dimension del vector fijada a 1024 en el schema SQL. Para usar otro
  modelo con dimension distinta hace falta otra migracion + reingestion.

## Cambiar de modelo de embeddings

Si `bge-m3` no encaja por RAM o latencia, opcion mas ligera con peor
calidad multilingue:

```bash
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSION=768
```

Luego:
1. Edita la migracion 002 o crea una 003 que cambie `vector(1024)` a
   `vector(768)` (drop + recreate por simplicidad si no hay datos).
2. Reingesta todos los packs.
