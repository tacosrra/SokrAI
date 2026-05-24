# ADR-001: Separar MVP Alpha y MVP Clinic Pilot

Fecha: 2026-05-24
Estado: aceptada

## Contexto

La documentacion previa mezclaba el primer vertical slice funcional con el piloto completo para Hospital Clinic. Eso aumentaba el riesgo de scope creep antes de empezar las PRs de implementacion.

Las auditorias muestran que `main` ya contiene una base util para intake, persistencia, Ollama, n8n y `problem_definition_agent`, pero no contiene todavia reporte completo, PDF, regulatorio, medical device ni hardening de piloto.

## Decision

Dividir el alcance en dos hitos:

- **MVP Alpha**: crear propuesta, subir o pegar documentacion, analizar gaps iniciales, chat de problema, seccion problema, chat de solucion, seccion solucion y reporte basico estructurado en la app.
- **MVP Clinic Pilot**: anadir regulatorio/datos/IA/privacidad, medical device condicional, recursos/piloto/viabilidad, PDF final y hardening de demo local.

## Consecuencias

- Las PRs 0-8 deben perseguir Alpha.
- Las PRs 9-13 deben perseguir Clinic Pilot.
- RAG avanzado, orquestador legal avanzado y proveedor IA remoto quedan como PRs futuras.
- Auth enterprise no bloquea Alpha.
- El producto sigue posicionado como maduracion previa a revision humana, no como evaluador final.

## No decision

Esta ADR no define tablas, endpoints ni UI final. Solo fija orden y alcance.
