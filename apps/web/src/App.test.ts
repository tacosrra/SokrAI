// @vitest-environment jsdom

import { createElement as h } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionAuditView, StructuredBrief } from './domain/contracts';
import { App } from './App';
import { ApiError, fetchBasicAlphaReport, fetchSessionAudit, startSession } from './lib/api';

vi.mock('./lib/api', async () => {
  const actual = await vi.importActual<typeof import('./lib/api')>('./lib/api');

  return {
    ...actual,
    fetchBasicAlphaReport: vi.fn(),
    fetchSessionAudit: vi.fn(),
    startSession: vi.fn(),
  };
});

const structuredBrief: StructuredBrief = {
  project_title: 'Triaje local',
  goal: 'Validar el problema operativo',
  target_user: 'Equipo de admision',
  problem_owner: 'Responsable de operaciones',
  problem_statement: 'Hay retrasos en admision durante las horas punta.',
  evidence_of_problem: 'Notas internas sin datos reales.',
  current_alternatives: 'Revision manual de las colas.',
  scope: 'Circuito local de admision.',
  constraints_known: [],
  assumptions: [],
  ambiguities: [],
  missing_information: [],
};

const sessionAudit: SessionAuditView = {
  session: {
    id: 'session-1',
    project_title: 'Triaje local',
    goal: 'Validar el problema operativo',
    current_stage: 'problem_definition',
    current_agent: 'problem_definition_agent',
    status: 'waiting_for_user',
    current_turn_seq: 1,
    state_version: 1,
    latest_structured_brief_json: structuredBrief,
    latest_problem_definition_json: null,
    latest_snapshot_id: 'snapshot-1',
    latest_successful_run_id: null,
    completion_reason: null,
  },
  documents: [],
  sources: [],
  gaps: [],
  module_chats: [],
  generated_sections: [],
  turns: [
    {
      id: 'turn-1',
      session_id: 'session-1',
      turn_seq: 1,
      question_text: 'Que equipo responde hoy por este problema?',
      answer_text: null,
      status: 'awaiting_user',
      agent_status: 'continue',
      diagnosis_json: [],
      updated_problem_definition_json: null,
      completion_reason: null,
    },
  ],
  runs: [],
  snapshots: [
    {
      id: 'snapshot-1',
      session_id: 'session-1',
      snapshot_seq: 1,
      state_version: 1,
      source_turn_seq: null,
      source_run_id: null,
      structured_brief_json: structuredBrief,
      current_problem_definition_json: null,
      detected_gaps_json: [],
      next_question_text: 'Que equipo responde hoy por este problema?',
      agent_status: 'continue',
      completion_reason: null,
      warnings_json: [],
    },
  ],
  events: [],
};

const problemCompletedAudit: SessionAuditView = {
  ...sessionAudit,
  session: {
    ...sessionAudit.session,
    status: 'completed',
    current_turn_seq: 1,
    state_version: 2,
    latest_problem_definition_json: {
      problem_owner: 'Responsable de operaciones',
      problem_statement: structuredBrief.problem_statement,
      evidence_of_problem: structuredBrief.evidence_of_problem,
      scope: structuredBrief.scope,
      current_alternatives: structuredBrief.current_alternatives,
      assumptions: [],
      ambiguities_remaining: [],
    },
    completion_reason: 'La fase de problema quedó lista para revisión.',
  },
  gaps: [],
  module_chats: [
    {
      chat_id: 'chat-problem',
      proposal_id: 'session-1',
      module: 'problem',
      chat_status: 'completed',
      turns: [],
      started_at: '2026-06-05T10:00:00.000Z',
      completed_at: '2026-06-05T10:10:00.000Z',
      warnings: [],
    },
  ],
  generated_sections: [
    {
      section_id: 'section-problem',
      proposal_id: 'session-1',
      section_kind: 'problem',
      section_status: 'generated',
      section_version: 1,
      title: 'Problem definition',
      content_markdown: 'El problema queda definido para revisión humana.',
      source_refs: [],
      gap_refs: [],
      warnings: [],
      created_at: '2026-06-05T10:10:00.000Z',
    },
  ],
  turns: [
    {
      ...sessionAudit.turns[0],
      answer_text: 'Responsable de operaciones.',
      status: 'resolved',
      completion_reason: 'La fase de problema quedó lista para revisión.',
    },
  ],
  snapshots: [
    {
      ...sessionAudit.snapshots[0],
      state_version: 2,
      current_problem_definition_json: {
        problem_owner: 'Responsable de operaciones',
        problem_statement: structuredBrief.problem_statement,
        evidence_of_problem: structuredBrief.evidence_of_problem,
        scope: structuredBrief.scope,
        current_alternatives: structuredBrief.current_alternatives,
        assumptions: [],
        ambiguities_remaining: [],
      },
      detected_gaps_json: [],
      next_question_text: null,
      agent_status: 'done',
      completion_reason: 'La fase de problema quedó lista para revisión.',
    },
  ],
};

