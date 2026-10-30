import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://amwal.id/edukasi/mengenal-8-asnaf',
});

function installDom() {
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: dom.window.document },
    Event: { configurable: true, value: dom.window.Event },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    KeyboardEvent: { configurable: true, value: dom.window.KeyboardEvent },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    navigator: { configurable: true, value: dom.window.navigator },
    Node: { configurable: true, value: dom.window.Node },
    window: { configurable: true, value: dom.window },
  });
}

const DOM_PROPERTY_NAMES = [
  'document',
  'Event',
  'HTMLElement',
  'KeyboardEvent',
  'MouseEvent',
  'navigator',
  'Node',
  'window',
] as const;

let restoreDom: (() => void) | null = null;

function installDomWithRestore() {
  const previous = new Map<(typeof DOM_PROPERTY_NAMES)[number], unknown>();
  for (const name of DOM_PROPERTY_NAMES) {
    previous.set(name, (globalThis as Record<string, unknown>)[name]);
  }

  installDom();
  restoreDom = () => {
    for (const name of DOM_PROPERTY_NAMES) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: previous.get(name),
      });
    }
  };
}

installDom();

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, waitFor } = await import(
  '@testing-library/react'
);
const { EducationDetailView } = await import(
  '../../src/components/education/education-detail'
);

/**
 * [Sprint 11.1] The quiz used to grade itself client-side and never called
 * the network. It now submits to `gamification.submitQuizAttempt` (server
 * grading) and, on a pass, `gamification.claimQuiz` (real XP) — see
 * `education-detail.tsx`. These tests inject fakes for both, the same
 * `customUploadFn`-style DI `ReceiptDropzone` already uses, so the component
 * renders for real without `fetch`-ing `/rpc`.
 */
/** Donatur yang login: XP tampil dan tersimpan. */
const member = { userId: 'u-1', role: 'WAKIF' as const };

function fakeSubmitQuizAttempt(grade: {
  correct: number;
  total: number;
  percentage: number;
  passed: boolean;
}) {
  return mock(() => Promise.resolve({ quizId: 'QUIZ-EDU-8-ASNAF', ...grade }));
}

function fakeClaimQuiz(points: number) {
  return mock(() =>
    Promise.resolve({
      status: 'CLAIMED' as const,
      awarded: points > 0,
      points,
      saldo: points,
    })
  );
}

afterEach(() => {
  cleanup();
  restoreDom?.();
  restoreDom = null;
});
beforeEach(installDomWithRestore);

describe('education detail and quiz [I-9, I-10b]', () => {
  test('paginates the article in three pages', () => {
    const view = render(createElement(EducationDetailView));

    expect(view.getByText('Halaman 1 dari 3')).toBeDefined();
    expect(
      view.getByText(/Orang yang tidak memiliki harta dan penghasilan/)
    ).toBeDefined();
    expect(
      view.queryByText(/Orang yang ditugaskan mengelola zakat/)
    ).toBeNull();

    fireEvent.click(view.getByRole('button', { name: /Halaman selanjutnya/ }));
    expect(view.getByText('Halaman 2 dari 3')).toBeDefined();
    expect(
      view.getByText(/Orang yang ditugaskan mengelola zakat/)
    ).toBeDefined();
    expect(
      view.getByText(/Orang yang terjerat utang dan tidak mampu membayarnya/)
    ).toBeDefined();

    fireEvent.click(view.getByRole('button', { name: /Halaman selanjutnya/ }));
    expect(view.getByText('Halaman 3 dari 3')).toBeDefined();
    expect(view.getByText(/Orang yang berjuang di jalan Allah/)).toBeDefined();
    expect(
      view.getByText(/dalam perjalanan yang dibolehkan syariat/)
    ).toBeDefined();

    fireEvent.click(view.getByRole('button', { name: /Halaman sebelumnya/ }));
    expect(view.getByText('Halaman 2 dari 3')).toBeDefined();
  });

  test('switches to the quiz tab via Mulai Kuis', () => {
    const view = render(createElement(EducationDetailView, { user: member }));

    fireEvent.click(view.getByRole('button', { name: 'Mulai Kuis' }));

    expect(view.getByText('UJI PEMAHAMAN SYARIAH ANDA')).toBeDefined();
    expect(view.getByText('WORKPLACE KUIS')).toBeDefined();
    expect(view.getByText('+100 XP Berkah')).toBeDefined();
  });

  test('validates incomplete answers and calculates a passing score', async () => {
    const submitQuizAttempt = fakeSubmitQuizAttempt({
      correct: 5,
      total: 5,
      percentage: 100,
      passed: true,
    });
    const claimQuiz = fakeClaimQuiz(100);

    const view = render(
      createElement(EducationDetailView, {
        claimQuiz,
        submitQuizAttempt,
        user: member,
      })
    );
    fireEvent.click(view.getByRole('button', { name: 'Mulai Kuis' }));

    fireEvent.click(view.getByRole('button', { name: 'Periksa Jawaban Kuis' }));
    expect(
      view.getByText('Pilih jawaban untuk semua soal terlebih dahulu.')
    ).toBeDefined();
    expect(submitQuizAttempt).not.toHaveBeenCalled();

    fireEvent.click(view.getByLabelText('8'));
    fireEvent.click(
      view.getByLabelText(/Fakir tidak memiliki harta dan penghasilan cukup/)
    );
    fireEvent.click(view.getByLabelText('Gharim'));
    fireEvent.click(view.getByLabelText('Ya'));
    fireEvent.click(view.getByLabelText('Amil'));
    fireEvent.click(view.getByRole('button', { name: 'Periksa Jawaban Kuis' }));

    await waitFor(() =>
      expect(view.getByText('Skor Anda: 5/5 (100%).')).toBeDefined()
    );
    expect(view.getByText('Reward: +100 XP Berkah')).toBeDefined();
    expect(submitQuizAttempt).toHaveBeenCalledTimes(1);
    expect(submitQuizAttempt).toHaveBeenCalledWith({
      quizId: 'QUIZ-EDU-8-ASNAF',
      answers: {
        'asnaf-count': '8',
        'fakir-miskin': 'definisi',
        gharim: 'gharim',
        muallaf: 'ya',
        amil: 'amil',
      },
    });
    await waitFor(() => expect(claimQuiz).toHaveBeenCalledTimes(1));
  });

  test('shows a non-passing score below 80 percent and never claims XP', async () => {
    const submitQuizAttempt = fakeSubmitQuizAttempt({
      correct: 2,
      total: 5,
      percentage: 40,
      passed: false,
    });
    const claimQuiz = fakeClaimQuiz(0);

    const view = render(
      createElement(EducationDetailView, {
        claimQuiz,
        submitQuizAttempt,
        user: member,
      })
    );
    fireEvent.click(view.getByRole('button', { name: 'Mulai Kuis' }));

    fireEvent.click(view.getByLabelText('7'));
    fireEvent.click(view.getByLabelText('Tidak'));
    fireEvent.click(view.getAllByLabelText('Riqab').at(0) as HTMLElement);
    fireEvent.click(
      view.getByLabelText(/Fakir tidak memiliki harta dan penghasilan cukup/)
    );
    fireEvent.click(view.getByLabelText('Amil'));
    fireEvent.click(view.getByRole('button', { name: 'Periksa Jawaban Kuis' }));

    await waitFor(() =>
      expect(view.getByText('Skor Anda: 2/5 (40%).')).toBeDefined()
    );
    expect(view.getByText(/Belum lulus/)).toBeDefined();
    expect(view.queryByText(/Reward: \+/)).toBeNull();
    expect(claimQuiz).not.toHaveBeenCalled();
  });
});

