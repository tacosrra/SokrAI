const TECHNICAL_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bstructured brief\b/gi, 'resumen inicial'],
  [/\bbasic alpha report\b/gi, 'informe'],
  [/\bmedical-device triage\b/gi, 'revisión sanitaria'],
  [/\bmedical device triage\b/gi, 'revisión sanitaria'],
  [/\bdata\s*\/\s*ia\s*\/\s*privacy\b/gi, 'datos y privacidad'],
  [/\bdata\s*\/\s*ai\s*\/\s*privacy\b/gi, 'datos y privacidad'],
  [/\bresources\s*\/\s*pilot\s*\/\s*viability\b/gi, 'piloto y recursos'],
  [/\bsession_id\b/gi, 'propuesta'],
  [/\brequest_id\b/gi, 'paso'],
  [/\bsource_id\b/gi, 'material'],
  [/\bJSON\b/g, 'contenido'],
  [/\bpayload\b/gi, 'contenido'],
  [/\bschema version\b/gi, 'versión interna'],
  [/\bschema\b/gi, 'formato'],
  [/\bworkflow\b/gi, 'proceso'],
  [/\bbackend\b/gi, 'servicio local'],
  [/\bn8n\b/gi, 'servicio local'],
  [/\bFastify\b/g, 'servicio local'],
  [/\bOllama\b/g, 'asistente local'],
  [/\bPostgreSQL\b/g, 'almacenamiento local'],
];

export function toUserFacingText(value: string): string {
  return TECHNICAL_TERM_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}