describe('App proposal intake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.mocked(fetchBasicAlphaReport).mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('animates global errors out before hiding them automatically', async () => {
    vi.useFakeTimers();
    vi.mocked(startSession).mockRejectedValue(
      new ApiError('SokrAI is offline', 503, 'network_error', true),
    );

    render(h(App));

    const errorMessage =
      'El servicio local no está disponible. Comprueba que SokrAI está arrancado y vuelve a intentarlo.';

    fireEvent.change(screen.getByLabelText('Nombre de la propuesta'), {
      target: { value: 'Triaje local' },
    });
    fireEvent.change(screen.getByLabelText('Qué quieres aclarar'), {
      target: { value: 'Validar el problema operativo' },
    });
    fireEvent.change(screen.getByLabelText(/Describe la idea inicial/), {
      target: { value: 'Hay retrasos en admisión durante las horas punta.' },
    });
    fireEvent.change(screen.getByLabelText('Texto de apoyo'), {
      target: { value: 'Notas internas sin datos reales.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Empezar nueva propuesta$/ }));

    await act(async () => {
      await Promise.resolve();
    });

    screen.getByText(errorMessage);

    const toast = screen.getByRole('alert');

    expect(toast.classList.contains('toast-notification')).toBe(true);
    expect(toast.classList.contains('toast-notification--error')).toBe(true);
    expect(toast.classList.contains('toast-notification--leaving')).toBe(false);
    expect(toast.textContent).toContain(errorMessage);

    act(() => {
      vi.advanceTimersByTime(6500);
    });

    expect(toast.classList.contains('toast-notification--leaving')).toBe(true);
    expect(screen.getByRole('alert')).toBe(toast);

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets users dismiss toasts early with the exit animation', async () => {
    vi.useFakeTimers();
    vi.mocked(startSession).mockRejectedValue(
      new ApiError('SokrAI is offline', 503, 'network_error', true),
    );

    render(h(App));

    fireEvent.change(screen.getByLabelText('Nombre de la propuesta'), {
      target: { value: 'Triaje local' },
    });
    fireEvent.change(screen.getByLabelText('Qué quieres aclarar'), {
      target: { value: 'Validar el problema operativo' },
    });
    fireEvent.change(screen.getByLabelText(/Describe la idea inicial/), {
      target: { value: 'Hay retrasos en admisión durante las horas punta.' },
    });
    fireEvent.change(screen.getByLabelText('Texto de apoyo'), {
      target: { value: 'Notas internas sin datos reales.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Empezar nueva propuesta$/ }));

    await act(async () => {
      await Promise.resolve();
    });

    const toast = screen.getByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));

    expect(toast.classList.contains('toast-notification--leaving')).toBe(true);
    expect(screen.getByRole('alert')).toBe(toast);

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows loading and success banners as fixed toasts', async () => {
    vi.useFakeTimers();
    let resolveAudit: (audit: SessionAuditView) => void = () => undefined;
    vi.mocked(fetchSessionAudit).mockReturnValue(
      new Promise<SessionAuditView>((resolve) => {
        resolveAudit = resolve;
      }),
    );

    render(h(App));

    fireEvent.click(
      screen.getByRole('button', {
        name: /^Continuar una propuesta/,
      }),
    );
    fireEvent.change(screen.getByLabelText(/Enlace o código de propuesta/), {
      target: { value: 'session-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continuar propuesta$/ }));

    const infoToast = screen.getByRole('status');
    expect(infoToast.classList.contains('toast-notification')).toBe(true);
    expect(infoToast.classList.contains('toast-notification--info')).toBe(true);
    expect(infoToast.getAttribute('role')).toBe('status');
    expect(infoToast.textContent).toContain('Recuperando la propuesta guardada...');

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    screen.getByText('Recuperando la propuesta guardada...');

    await act(async () => {
      resolveAudit(sessionAudit);
      await Promise.resolve();
    });

    const successToast = screen.getByRole('status');
    expect(successToast.classList.contains('toast-notification')).toBe(true);
    expect(successToast.classList.contains('toast-notification--success')).toBe(true);
    expect(successToast.getAttribute('role')).toBe('status');
    expect(successToast.textContent).toContain(
      'Propuesta cargada. Puedes continuar desde el punto en que se quedó.',
    );

    act(() => {
      vi.advanceTimersByTime(6500);
    });

    expect(successToast.classList.contains('toast-notification--leaving')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(
      screen.queryByText('Propuesta cargada. Puedes continuar desde el punto en que se quedó.'),
    ).toBeNull();
  });

  it('keeps new proposal form values when starting a proposal fails', async () => {
    vi.mocked(startSession).mockRejectedValue(
      new ApiError('SokrAI is offline', 503, 'network_error', true),
    );

    render(h(App));

    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Nombre de la propuesta'), 'Triaje local');
    await user.type(screen.getByLabelText('Qué quieres aclarar'), 'Validar el problema operativo');
    await user.type(
      screen.getByLabelText(/Describe la idea inicial/),
      'Hay retrasos en admisión durante las horas punta.',
    );
    await user.type(screen.getByLabelText('Texto de apoyo'), 'Notas internas sin datos reales.');

    await user.click(screen.getByRole('button', { name: /^Empezar nueva propuesta$/ }));

    await screen.findByText(
      'El servicio local no está disponible. Comprueba que SokrAI está arrancado y vuelve a intentarlo.',
    );

    expect((screen.getByLabelText('Nombre de la propuesta') as HTMLInputElement).value).toBe(
      'Triaje local',
    );
    expect((screen.getByLabelText('Qué quieres aclarar') as HTMLTextAreaElement).value).toBe(
      'Validar el problema operativo',
    );
    expect((screen.getByLabelText(/Describe la idea inicial/) as HTMLTextAreaElement).value).toBe(
      'Hay retrasos en admisión durante las horas punta.',
    );
    expect((screen.getByLabelText('Texto de apoyo') as HTMLTextAreaElement).value).toBe(
      'Notas internas sin datos reales.',
    );
  });

  it('lets users return from a historical phase to the current phase even when the current phase has no chat history', async () => {
    vi.mocked(fetchSessionAudit).mockResolvedValue(problemCompletedAudit);
    window.history.replaceState({}, '', '/?session=session-1');

    render(h(App));

    await screen.findByText('Fase actual: Solución');

    const user = userEvent.setup();
    const rail = screen.getByRole('navigation', { name: 'Fases de la propuesta' });

    await user.click(within(rail).getByRole('button', { name: /Problema/ }));
    screen.getByText('Revisando: Problema');

    await user.click(within(rail).getByRole('button', { name: /Solución/ }));

    screen.getByText('Fase actual: Solución');
    expect(screen.queryByText('Revisando: Problema')).toBeNull();
  });

  it('stores problem-completed sessions as active recent proposals when later phases remain', async () => {
    vi.mocked(fetchSessionAudit).mockResolvedValue(problemCompletedAudit);
    window.history.replaceState({}, '', '/?session=session-1');

    render(h(App));

    await screen.findByText('Fase actual: Solución');

    const recentSessions = JSON.parse(
      window.localStorage.getItem('sokrai:v1:recent-sessions') ?? '[]',
    ) as Array<{ status: string; currentQuestion: string; phaseLabel?: string }>;

    expect(recentSessions[0]).toMatchObject({
      sessionId: 'session-1',
      status: 'active',
      phaseLabel: 'Solución',
    });
    expect(recentSessions[0]?.currentQuestion).toContain('Solución');
  });

  it('removes stale browser recent sessions when the local database no longer has them', async () => {
    window.localStorage.setItem('sokrai:v1:last-session-id', 'missing-session');
    window.localStorage.setItem(
      'sokrai:v1:recent-sessions',
      JSON.stringify([
        {
          sessionId: 'missing-session',
          projectTitle: 'Propuesta desaparecida',
          goal: 'Validar limpieza de sesiones locales',
          status: 'waiting_for_user',
          updatedAt: '2026-06-05T10:00:00.000Z',
          currentQuestion: 'Pregunta antigua',
        },
      ]),
    );
    vi.mocked(fetchSessionAudit).mockRejectedValue(
      new ApiError(
        'The requested session does not exist',
        404,
        'session_not_found',
        false,
        'request-1',
        'missing-session',
      ),
    );

    render(h(App));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Propuesta desaparecida/ }));

    await screen.findByText(
      'Este navegador recordaba la propuesta, pero esta base local ya no la contiene.',
    );

    expect(JSON.parse(window.localStorage.getItem('sokrai:v1:recent-sessions') ?? '[]')).toEqual([]);
    expect(window.localStorage.getItem('sokrai:v1:last-session-id')).toBe('');
  });
});
