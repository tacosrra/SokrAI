import { describe, expect, it } from 'vitest';

import { parseProposalStartResponse, parseSessionAuditView } from './validation';

describe('parseProposalStartResponse', () => {
  it('accepts payloads aligned with the canonical contract', () => {
    const response = parseProposalStartResponse({
      session_id: 'session-1',
      stage: 'problem_definition',
      structured_brief: {
        project_title: 'Triage IA en Urgencias',
        goal: 'Definir mejor el problema',
        target_user: 'Enfermería de admisión',
        problem_owner: '',
        problem_statement: 'El triaje se retrasa en horas punta.',
        evidence_of_problem: 'Esperas de 20 a 35 minutos.',
        current_alternatives: 'Protocolo manual.',
        scope: 'Urgencias de adultos.',
        constraints_known: [],
        assumptions: [],
        ambiguities: ['No está claro el responsable operativo.'],
        missing_information: ['problem_owner'],
      },
      detected_gaps: ['problem_owner'],
      next_question: '¿Qué equipo responde hoy por este problema?',
      agent_status: 'continue',
      warnings: [],
    });

    expect(response.stage).toBe('problem_definition');
    expect(response.structured_brief.problem_statement).toContain('triaje');
  });

  it('rejects malformed payloads early', () => {
    expect(() =>
      parseProposalStartResponse({
        session_id: 'session-1',
        stage: 'problem_definition',
        structured_brief: {},
        detected_gaps: [],
        next_question: '¿Qué equipo responde hoy por este problema?',
        agent_status: 'continue',
        warnings: [],
      }),
    ).toThrow(/structured_brief/);
  });
});

describe('parseSessionAuditView', () => {
  it('accepts numeric fields serialized as strings by the API', () => {
    const audit = parseSessionAuditView({
      session: {
        id: 'session-1',
        project_title: 'Triage',
        goal: 'Goal',
        current_stage: 'problem_definition',
        current_agent: 'problem_definition_agent',
        status: 'waiting_for_user',
        current_turn_seq: 1,
        state_version: '1',
        latest_structured_brief_json: {
          project_title: 'Triage',
          goal: 'Goal',
          target_user: '',
          problem_owner: '',
          problem_statement: '',
          evidence_of_problem: '',
          current_alternatives: '',
          scope: '',
          constraints_known: [],
          assumptions: [],
          ambiguities: [],
          missing_information: [],
        },
        latest_problem_definition_json: {
          problem_owner: '',
          problem_statement: '',
          evidence_of_problem: '',
          scope: '',
          current_alternatives: '',
          assumptions: [],
          ambiguities_remaining: [],
        },
        latest_snapshot_id: 'snapshot-1',
        latest_successful_run_id: 'run-1',
        completion_reason: null,
      },
      turns: [],
      runs: [],
      snapshots: [
        {
          id: 'snapshot-1',
          session_id: 'session-1',
          snapshot_seq: '1',
          state_version: '1',
          source_turn_seq: null,
          source_run_id: 'run-1',
          structured_brief_json: {
            project_title: 'Triage',
            goal: 'Goal',
            target_user: '',
            problem_owner: '',
            problem_statement: '',
            evidence_of_problem: '',
            current_alternatives: '',
            scope: '',
            constraints_known: [],
            assumptions: [],
            ambiguities: [],
            missing_information: [],
          },
          current_problem_definition_json: {
            problem_owner: '',
            problem_statement: '',
            evidence_of_problem: '',
            scope: '',
            current_alternatives: '',
            assumptions: [],
            ambiguities_remaining: [],
          },
          detected_gaps_json: [],
          next_question_text: '¿Qué pasa?',
          agent_status: 'continue',
          completion_reason: null,
          warnings_json: [],
        },
      ],
      events: [
        {
          id: 'event-1',
          session_id: 'session-1',
          turn_seq: null,
          run_id: null,
          event_seq: '1',
          event_type: 'session_created',
          actor_type: 'workflow',
          request_id: 'req-1',
          payload_json: {},
        },
      ],
    });

    expect(audit.session.state_version).toBe(1);
    expect(audit.snapshots[0]?.snapshot_seq).toBe(1);
    expect(audit.events[0]?.event_seq).toBe(1);
  });
});
