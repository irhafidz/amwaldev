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
import type {
  ArticleData,
  CommentItem,
  EducationArticleDetailViewProps,
} from '../../src/components/education/education-article-detail-view';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://amwal.id/edukasi/wakaf-produktif-itb',
});

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '0px';
  readonly thresholds: readonly number[] = [0];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.callback(
      [
        {
          isIntersecting: true,
          target,
          intersectionRatio: 1,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this
    );
  }

  unobserve(): void {
    // no-op in mock
  }

  disconnect(): void {
    // no-op in mock
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function installDom() {
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: dom.window.document },
    Event: { configurable: true, value: dom.window.Event },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IntersectionObserver: {
      configurable: true,
      value: MockIntersectionObserver,
    },
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
  'IntersectionObserver',
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

const { act, cleanup, fireEvent, render, waitFor } = await import(
  '@testing-library/react'
);
const { QueryClient, QueryClientProvider } = await import(
  '@tanstack/react-query'
);
const { ToastProvider } = await import('../../src/components/ui/toast');
const { EducationArticleDetailView } = await import(
  '../../src/components/education/education-article-detail-view'
);

// The view's own queries (related articles, liked ids) used to hit the real
// `https://amwal.id/rpc/...` host; a 401 from there then started a session
// refresh that was still in flight when `orpc-client-refresh.test.ts` ran.
const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  restoreDom?.();
  restoreDom = null;
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  installDomWithRestore();
  globalThis.fetch = (() =>
    Promise.resolve(
      Response.json({ json: { data: [] } })
    )) as unknown as typeof fetch;
});
afterAll(() => {
  cleanup();
  for (const name of DOM_PROPERTY_NAMES) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('EducationArticleDetailView [Gamification & Comments]', () => {
  const mockArticle: ArticleData = {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Wakaf Produktif dan Keberkahannya',
    slug: 'wakaf-produktif-itb',
    categoryId: '22222222-2222-2222-2222-222222222222',
    categoryName: 'Wakaf',
    coverImageUrl: null,
    authorName: 'Ustadz Ahli Fiqih',
    content: '<p>Materi wakaf produktif yang sangat bermanfaat.</p>',
    likesCount: 15,
    createdAt: new Date().toISOString(),
    quizQuestionsCount: 1,
  };

  const mockQuestions = [
    {
      id: '33333333-3333-3333-3333-333333333333',
      question: 'Berapa rukun wakaf?',
      options: [
        { key: 'A', text: '4 Rukun' },
        { key: 'B', text: '2 Rukun' },
      ],
      orderIndex: 1,
    },
  ];

  const mockComments: CommentItem[] = [
    {
      id: 'comm-1',
      authorName: 'Ahmad Donatur',
      comment: 'MasyaAllah penjelasannya sangat gamblang.',
      createdAt: new Date().toISOString(),
    },
  ];

  function renderView(options: Partial<EducationArticleDetailViewProps> = {}) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          ToastProvider,
          null,
          createElement(EducationArticleDetailView, {
            slug: 'wakaf-produktif-itb',
            user: options.user ?? null,
            fetchArticle:
              options.fetchArticle ?? (() => Promise.resolve(mockArticle)),
            fetchQuiz:
              options.fetchQuiz ?? (() => Promise.resolve(mockQuestions)),
            fetchComments:
              options.fetchComments ?? (() => Promise.resolve(mockComments)),
            onQuizCheck: options.onQuizCheck,
            onClaimReadingXp: options.onClaimReadingXp,
            onCreateComment: options.onCreateComment,
            onNavigateLogin: options.onNavigateLogin,
            readingTimerMs: options.readingTimerMs,
          })
        )
      )
    );
  }

  test('renders article content and comments section', async () => {
    const view = renderView();

    await waitFor(() => {
      expect(view.getByText('Wakaf Produktif dan Keberkahannya')).toBeDefined();
    });

    expect(view.getByText('Diskusi & Komentar')).toBeDefined();
    await waitFor(() => {
      expect(
        view.getByText('MasyaAllah penjelasannya sangat gamblang.')
      ).toBeDefined();
    });
    expect(view.getAllByText('Tulis Komentar').length).toBeGreaterThan(0);
  });

  test('opens comment drawer modal for logged in user', async () => {
    const createCommentMock = mock(() =>
      Promise.resolve({
        data: {
          id: 'comm-2',
          articleId: mockArticle.id,
          userId: 'user-1',
          authorName: 'Test User',
          comment: 'Komentar saya baru',
          createdAt: new Date().toISOString(),
        },
      })
    );

    const view = renderView({
      user: {
        userId: 'user-1',
        role: 'WAKIF',
        email: 'user@amwal.id',
        name: 'Test User',
      },
      onCreateComment: createCommentMock,
    });

    await waitFor(() => {
      expect(view.getByText('Wakaf Produktif dan Keberkahannya')).toBeDefined();
    });

    // Click Tulis Komentar button
    const writeBtn = view.getAllByText('Tulis Komentar')[0];
    fireEvent.click(writeBtn);

    // Modal opens
    await waitFor(() => {
      expect(
        view.getByPlaceholderText(
          'Tulis komentar atau tanggapanmu di sini (minimal 3 karakter)...'
        )
      ).toBeDefined();
    });

    const textarea = view.getByPlaceholderText(
      'Tulis komentar atau tanggapanmu di sini (minimal 3 karakter)...'
    );
    fireEvent.change(textarea, { target: { value: 'Komentar yang bermakna' } });

    const submitBtn = view.getByRole('button', { name: 'Kirim Komentar' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createCommentMock).toHaveBeenCalled();
    });
  });

  test('prompts login if unauthenticated visitor clicks Tulis Komentar', async () => {
    const onNavigateLogin = mock(() => {
      // test callback
    });
    const view = renderView({
      user: null,
      onNavigateLogin,
    });

    await waitFor(() => {
      expect(view.getByText('Wakaf Produktif dan Keberkahannya')).toBeDefined();
    });

    const writeBtn = view.getAllByText('Tulis Komentar')[0];
    fireEvent.click(writeBtn);

    expect(onNavigateLogin).toHaveBeenCalled();
  });

  test('submits quiz and shows +100 XP reward toast', async () => {
    const quizCheckMock = mock(() =>
      Promise.resolve({
        data: {
          score: 100,
          correctCount: 1,
          totalQuestions: 1,
          results: [
            {
              questionId: mockQuestions[0].id,
              givenKey: 'A',
              correctKey: 'A',
              isCorrect: true,
              explanation: 'Ada 4 rukun wakaf yang disepakati ulama.',
            },
          ],
          xpAwarded: 100,
          isNewReward: true,
        },
      })
    );

    const view = renderView({
      user: {
        userId: 'user-1',
        role: 'WAKIF',
        email: 'user@amwal.id',
        name: 'Test User',
      },
      onQuizCheck: quizCheckMock,
    });

    await waitFor(() => {
      expect(view.getByText('Wakaf Produktif dan Keberkahannya')).toBeDefined();
    });

    // Switch to quiz tab
    fireEvent.click(view.getByRole('button', { name: /Kuis Interaktif/ }));

    await waitFor(() => {
      expect(view.getByText(/Berapa rukun wakaf/)).toBeDefined();
    });

    const checkBtn = view.getByRole('button', { name: 'Periksa Jawaban Kuis' });
    const optionA = view.getByTestId('option-A');
    fireEvent.click(optionA);

    // Submit quiz
    act(() => {
      fireEvent.click(checkBtn);
    });

    await waitFor(() => {
      expect(quizCheckMock).toHaveBeenCalled();
      expect(
        view.getByText(
          '🎉 Selamat! +100 XP Berkah berhasil ditambahkan ke akunmu!'
        )
      ).toBeDefined();
    });
  });

  test('guest: no XP anywhere, and a passing quiz ends with the login invitation', async () => {
    const quizCheckMock = mock(() =>
      Promise.resolve({
        data: {
          score: 100,
          correctCount: 1,
          totalQuestions: 1,
          results: [
            {
              questionId: mockQuestions[0].id,
              givenKey: 'A',
              correctKey: 'A',
              isCorrect: true,
              explanation: 'Ada 4 rukun wakaf yang disepakati ulama.',
            },
          ],
          xpAwarded: 0,
          isNewReward: false,
        },
      })
    );

    const view = renderView({ user: null, onQuizCheck: quizCheckMock });

    await waitFor(() => {
      expect(view.getByText('Wakaf Produktif dan Keberkahannya')).toBeDefined();
    });
    expect(view.queryByText(/\+100 XP/)).toBeNull();

    fireEvent.click(view.getByRole('button', { name: /Kuis Interaktif/ }));
    await waitFor(() => {
      expect(view.getByText(/Berapa rukun wakaf/)).toBeDefined();
    });
    expect(view.queryByText(/\+100 XP/)).toBeNull();

    fireEvent.click(view.getByTestId('option-A'));
    act(() => {
      fireEvent.click(
        view.getByRole('button', { name: 'Periksa Jawaban Kuis' })
      );
    });

    await waitFor(() => {
      expect(quizCheckMock).toHaveBeenCalled();
      expect(view.getByTestId('quiz-login-banner')).toBeDefined();
    });
    expect(
      view.getByText(
        'Masuk sekarang untuk mengklaim +100 XP dan menyimpan pencapaian Anda!'
      )
    ).toBeDefined();
    // Tidak ada klaim "XP berhasil ditambahkan" untuk tamu.
    expect(view.queryByText(/berhasil ditambahkan/)).toBeNull();
  });

  test('claims reading XP when reading dwell timer and scroll criteria are satisfied', async () => {
    const claimReadingXpMock = mock(() =>
      Promise.resolve({
        data: {
          success: true,
          xpAwarded: 50,
          isNewReward: true,
        },
      })
    );

    const view = renderView({
      user: {
        userId: 'user-1',
        role: 'WAKIF',
        email: 'user@amwal.id',
        name: 'Test User',
      },
      readingTimerMs: 10,
      onClaimReadingXp: claimReadingXpMock,
    });

    await waitFor(() => {
      expect(view.getByText('Wakaf Produktif dan Keberkahannya')).toBeDefined();
      expect(
        view.container.querySelector('#article-read-sentinel')
      ).toBeDefined();
    });

    await waitFor(() => {
      expect(claimReadingXpMock).toHaveBeenCalled();
      expect(
        view.getByText(
          'Kamu mendapatkan +50 XP Berkah karena tuntas membaca artikel'
        )
      ).toBeDefined();
      // Penanda di akhir artikel mengaitkan XP dengan membaca, bukan kuis.
      expect(view.getByTestId('reading-xp-status').textContent).toContain(
        '+50 XP Berkah membaca artikel ini sudah tercatat'
      );
    });
  });
});

// Every test file builds its own JSDOM; closing it stops its timers and
// listeners so nothing can fire into a later file after the globals are gone.
afterAll(() => {
  dom.window.close();
});
