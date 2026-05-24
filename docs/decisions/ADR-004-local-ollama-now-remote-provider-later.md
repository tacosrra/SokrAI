# ADR-004: Ollama local ahora, proveedor remoto/VPS mas adelante

Fecha: 2026-05-24
Estado: aceptada

## Contexto

La arquitectura actual usa Ollama local. El MVP debe poder ejecutarse en demo local/on-premise sin enviar contenido a proveedores externos.

Tambien existe la posibilidad futura de usar un proveedor local mas potente alojado en VPS/on-prem, pero no debe bloquear ni ensanchar el MVP.

## Decision

Mantener Ollama local como proveedor IA actual del MVP.

Preparar la arquitectura con una abstraccion interna de proveedor IA, pero no implementar ni disenar despliegue VPS en MVP.

## Consecuencias

- La API sigue llamando al proveedor IA server-side.
- El frontend no llama al proveedor IA.
- No hay fallback automatico a proveedor externo.
- El dominio debe desacoplarse gradualmente de detalles de Ollama.
- Proveedor IA remoto/VPS/on-prem potente queda como PR futura.

## Condiciones para proveedor futuro

Antes de disenar o implementar un proveedor remoto/VPS debe existir:

- Necesidad demostrada por calidad, latencia o capacidad.
- Decision explicita de seguridad y operacion.
- Politica de datos clara.
- Abstraccion IA estable.
- Evaluacion de despliegue y mantenimiento.
