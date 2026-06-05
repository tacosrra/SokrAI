interface LocalDemoSafetyNoticeProps {
  compact?: boolean;
  context?: 'intake' | 'resume' | 'workspace' | 'clinic-module' | 'report';
}

const contextText: Record<NonNullable<LocalDemoSafetyNoticeProps['context']>, string> = {
  intake: 'Usa solo informacion ficticia o anonimizada antes de crear la sesion.',
  resume: 'El session_id funciona como token de demo local; compartelo solo dentro del entorno controlado.',
  workspace: 'La sesion muestra estado auditable para revision local, no para uso asistencial real.',
  'clinic-module': 'Los modulos Clinic registran gaps, preguntas e incertidumbre para revision humana competente.',
  report: 'El informe y el PDF son artefactos locales de demo y no una decision formal.',
};

export function LocalDemoSafetyNotice({
  compact = false,
  context = 'workspace',
}: LocalDemoSafetyNoticeProps) {
  return (
    <div className={`safety-notice ${compact ? 'safety-notice--compact' : ''}`}>
      <strong>Demo local controlada</strong>
      <p>
        Datos ficticios o anonimizados exclusivamente. No introduzcas datos reales de pacientes ni trates la salida
        como decision legal, clinica, regulatoria, de privacidad o medical-device. {contextText[context]}
      </p>
    </div>
  );
}
