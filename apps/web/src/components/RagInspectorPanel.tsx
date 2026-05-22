import { useCallback, useEffect, useState, type FormEvent } from 'react';

interface RagPackSummary {
  id: string;
  name: string;
  description: string | null;
  primary_language: string | null;
  embedding_model: string;
  embedding_dimension: number;
  active_chunks: number;
}

interface RagChunkRow {
  chunk_id: string;
  document_title: string | null;
  section_path: string | null;
  content: string;
  score: number;
}

interface RagSearchResponseBody {
  retrieval_id: string;
  embedding_provider: string;
  embedding_model: string;
  latency_ms: number;
  chunks: RagChunkRow[];
}

const SUGGESTED_QUERIES: { label: string; query: string }[] = [
  {
    label: 'Brief estructurado (texto muy concreto del glosario)',
    query: 'campos esenciales título objetivo dueño del problema evidencias alcance alternativas actuales',
  },
  {
    label: 'Snapshot (solo aparece así en tus docs SokrAI)',
    query: 'foto inmutable del estado de la sesión tras un hito reanudar y auditar',
  },
  {
    label: 'Catalán: propietari del problema',
    query: 'propietari del problema conseqüències de no resoldre finançament',
  },
];

function buildSearchUrl(params: { pack: string; q: string; k: number }): string {
  const searchParams = new URLSearchParams({
    pack: params.pack,
    q: params.q,
    k: String(params.k),
  });
  return `/api/v1/rag/search?${searchParams.toString()}`;
}

export function RagInspectorPanel({ onClose }: { readonly onClose: () => void }) {
  const [packs, setPacks] = useState<RagPackSummary[]>([]);
  const [packLoading, setPackLoading] = useState(true);
  const [packError, setPackError] = useState<string | null>(null);

  const [selectedPack, setSelectedPack] = useState('general_glossary');
  const [query, setQuery] = useState(SUGGESTED_QUERIES[0].query);
  const [topK, setTopK] = useState(5);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RagSearchResponseBody | null>(null);

  const loadPacks = useCallback(async () => {
    setPackLoading(true);
    setPackError(null);
    try {
      const response = await fetch('/api/v1/rag/packs');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as { packs?: RagPackSummary[] };
      const list = body.packs ?? [];
      setPacks(list);
      if (list.length > 0) {
        const preferred = list.find((p) => p.name === 'general_glossary');
        setSelectedPack(preferred?.name ?? list[0].name);
      }
    } catch {
      setPackError('No se pudieron cargar los packs. ¿Está la API en marcha (puerto 3001) y el proxy de Vite activo?');
    } finally {
      setPackLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPacks();
  }, [loadPacks]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    setLastResult(null);

    try {
      const url = buildSearchUrl({ pack: selectedPack, q: query.trim(), k: topK });
      const response = await fetch(url);

      const bodyUnknown = await response.json();
      if (!response.ok) {
        const detail =
          typeof bodyUnknown === 'object' &&
          bodyUnknown !== null &&
          'message' in bodyUnknown &&
          typeof (bodyUnknown as { message: unknown }).message === 'string'
            ? (bodyUnknown as { message: string }).message
            : response.statusText;
        throw new Error(detail || `HTTP ${response.status}`);
      }

      const body = bodyUnknown as RagSearchResponseBody;
      setLastResult(body);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Error desconocido en la búsqueda.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="rag-inspector" aria-labelledby="rag-inspector-title">
      <div className="rag-inspector__header">
        <div>
          <h2 id="rag-inspector-title">Explorador RAG</h2>
          <p>
            Busca en los <strong>packs indexados</strong> y comprueba que los fragmentos devueltos coinciden con el
            texto de tus documentos (mismo embedding que usa la API en ingesta).
          </p>
        </div>
        <button type="button" className="rag-inspector__close" onClick={onClose}>
          Volver a la consola
        </button>
      </div>

      <div className="rag-inspector__hints">
        <span className="rag-inspector__hints-label">Pruebas sugeridas (rellenan la caja de búsqueda):</span>
        <div className="rag-inspector__chip-row">
          {SUGGESTED_QUERIES.map((item) => (
            <button
              key={item.label}
              type="button"
              className="rag-inspector__chip"
              onClick={() => setQuery(item.query)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {packLoading ? (
        <p className="rag-inspector__status">Cargando packs…</p>
      ) : null}
      {packError ? <div className="banner banner--error">{packError}</div> : null}

      <form className="rag-inspector__form" onSubmit={handleSearch}>
        <label className="rag-inspector__field">
          <span>Pack</span>
          <select
            value={selectedPack}
            onChange={(event) => setSelectedPack(event.target.value)}
            disabled={packs.length === 0}
          >
            {packs.map((pack) => (
              <option key={pack.id} value={pack.name}>
                {pack.name} · {pack.active_chunks} chunks · {pack.embedding_model}
              </option>
            ))}
          </select>
        </label>

        <label className="rag-inspector__field rag-inspector__field--grow">
          <span>Consulta</span>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
            placeholder="Escribe una pregunta o palabras clave que deberían aparecer en tus fuentes…"
            required
          />
        </label>

        <label className="rag-inspector__field rag-inspector__field--narrow">
          <span>Top K</span>
          <input
            type="number"
            min={1}
            max={24}
            value={topK}
            onChange={(event) => setTopK(Number(event.target.value) || 1)}
          />
        </label>

        <button type="submit" className="rag-inspector__submit" disabled={searching || packs.length === 0}>
          {searching ? 'Buscando…' : 'Buscar en vector store'}
        </button>
      </form>

      {searchError ? <div className="banner banner--error">{searchError}</div> : null}

      {lastResult ? (
        <div className="rag-inspector__results">
          <div className="rag-inspector__meta">
            <span>
              <strong>embedding</strong> {lastResult.embedding_provider} / {lastResult.embedding_model}
            </span>
            <span>
              <strong>latencia</strong> {lastResult.latency_ms} ms
            </span>
            <span>
              <strong>chunks</strong> {lastResult.chunks.length}
            </span>
            <span className="rag-inspector__meta-muted">retrieval_id {lastResult.retrieval_id}</span>
          </div>

          {lastResult.chunks.length === 0 ? (
            <p className="rag-inspector__status">Sin resultados. Prueba otro pack, otra consulta o revisa que hayas ejecutado la ingesta.</p>
          ) : (
            <ol className="rag-inspector__chunk-list">
              {lastResult.chunks.map((chunk, index) => (
                <li key={chunk.chunk_id} className="rag-inspector__chunk">
                  <div className="rag-inspector__chunk-head">
                    <span className="rag-inspector__chunk-rank">#{index + 1}</span>
                    <span className="rag-inspector__chunk-score">score {chunk.score.toFixed(4)}</span>
                  </div>
                  <div className="rag-inspector__chunk-title">{chunk.document_title ?? 'Sin título'}</div>
                  {chunk.section_path ? (
                    <div className="rag-inspector__chunk-section">{chunk.section_path}</div>
                  ) : null}
                  <pre className="rag-inspector__chunk-body">{chunk.content}</pre>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
