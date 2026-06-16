import { describe, expect, it } from 'vitest';

import type {
  AlphaGap,
  ProblemDefinitionState,
  ProblemDefinitionTurn,
  ProposalSource,
  StructuredBrief,
} from '../../apps/api/src/contracts/types.ts';
import {
  buildProblemSectionSourceRefs,
  buildFallbackQuestion,
  classifyProblemGapStatuses,
  enforceTurnGuardrails,
  evaluateCompletion,
  isVagueAnswer,
  renderProblemSection,
  selectProblemGapRefs,
} from '../../apps/api/src/domain/problem-definition.ts';

const baseBrief: StructuredBrief = {
  project_title: 'Proyecto',
  goal: 'Objetivo',
  target_user: 'Urgencias',
  problem_owner: '',
  problem_statement: 'El triaje inicial se retrasa',
  evidence_of_problem: '',
  current_alternatives: '',
  scope: '',
  constraints_known: [],
  assumptions: [],
  ambiguities: ['No esta claro quien responde hoy por el problema'],
  missing_information: ['problem_owner', 'evidence_of_problem', 'scope', 'current_alternatives', 'assumptions'],
};

const baseGap: AlphaGap = {
  gap_id: 'gap-owner',
  proposal_id: 'proposal-1',
  module: 'problem',
  gap_kind: 'missing_information',
  gap_status: 'open',
  origin: 'structured_brief_field',
  field: 'problem_owner',
  description: 'The problem owner is missing from the structured brief.',
  absence: {
    is_absent: true,
    checked_fields: ['problem_owner'],
    reason: 'Required information was not found in the available structured brief.',
  },
  source_refs: [],
  audit_refs: [],
  warnings: [],
  created_at: '2026-05-24T14:00:00.000Z',
  updated_at: '2026-05-24T14:00:00.000Z',
};

const completeProblemDefinition: ProblemDefinitionState = {
  problem_owner: 'Equipo administrativo de admision',
  problem_statement: 'El cuello de botella es la clasificacion inicial de solicitudes administrativas ambiguas.',
  evidence_of_problem: 'Las solicitudes ambiguas generan reprocesos y esperas antes de decidir la ruta correcta.',
  scope: 'Primer contacto administrativo en admision de pacientes adultos.',
  current_alternatives: 'Hoy se revisa manualmente cada solicitud y se pregunta caso a caso.',
  assumptions: [],
  ambiguities_remaining: [],
};

