import { ApiError } from './api';

export type WorkflowOperationKind = 'start' | 'reply';

interface WorkflowLoadingCopy {
  eyebrow: string;
  title: string;
  description: string;
  steps: string[];
  note: string;
}

const WORKFLOW_LOADING_COPY: Record<WorkflowOperationKind, WorkflowLoadingCopy> = {
  start: {
    eyebrow: 'Primer diagnóstico en curso',
    title: 'Preparando el primer diagnóstico',
    description:
      'La propuesta ya se ha enviado al flujo real. SokrAI está validando el payload, construyendo el structured brief y generando la primera pregunta socrática.',
    steps: [
      'Validar el envío y abrir la sesión persistida.',
      'Extraer el structured brief con el contrato JSON de v1.',
      'Generar el primer diagnóstico y la siguiente pregunta del lane.',
    ],
    note:
      'El primer turno puede tardar más que una respuesta normal porque encadena extracción inicial y la primera ejecución del agente.',
  },
  reply: {
    eyebrow: 'Turno en curso',
    title: 'Generando el siguiente diagnóstico',
    description:
      'La respuesta ya se envió al workflow real. SokrAI está actualizando la sesión, recalculando el estado y preparando la siguiente pregunta o el cierre.',
    steps: [
      'Persistir la respuesta del usuario en la sesión.',
      'Ejecutar el lane problem_definition_agent con el contexto actualizado.',
      'Devolver el siguiente estado, diagnóstico y pregunta.',
    ],
    note:
      'Este turno suele ser más corto que el arranque inicial, pero sigue dependiendo de n8n, Fastify y Ollama.',
  },
};

export function getWorkflowLoadingCopy(kind: WorkflowOperationKind): WorkflowLoadingCopy {
  return WORKFLOW_LOADING_COPY[kind];
}

export function mapApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Ha ocurrido un error inesperado en el frontend.';
  }

  switch (error.errorCode) {
    case 'invalid_response_contract':
      return 'La respuesta del backend no coincide con el contrato esperado. Lo más habitual aquí es que web, API y workflows estén en versiones distintas o que falte reiniciar/reconstruir servicios tras los cambios.';
    case 'unexpected_html_response':
      return 'El frontend recibió HTML donde esperaba JSON. Suele indicar que el proxy apunta al servicio incorrecto o que n8n devolvió una página intermedia o de login en vez del webhook/API.';
    case 'session_not_found':
      return 'No existe una sesión con ese `session_id`. Comprueba el valor o crea una nueva sesión.';
    case 'invalid_request_recovery':
      return 'La API devolvió un estado de recuperación inconsistente con la petición original. Revisa n8n, API y el contrato de inspección.';
    case 'ollama_timeout':
      return 'Ollama agotó el tiempo máximo configurado antes de devolver una respuesta. Revisa carga del modelo, memoria disponible o sube `OLLAMA_TIMEOUT_MS` si tu máquina es lenta.';
    case 'ollama_unreachable':
      return 'La API no puede alcanzar Ollama. Revisa el contenedor o servicio local y la URL configurada.';
    case 'ollama_request_failed':
      return 'Ollama devolvió un error al ejecutar el turno. Revisa los logs de n8n, API y Ollama.';
    case 'ollama_invalid_response':
      return 'Ollama respondió con un payload inválido. Revisa compatibilidad del modelo con el formato JSON exigido por la v1.';
    case 'invalid_model_json':
    case 'invalid_model_json_after_repair':
      return 'El modelo respondió, pero no pudo cumplir el contrato JSON del turno. Revisa prompts, modelo y guardrails.';
    case 'request_timeout':
      return 'El navegador agotó el tiempo de espera de la llamada. El workflow puede seguir ejecutándose; revisa n8n, API y Ollama.';
    case 'request_recovery_timeout':
      return 'La UI agotó la espera y tampoco pudo recuperar el resultado final del workflow. Revisa n8n, API y Ollama con el `request_id` de la petición.';
    case 'request_not_found_after_recovery':
      return 'La API no encontró ningún rastro persistido para ese `request_id`, incluso tras la recuperación activa. Suele indicar que la petición nunca llegó correctamente al backend o al workflow.';
    case 'session_blocked':
      return 'La sesión quedó bloqueada antes de devolver el turno esperado. Revisa la trazabilidad y los logs del backend.';
    case 'reply_processing_failed':
      return 'La respuesta del usuario se guardó, pero el workflow falló antes de completar el siguiente turno.';
    case 'network_error':
      return 'No se pudo contactar con los servicios locales. Revisa el proxy del frontend, n8n y la API.';
    case 'internal_error':
      return 'La API devolvió un error inesperado. Revisa los logs de Fastify, n8n y Ollama.';
    case 'invalid_pdf_file':
    case 'invalid_pdf_payload':
      return 'El PDF no es válido para la v1. Usa un PDF con texto extraíble.';
    default:
      return error.message;
  }
}