// Every test file builds its own JSDOM; closing it stops its timers and
// listeners so nothing can fire into a later file after the globals are gone.
afterAll(() => {
  dom.window.close();
});

describe('education quiz for guests [QA-08, D5]', () => {
  const answerAll = (view: ReturnType<typeof render>) => {
    fireEvent.click(view.getByLabelText('8'));
    fireEvent.click(
      view.getByLabelText(/Fakir tidak memiliki harta dan penghasilan cukup/)
    );
    fireEvent.click(view.getByLabelText('Gharim'));
    fireEvent.click(view.getByLabelText('Ya'));
    fireEvent.click(view.getByLabelText('Amil'));
    fireEvent.click(view.getByRole('button', { name: 'Periksa Jawaban Kuis' }));
  };

  test('hides every XP mention before and during the quiz', () => {
    const view = render(createElement(EducationDetailView));
    expect(view.queryByText(/XP/)).toBeNull();

    fireEvent.click(view.getByRole('button', { name: 'Mulai Kuis' }));
    expect(view.getByText('WORKPLACE KUIS')).toBeDefined();
    expect(view.queryByText(/XP/)).toBeNull();
  });

  test('grades without saving or claiming, then invites the guest to log in', async () => {
    const gradeQuiz = fakeSubmitQuizAttempt({
      correct: 5,
      total: 5,
      percentage: 100,
      passed: true,
    });
    const submitQuizAttempt = fakeSubmitQuizAttempt({
      correct: 0,
      total: 5,
      percentage: 0,
      passed: false,
    });
    const claimQuiz = fakeClaimQuiz(100);

    const view = render(
      createElement(EducationDetailView, {
        claimQuiz,
        gradeQuiz: gradeQuiz as never,
        submitQuizAttempt,
      })
    );
    fireEvent.click(view.getByRole('button', { name: 'Mulai Kuis' }));
    answerAll(view);

    await waitFor(() =>
      expect(view.getByText('Skor Anda: 5/5 (100%).')).toBeDefined()
    );
    expect(gradeQuiz).toHaveBeenCalledTimes(1);
    expect(submitQuizAttempt).not.toHaveBeenCalled();
    expect(claimQuiz).not.toHaveBeenCalled();
    expect(view.queryByText('Reward: +100 XP Berkah')).toBeNull();
    expect(view.getByText('Kuis Selesai!')).toBeDefined();
    expect(
      view.getByText(
        'Masuk sekarang untuk mengklaim +100 XP dan menyimpan pencapaian Anda!'
      )
    ).toBeDefined();
    expect(
      view.getByRole('link', { name: 'Masuk untuk Mengklaim' })
    ).toBeDefined();
  });

  test('a failing guest gets no login pitch for XP they could not claim', async () => {
    const gradeQuiz = fakeSubmitQuizAttempt({
      correct: 2,
      total: 5,
      percentage: 40,
      passed: false,
    });
    const view = render(
      createElement(EducationDetailView, { gradeQuiz: gradeQuiz as never })
    );
    fireEvent.click(view.getByRole('button', { name: 'Mulai Kuis' }));
    answerAll(view);

    await waitFor(() =>
      expect(view.getByText('Skor Anda: 2/5 (40%).')).toBeDefined()
    );
    expect(view.queryByTestId('quiz-login-banner')).toBeNull();
  });
});
