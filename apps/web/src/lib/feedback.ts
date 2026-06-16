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
    eyebrow: 'Preparando la entrevista',
    title: 'Preparando tu primera pregunta',
    description:
      'SokrAI está leyendo la información que has aportado y preparando una primera pregunta útil para mejorar la propuesta.',
    steps: [
      'Organizar el contexto inicial de la propuesta.',
      'Detectar qué información necesita aclararse primero.',
      'Preparar una pregunta concreta para continuar.',
    ],
    note:
      'Este primer paso puede tardar algo más que una respuesta normal porque abre el trabajo guiado.',
  },
  reply: {
    eyebrow: 'Respuesta recibida',
    title: 'Preparando la siguiente pregunta',
    description:
      'SokrAI está guardando tu respuesta, actualizando la propuesta y preparando el siguiente paso.',
    steps: [
      'Guardar tu respuesta.',
      'Actualizar lo que ya está claro y lo que falta.',
      'Preparar la siguiente pregunta o el cierre de la fase.',
    ],
    note:
      'Puedes dejar esta pantalla abierta mientras se completa el paso.',
  },
};

export function getWorkflowLoadingCopy(kind: WorkflowOperationKind): WorkflowLoadingCopy {
  return WORKFLOW_LOADING_COPY[kind];
}

export function mapApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Ha ocurrido un error inesperado. Vuelve a intentarlo.';
  }

  switch (error.errorCode) {
    case 'invalid_response_contract':
    case 'unexpected_html_response':
      return 'No se ha podido leer la respuesta del servicio local. Reinicia los servicios y vuelve a intentarlo.';
    case 'session_not_found':
      return 'No hemos podido encontrar esta propuesta. Puede que el enlace sea antiguo o que el servicio local se haya reiniciado.';
    case 'invalid_request_recovery':
      return 'No se ha podido recuperar este paso de forma fiable. Vuelve a cargar la propuesta o intenta de nuevo.';
    case 'ollama_timeout':
    case 'ollama_unreachable':
    case 'ollama_request_failed':
    case 'ollama_invalid_response':
    case 'invalid_model_json':
    case 'invalid_model_json_after_repair':
      return 'El asistente local no ha podido completar este paso. Vuelve a intentarlo con una respuesta más concreta.';
    case 'request_timeout':
      return 'Este paso está tardando más de lo esperado. El proceso puede seguir en marcha; espera unos segundos y vuelve a cargar la propuesta.';
    case 'request_recovery_timeout':
      return 'No hemos podido confirmar el resultado final. Vuelve a cargar la propuesta antes de responder de nuevo.';
    case 'request_not_found_after_recovery':
      return 'No hemos encontrado este paso en el servicio local. Vuelve al inicio o crea una nueva propuesta.';
    case 'session_blocked':
      return 'La propuesta necesita revisión antes de continuar. Vuelve a cargarla o intenta responder de nuevo.';
    case 'reply_processing_failed':
      return 'Tu respuesta se ha guardado, pero no se ha podido preparar la siguiente pregunta.';
    case 'network_error':
      return 'El servicio local no está disponible. Comprueba que SokrAI está arrancado y vuelve a intentarlo.';
    case 'internal_error':
      return 'No se ha podido completar este paso por un error del servicio local. Vuelve a intentarlo.';
    case 'invalid_pdf_file':
    case 'unsupported_document_type':
      return 'Este documento no se puede usar aquí. Sube un PDF con texto seleccionable o pega el texto en el formulario.';
    case 'invalid_pdf_payload':
      return 'El PDF no se ha podido leer. Usa un PDF con texto seleccionable.';
    case 'empty_document':
      return 'El PDF no contiene texto seleccionable. Pega el contenido en el campo de apoyo.';
    case 'pdf_extraction_failed':
      return 'No se ha podido extraer texto del PDF. Si es un documento escaneado, pega el texto manualmente.';
    default:
      return 'No se ha podido completar este paso. Vuelve a intentarlo.';
  }
}