describe('problem definition domain rules', () => {
  it('marks low-information answers as vague', () => {
    expect(isVagueAnswer('no lo se')).toBe(true);
    expect(isVagueAnswer('depende')).toBe(true);
    expect(
      isVagueAnswer('Lo vive enfermeria de admision cuando entran muchos pacientes adultos'),
    ).toBe(false);
  });

  it('requires all key fields before completion', () => {
    expect(
      evaluateCompletion({
        problem_owner: 'Enfermeria de admision',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos en la clasificacion inicial',
        current_alternatives: 'Protocolo manual y hojas de cribado',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      }),
    ).toBe(true);

    expect(evaluateCompletion(completeProblemDefinition)).toBe(true);

    expect(
      evaluateCompletion({
        problem_owner: '',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos en la clasificacion inicial',
        current_alternatives: 'Protocolo manual y hojas de cribado',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      }),
    ).toBe(false);
  });

  it('forces continue with a fallback question when the answer is vague', () => {
    const turn: ProblemDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['La respuesta no anade informacion accionable'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: 'El triaje inicial se retrasa',
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: ['No esta claro quien responde hoy por el problema'],
      },
      next_question: '',
      completion_reason: 'problem sufficiently defined',
    };

    const guarded = enforceTurnGuardrails(baseBrief, turn, 'no lo se');

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toBe(buildFallbackQuestion(guarded.updatedProblemDefinition));
    expect(guarded.warnings.length).toBeGreaterThan(0);
  });

  it('allows completion when the latest answer resolves copied stale problem ambiguities', () => {
    const staleBottleneck = 'No se especificó qué es exactamente el cuello de botella principal.';
    const staleMinimumData = 'No se determinaron los datos mínimos necesarios ni qué parte del flujo debería cambiar con la implementación del asistente.';
    const turn: ProblemDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['La respuesta concreta el cuello de botella, los datos necesarios y el cambio de flujo.'],
      updated_problem_definition: {
        ...completeProblemDefinition,
        problem_statement: 'El cuello de botella es la clasificacion inicial de solicitudes administrativas ambiguas.',
        current_alternatives: 'Hoy se decide manualmente si resolver, pedir mas datos o derivar a enfermeria.',
        ambiguities_remaining: [staleBottleneck, staleMinimumData],
      },
      next_question: '',
      completion_reason: 'problem sufficiently defined',
    };
    const latestAnswer = [
      'El cuello de botella es la clasificacion inicial de solicitudes administrativas ambiguas.',
      'No es solo volumen: hay que decidir si resolver administrativamente, pedir mas datos o escalar a enfermeria.',
      'Los datos minimos son motivo, canal, mencion de sintomas o empeoramiento, procedimiento administrativo solicitado, datos faltantes y criterio de escalado.',
      'El cambio de flujo es el primer triaje administrativo con una ficha estructurada para revision humana.',
    ].join(' ');

    const guarded = enforceTurnGuardrails(baseBrief, turn, latestAnswer);

    expect(guarded.turn.agent_status).toBe('done');
    expect(guarded.turn.next_question).toBe('');
    expect(guarded.warnings).not.toContain('Model marked the lane as done before completion criteria were met');
    expect(guarded.updatedProblemDefinition.ambiguities_remaining).not.toContain(staleBottleneck);
    expect(guarded.updatedProblemDefinition.ambiguities_remaining).not.toContain(staleMinimumData);
    expect(guarded.updatedBrief.ambiguities).toEqual([]);
  });

  it('does not repeat a stale ambiguity question after a concrete answer resolved it', () => {
    const staleBottleneck = 'No se especificó qué es exactamente el cuello de botella principal.';
    const staleMinimumData = 'No se determinaron los datos mínimos necesarios ni qué parte del flujo debería cambiar.';
    const turn: ProblemDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['La respuesta concreta el cuello de botella y el cambio de flujo.'],
      updated_problem_definition: {
        ...completeProblemDefinition,
        current_alternatives: 'Hoy se decide manualmente si resolver, pedir mas datos o derivar a enfermeria.',
        ambiguities_remaining: [staleBottleneck, staleMinimumData],
      },
      next_question: '¿Puedes concretar de nuevo el cuello de botella y los datos mínimos del flujo?',
      completion_reason: 'problem sufficiently defined',
    };
    const latestAnswer = [
      'El cuello de botella es la clasificacion inicial de solicitudes administrativas ambiguas.',
      'Se decide si resolver administrativamente, pedir mas datos o escalar a enfermeria.',
      'Los datos minimos son motivo, canal, sintomas, procedimiento administrativo solicitado y criterio de escalado.',
      'El cambio de flujo es un primer triaje administrativo con ficha estructurada y revision humana.',
    ].join(' ');

    const guarded = enforceTurnGuardrails(baseBrief, turn, latestAnswer);

    expect(guarded.turn.agent_status).toBe('done');
    expect(guarded.turn.next_question).toBe('');
    expect(guarded.updatedProblemDefinition.ambiguities_remaining).toEqual([]);
  });

  it('completes instead of repeating a pilot data question after a concrete local-data answer', () => {
    const previousDataQuestion =
      '¿Cuáles son los datos específicos que necesitaría el asistente para mejorar la eficiencia del proceso de admisión y cómo se manejarían estos datos durante el piloto?';
    const stalePilotData =
      'Definir qué datos específicos deben recogerse durante el piloto.';
    const turn: ProblemDefinitionTurn = {
      agent_status: 'continue',
      diagnosis: ['El modelo vuelve a preguntar por datos del piloto ya respondidos.'],
      updated_problem_definition: {
        ...completeProblemDefinition,
        problem_statement:
          'El proceso de admision se retrasa porque la informacion administrativa inicial llega incompleta y exige revision manual.',
        evidence_of_problem:
          'El piloto medira esperas superiores a 30 minutos, quejas simuladas, llamadas internas y correcciones humanas.',
        scope:
          'Piloto local de admision en urgencias con datos sinteticos y sin conexion a sistemas hospitalarios.',
        current_alternatives:
          'El equipo prepara manualmente resumenes, hace llamadas internas y escala casos cuando falta informacion.',
        ambiguities_remaining: [stalePilotData],
      },
      next_question:
        '¿Cuáles serían los datos específicos que necesitaría el asistente para mejorar la eficiencia del proceso de admisión y cómo se manejarían estos datos durante el piloto en un portátil local sin conexión con sistemas hospitalarios?',
      completion_reason: '',
    };
    const latestAnswer = [
      'Durante el piloto deberian recogerse solo los datos minimos necesarios para comprobar si el asistente mejora el proceso.',
      'Cada caso tendria un identificador sintetico, hora simulada de llegada, hora de recepcion de la informacion inicial, hora de inicio del resumen, hora de resumen listo y hora de revision humana.',
      'Tambien se registraria si la informacion inicial estaba completa, que dato faltaba, si fue necesaria una llamada interna, el motivo de la llamada, si coincidio con cambio de turno, si la espera supero 30 minutos, si hubo queja simulada por demora y si el caso tuvo que escalarse.',
      'Para evaluar calidad se guardaria si el resumen fue aceptado, corregido o rechazado y que tipo de correccion hizo admision.',
      'Todos los datos serian sinteticos, guardados localmente en el portatil del piloto, sin nombres, telefonos, documentos, historias clinicas, datos reales de pacientes ni conexion con sistemas hospitalarios.',
    ].join(' ');

    const guarded = enforceTurnGuardrails(baseBrief, turn, latestAnswer, {
      recentQuestions: [previousDataQuestion],
    });

    expect(guarded.updatedProblemDefinition.ambiguities_remaining).toEqual([]);
    expect(guarded.turn.agent_status).toBe('done');
    expect(guarded.turn.next_question).toBe('');
    expect(guarded.warnings).toContain(
      'Next question repeated an already answered topic; completing problem definition',
    );
  });

  it('blocks premature initial completion when intake still has important problem gaps', () => {
    const demoBrief: StructuredBrief = {
      ...baseBrief,
      problem_statement: 'Las solicitudes administrativas mezclan tramites y sintomas imprecisos.',
      evidence_of_problem: 'En una semana simulada hubo 240 solicitudes y derivaciones innecesarias a enfermeria.',
      scope: 'Centro de salud ficticio, adultos y mensajes administrativos internos.',
      current_alternatives: 'El personal administrativo lee cada mensaje y deriva a enfermeria cuando duda.',
      ambiguities: [
        'No esta claro cual es exactamente el cuello de botella principal',
        'No esta claro quien debe ser el owner del problema',
      ],
      missing_information: ['problem_owner', 'assumptions'],
    };
    const prematureDone: ProblemDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['El modelo intenta cerrar desde la propuesta inicial.'],
      updated_problem_definition: {
        problem_owner: 'Personal administrativo del centro de salud',
        problem_statement: demoBrief.problem_statement,
        evidence_of_problem: demoBrief.evidence_of_problem,
        scope: demoBrief.scope,
        current_alternatives: demoBrief.current_alternatives,
        assumptions: ['El cuello de botella principal puede estar en clasificacion o falta de datos.'],
        ambiguities_remaining: [],
      },
      next_question: '',
      completion_reason: 'problem sufficiently defined',
    };

    const guarded = enforceTurnGuardrails(demoBrief, prematureDone, undefined, { isInitialRun: true });

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toContain('?');
    expect(guarded.turn.completion_reason).toBe('');
    expect(guarded.warnings).toContain(
      'Model marked the lane as done while unresolved clarification signals remained',
    );
  });

  it('normalizes raw done to continue when a problem question or diagnosis still asks for clarification', () => {
    const turn: ProblemDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['No esta claro quien responde por medir la eficiencia del problema.'],
      updated_problem_definition: completeProblemDefinition,
      next_question: '¿Quien debe validar la metrica minima de eficiencia?',
      completion_reason: 'problem sufficiently defined',
    };

    const guarded = enforceTurnGuardrails(baseBrief, turn);

    expect(guarded.turn.agent_status).toBe('continue');
    expect(guarded.turn.next_question).toBe('¿Quien debe validar la metrica minima de eficiencia?');
    expect(guarded.turn.completion_reason).toBe('');
  });

  it('still blocks done turns when required fields are missing or the latest answer is vague', () => {
    const incompleteTurn: ProblemDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['El modelo intenta cerrar sin propietario.'],
      updated_problem_definition: {
        ...completeProblemDefinition,
        problem_owner: '',
      },
      next_question: '',
      completion_reason: 'problem sufficiently defined',
    };

    const incomplete = enforceTurnGuardrails(
      baseBrief,
      incompleteTurn,
      'Lo vive admision administrativa durante el primer contacto con pacientes.',
    );

    expect(incomplete.turn.agent_status).toBe('continue');
    expect(incomplete.turn.next_question).toBe(buildFallbackQuestion(incomplete.updatedProblemDefinition));
    expect(incomplete.warnings).toContain('Model marked the lane as done before completion criteria were met');

    const vagueTurn: ProblemDefinitionTurn = {
      agent_status: 'done',
      diagnosis: ['El modelo intenta cerrar con una respuesta vaga.'],
      updated_problem_definition: completeProblemDefinition,
      next_question: '',
      completion_reason: 'problem sufficiently defined',
    };

    const vague = enforceTurnGuardrails(baseBrief, vagueTurn, 'no lo se');

    expect(vague.turn.agent_status).toBe('continue');
    expect(vague.turn.next_question).toBe(buildFallbackQuestion(vague.updatedProblemDefinition));
    expect(vague.turn.completion_reason).toBe('');
    expect(vague.warnings).toContain('Latest answer was vague; clarification was narrowed');
  });

  it('selects unresolved problem gap refs by field priority', () => {
    const gaps: AlphaGap[] = [
      {
        ...baseGap,
        gap_id: 'gap-evidence',
        field: 'evidence_of_problem',
        description: 'Evidence is missing.',
      },
      baseGap,
      {
        ...baseGap,
        gap_id: 'gap-solution',
        module: 'solution',
        field: 'target_user',
      },
    ];

    expect(selectProblemGapRefs(gaps, {
      problem_owner: '',
      problem_statement: 'El triaje inicial se retrasa en horas punta',
      evidence_of_problem: '',
      scope: 'Urgencias de adultos',
      current_alternatives: 'Protocolo manual',
      assumptions: ['El cuello de botella esta en admision'],
      ambiguities_remaining: [],
    })).toEqual(['gap-owner', 'gap-evidence']);
  });

  it('classifies answered problem gaps as resolved when their fields are complete', () => {
    const changes = classifyProblemGapStatuses(
      [baseGap],
      {
        problem_owner: 'Direccion de Urgencias',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos',
        current_alternatives: 'Protocolo manual',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      },
      'turn-1',
    );

    expect(changes).toEqual([
      {
        gapId: 'gap-owner',
        gapStatus: 'resolved',
        resolvedByTurnId: 'turn-1',
      },
    ]);
  });

  it('keeps structured brief ambiguity gaps unresolved while the ambiguity remains', () => {
    const ambiguityGap: AlphaGap = {
      ...baseGap,
      gap_id: 'gap-ambiguity',
      gap_kind: 'ambiguous_information',
      origin: 'structured_brief_ambiguity',
      field: 'problem_owner',
      description: 'No esta claro quien responde hoy por el problema',
    };

    const changes = classifyProblemGapStatuses(
      [ambiguityGap],
      {
        problem_owner: 'Direccion de Urgencias',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos',
        current_alternatives: 'Protocolo manual',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: ['No esta claro quien responde hoy por el problema'],
      },
      'turn-1',
    );

    expect(changes).toEqual([
      {
        gapId: 'gap-ambiguity',
        gapStatus: 'in_progress',
      },
    ]);
  });

  it('resolves structured brief ambiguity gaps when the ambiguity is removed', () => {
    const ambiguityGap: AlphaGap = {
      ...baseGap,
      gap_id: 'gap-ambiguity',
      gap_kind: 'ambiguous_information',
      origin: 'structured_brief_ambiguity',
      field: 'problem_owner',
      description: 'No esta claro quien responde hoy por el problema',
      gap_status: 'in_progress',
    };

    const changes = classifyProblemGapStatuses(
      [ambiguityGap],
      {
        problem_owner: 'Direccion de Urgencias',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos',
        current_alternatives: 'Protocolo manual',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      },
      'turn-1',
    );

    expect(changes).toEqual([
      {
        gapId: 'gap-ambiguity',
        gapStatus: 'resolved',
        resolvedByTurnId: 'turn-1',
      },
    ]);
  });

  it('caps selected problem gap refs at three', () => {
    const gaps: AlphaGap[] = [
      baseGap,
      {
        ...baseGap,
        gap_id: 'gap-statement',
        field: 'problem_statement',
        description: 'Problem statement is missing.',
      },
      {
        ...baseGap,
        gap_id: 'gap-evidence',
        field: 'evidence_of_problem',
        description: 'Evidence is missing.',
      },
      {
        ...baseGap,
        gap_id: 'gap-scope',
        field: 'scope',
        description: 'Scope is missing.',
      },
    ];

    expect(selectProblemGapRefs(gaps, {
      problem_owner: '',
      problem_statement: '',
      evidence_of_problem: '',
      scope: '',
      current_alternatives: '',
      assumptions: [],
      ambiguities_remaining: [],
    })).toEqual(['gap-owner', 'gap-statement', 'gap-evidence']);
  });

  it('renders the problem section only from persisted problem fields and source refs', () => {
    const source: ProposalSource = {
      source_id: 'source-answer-1',
      source_kind: 'user_answer',
      label: 'Problem answer turn 1',
      turn_id: 'turn-1',
      created_at: '2026-05-24T14:10:00.000Z',
    };
    const sourceRefs = buildProblemSectionSourceRefs([], [source]);
    const section = renderProblemSection(
      {
        problem_owner: 'Direccion de Urgencias',
        problem_statement: 'El triaje inicial se retrasa en horas punta',
        evidence_of_problem: 'Se registran esperas medias de 27 minutos',
        scope: 'Urgencias de adultos',
        current_alternatives: 'Protocolo manual',
        assumptions: ['El cuello de botella esta en admision'],
        ambiguities_remaining: [],
      },
      {
        sourceCount: sourceRefs.length,
        gapCount: 1,
      },
    );

    expect(sourceRefs).toEqual([source]);
    expect(section.contentMarkdown).toContain('El triaje inicial se retrasa en horas punta');
    expect(section.contentMarkdown).not.toContain('solucion');
    expect(section.warnings).toEqual([]);
  });

  it('rephrases the next question when a vague answer would repeat the previous turn', () => {
    const previousQuestion =
      '¿Qué persona o equipo vive hoy este problema y responde por sus consecuencias?';
    const vagueTurn: ProblemDefinitionTurn = {
      agent_status: 'continue',
      diagnosis: ['La respuesta sigue siendo vaga'],
      updated_problem_definition: {
        problem_owner: '',
        problem_statement: 'El triaje inicial se retrasa',
        evidence_of_problem: '',
        scope: '',
        current_alternatives: '',
        assumptions: [],
        ambiguities_remaining: [],
      },
      next_question: previousQuestion,
      completion_reason: '',
    };

    const vague = enforceTurnGuardrails(baseBrief, vagueTurn, 'no lo se', {
      recentQuestions: [previousQuestion],
    });

    expect(vague.turn.next_question).not.toBe(previousQuestion);
    expect(vague.warnings).toContain('Latest answer was vague; clarification was narrowed');
  });
});
