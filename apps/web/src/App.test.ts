// @vitest-environment jsdom

import { createElement as h } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('shows global errors as a fixed toast and hides them automatically', async () => {
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
    expect(toast.textContent).toContain(errorMessage);

    act(() => {
      vi.advanceTimersByTime(7000);
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

    const infoToast = screen.getByText('Recuperando la propuesta guardada...');
    expect(infoToast.classList.contains('toast-notification')).toBe(true);
    expect(infoToast.classList.contains('toast-notification--info')).toBe(true);
    expect(infoToast.getAttribute('role')).toBe('status');

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    screen.getByText('Recuperando la propuesta guardada...');

    await act(async () => {
      resolveAudit(sessionAudit);
      await Promise.resolve();
    });

    const successToast = screen.getByText(
      'Propuesta cargada. Puedes continuar desde el punto en que se quedó.',
    );
    expect(successToast.classList.contains('toast-notification')).toBe(true);
    expect(successToast.classList.contains('toast-notification--success')).toBe(true);
    expect(successToast.getAttribute('role')).toBe('status');

    act(() => {
      vi.advanceTimersByTime(7000);
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
});
