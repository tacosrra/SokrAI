# ADR-002: Perfiles regulatorios configurables y `hospital_clinic_v1`

Fecha: 2026-05-24
Estado: aceptada

## Contexto

El Clinic Pilot necesita detectar gaps sobre datos, IA, privacidad, ciberseguridad y regulacion sanitaria, pero la herramienta no debe emitir dictamen legal/regulatorio definitivo.

Tambien se quiere evitar hardcodear para siempre un unico marco institucional.

## Decision

Modelar conceptualmente los marcos normativos como perfiles configurables por institucion.

En MVP solo existira un perfil por defecto:

`hospital_clinic_v1`

Familias normativas iniciales:

- RGPD / GDPR: proteccion de datos personales.
- Cybersecurity Act: ciberseguridad/certificacion TIC.
- EEDS / EHDS: Espacio Europeo de Datos de Salud.
- MDR: Medical Device Regulation.
- EU AI Act: sistemas de inteligencia artificial.
- HTAR: Health Technology Assessment Regulation.

## Reglas de salida

El perfil se usa para:

- Detectar gaps.
- Formular preguntas.
- Registrar incertidumbre.
- Indicar "requiere revision humana competente" cuando corresponda.

El perfil no se usa para:

- Afirmar cumplimiento o incumplimiento definitivo.
- Emitir dictamen legal, regulatorio, clinico, de privacidad o medical device.
- Sustituir revision competente.

## Consecuencias

- MVP Alpha no implementa UI de configuracion.
- MVP no implementa editor dinamico de frameworks.
- Futuros perfiles institucionales deberan versionarse y revisarse humanamente.
- `orchestrator-legal` no se integra tal cual; cualquier modulo sensible requiere contrato propio.
