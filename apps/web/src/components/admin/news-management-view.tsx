import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Edit3,
  Eye,
  FileText,
  FolderPlus,
  Heart,
  Link2,
  MapPin,
  MessageSquare,
  Newspaper,
  Pin,
  Plus,
  Search,
  Send,
  Share2,
  Tag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  AdminPageHeader,
  AdminTabs,
  HERO_BADGE,
  HERO_BUTTON_PRIMARY,
} from '@/components/admin/admin-primitives';
import { confirmAction } from '@/components/ui/confirm-action';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import { orpc } from '@/lib/orpc/client';

// --- DATA TYPES ---
/** Tagar di awal input tag dibuang sebelum disimpan. */
const LEADING_HASH = /^#/;

export interface NewsItem {
  id: string;
  title: string;
  category: string;
  type: 'kegiatan' | 'siaran_pers' | 'pengumuman' | 'liputan_khusus';
  coverImage: string;
  summary: string;
  content: string;
  author: string;
  location?: string;
  eventDate?: string;
  publishDate: string;
  status: 'published' | 'draft' | 'archived';
  isPinned?: boolean;
  likesCount: number;
  viewsCount: number;
  tags: string[];
  comments: NewsComment[];
}

export interface NewsComment {
  id: string;
  authorName: string;
  authorRole: string;
  avatarText: string;
  comment: string;
  timestamp: string;
  likes: number;
}

/** Kelas lencana peringkat 1/2/lainnya — dipisah dari ternari bertingkat. */
function rankBadgeClass(rank: number): string {
  if (rank === 0) {
    return 'bg-amber-100 text-amber-800';
  }
  if (rank === 1) {
    return 'bg-slate-200 text-slate-800';
  }
  return 'bg-slate-100 text-slate-600';
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen
export function NewsManagementView() {
  const { showToast } = useToast();

  // Primary Sub View: 'list' | 'create' | 'categories' | 'analytics'
  const [subView, setSubView] = useState<
    'list' | 'create' | 'categories' | 'analytics'
  >('list');

  // News List State
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const fetchBackendNews = async () => {
    try {
      const res = await orpc.admin.cms.list({ limit: 100 });
      const mapped: NewsItem[] = res.items.map((item) => ({
        id: item.id,
        title: item.judul,
        category: item.kategori || 'Kegiatan Lapangan',
        type: 'kegiatan',
        coverImage:
          item.coverUrl ||
          'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&auto=format&fit=crop&q=80',
        summary: item.body
          ? item.body.replace(/[#*`_>]/g, '').slice(0, 150)
          : '',
        content: item.body || '',
        author: 'Admin Amwal',
        location: 'Jakarta & Lapangan Binaan',
        eventDate: new Date(item.createdAt).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        publishDate: item.publishedAt
          ? new Date(item.publishedAt).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : new Date(item.createdAt).toLocaleDateString('id-ID'),
        status: item.status.toLowerCase() as 'published' | 'draft' | 'archived',
        isPinned: false,
        likesCount: 0,
        viewsCount: 0,
        tags: ['Berita', 'Amwal'],
        comments: [],
      }));
      setNewsList(mapped);
      setLoadState('ready');
    } catch (_err) {
      setLoadState('error');
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: pemuatan sekali saat mount; `fetchBackendNews` dibuat ulang tiap render sehingga memasukkannya ke daftar dependensi akan memicu pemanggilan berulang tanpa henti
  useEffect(() => {
    fetchBackendNews();
  }, []);

  // Categories State
  const [categories, setCategories] = useState<string[]>([
    'Kegiatan Lapangan',
    'Penyaluran Bantuan',
    'Siaran Pers & BWI',
    'Pengumuman Resmi',
    'Kemitraan Strategis',
    'Seremoni & Akad',
  ]);

  // Reader Modal Preview
  const [previewNews, setPreviewNews] = useState<NewsItem | null>(null);

  // New Comment in Preview
  const [commentInput, setCommentInput] = useState('');

  // Editing ID
  const [editingId, setEditingId] = useState<string | null>(null);

  const [tagInput, setTagInput] = useState('');

  const [form, setForm] = useState<{
    title: string;
    category: string;
    type: 'kegiatan' | 'siaran_pers' | 'pengumuman' | 'liputan_khusus';
    coverImage: string;
    summary: string;
    content: string;
    author: string;
    location: string;
    eventDate: string;
    status: 'published' | 'draft';
    isPinned: boolean;
    tags: string[];
  }>({
    title: '',
    category: 'Kegiatan Lapangan',
    type: 'kegiatan',
    coverImage:
      'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&auto=format&fit=crop&q=80',
    summary: '',
    content: '',
    author: 'Super Admin Amwal',
    location: 'Jakarta & Lapangan Binaan',
    eventDate: new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    status: 'published',
    isPinned: false,
    tags: ['KegiatanAmwal', 'TransparansiWakaf'],
  });

  // Modal Category Management
  const [newCatInput, setNewCatInput] = useState('');
  const [editingCatIndex, setEditingCatIndex] = useState<number | null>(null);
  const [editingCatText, setEditingCatText] = useState('');

  // Preset Images
  const PRESET_IMAGES = [
    {
      label: 'Groundbreaking RS',
      url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&auto=format&fit=crop&q=80',
    },
    {
      label: 'Penyaluran Air Bersih',
      url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=800&auto=format&fit=crop&q=80',
    },
    {
      label: 'Akad & Seremoni',
      url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=80',
    },
    {
      label: 'Pertanian Produktif',
      url: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&auto=format&fit=crop&q=80',
    },
    {
      label: 'Pendidikan & Pelatihan',
      url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80',
    },
    {
      label: 'Bantuan Sosial & Sembako',
      url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&auto=format&fit=crop&q=80',
    },
  ];

  // Handlers
  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({
      title: '',
      category: categories[0] || 'Kegiatan Lapangan',
      type: 'kegiatan',
      coverImage: PRESET_IMAGES[0].url,
      summary: '',
      content: '',
      author: 'Super Admin Amwal',
      location: 'DKI Jakarta & Lapangan Binaan',
      eventDate: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      status: 'published',
      isPinned: false,
      tags: ['KegiatanAmwal', 'WakafProduktif'],
    });
    setSubView('create');
  };

  const handleEdit = (news: NewsItem) => {
    setEditingId(news.id);
    setForm({
      title: news.title,
      category: news.category,
      type: news.type,
      coverImage: news.coverImage,
      summary: news.summary,
      content: news.content,
      author: news.author,
      location: news.location || '',
      eventDate: news.eventDate || '',
      status: news.status === 'archived' ? 'draft' : news.status,
      isPinned: !!news.isPinned,
      tags: news.tags || [],
    });
    setSubView('create');
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction({
      title: 'Hapus Berita?',
      description: 'Berita/informasi ini akan dihapus permanen dari sistem.',
    });
    if (confirmed) {
      try {
        if (!id.startsWith('news-')) {
          await orpc.admin.cms.delete({ id });
        }
        setNewsList((prev) => prev.filter((n) => n.id !== id));
        showToast({
          title: 'Berita Dihapus',
          description: 'Artikel berita kegiatan berhasil dihapus dari sistem.',
          type: 'info',
        });
        if (previewNews?.id === id) {
          setPreviewNews(null);
        }
      } catch (err: unknown) {
        showToast({
          title: 'Gagal Menghapus',
          description:
            (err instanceof Error && err.message) ||
            'Terjadi kesalahan saat menghapus.',
          type: 'error',
        });
      }
    }
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNewsList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isPinned: !item.isPinned } : item
      )
    );
    showToast({
      title: 'Status Pin Diperbarui',
      description: 'Status sorotan/headline berita berhasil diubah.',
      type: 'success',
    });
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) {
      return;
    }
    const cleanTag = tagInput.trim().replace(LEADING_HASH, '');
    if (!form.tags.includes(cleanTag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, cleanTag] }));
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
    }));
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen
  const handleSaveNews = async (saveStatus: 'published' | 'draft') => {
    if (!form.title.trim()) {
      showToast({
        title: 'Judul Berita Kosong',
        description: 'Harap isi judul berita atau nama kegiatan.',
        type: 'error',
      });
      return;
    }
    if (!(form.content.trim() || form.summary.trim())) {
      showToast({
        title: 'Konten Belum Lengkap',
        description: 'Tuliskan ringkasan dan isi lengkap berita kegiatan.',
        type: 'error',
      });
      return;
    }

    const slug =
      form.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `berita-${Date.now()}`;

    const status = saveStatus === 'published' ? 'PUBLISHED' : 'DRAFT';

    try {
      if (editingId && !editingId.startsWith('news-')) {
        await orpc.admin.cms.update({
          id: editingId,
          judul: form.title.trim(),
          slug,
          tipe: 'ARTIKEL',
          kategori: form.category,
          body: form.content.trim() || form.summary.trim(),
          coverUrl: form.coverImage,
          status,
        });
      } else {
        await orpc.admin.cms.create({
          judul: form.title.trim(),
          slug,
          tipe: 'ARTIKEL',
          kategori: form.category,
          body: form.content.trim() || form.summary.trim(),
          coverUrl: form.coverImage,
          status,
        });
      }

      await fetchBackendNews();
      setSubView('list');
      showToast({
        title:
          saveStatus === 'published' ? 'Berita Diterbitkan!' : 'Draft Disimpan',
        description: `Informasi kegiatan berhasil ${saveStatus === 'published' ? 'terbit ke portal publik' : 'disimpan sebagai konsep'}.`,
        type: 'success',
      });
    } catch (err: unknown) {
      showToast({
        title: 'Gagal Menyimpan',
        description:
          (err instanceof Error && err.message) ||
          'Terjadi kesalahan saat menyimpan ke database.',
        type: 'error',
      });
    }
  };

  const handleAddComment = (newsId: string) => {
    if (!commentInput.trim()) {
      return;
    }
    const newComm: NewsComment = {
      id: `comm-${Date.now()}`,
      authorName: 'Super Admin (Tanggapan Resmi)',
      authorRole: 'Admin Platform',
      avatarText: 'SA',
      comment: commentInput.trim(),
      timestamp: 'Baru saja',
      likes: 0,
    };

    setNewsList((prev) =>
      prev.map((item) => {
        if (item.id === newsId) {
          return {
            ...item,
            comments: [...item.comments, newComm],
          };
        }
        return item;
      })
    );

    if (previewNews && previewNews.id === newsId) {
      setPreviewNews({
        ...previewNews,
        comments: [...previewNews.comments, newComm],
      });
    }

    setCommentInput('');
    showToast({
      title: 'Tanggapan Terkirim',
      description: 'Komentar resmi admin berhasil disematkan pada berita.',
      type: 'success',
    });
  };

  const handleLikeNews = (id: string) => {
    setNewsList((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, likesCount: n.likesCount + 1 } : n
      )
    );
    if (previewNews && previewNews.id === id) {
      setPreviewNews({
        ...previewNews,
        likesCount: previewNews.likesCount + 1,
      });
    }
  };

  // Category Management Handlers
  const handleAddCategory = () => {
    if (!newCatInput.trim()) {
      return;
    }
    const cat = newCatInput.trim();
    if (!categories.includes(cat)) {
      setCategories((prev) => [...prev, cat]);
      showToast({
        title: 'Kategori Berita Ditambahkan',
        description: `Kategori "${cat}" siap digunakan.`,
        type: 'success',
      });
    }
    setNewCatInput('');
  };

  const handleSaveEditCategory = (index: number) => {
    if (!editingCatText.trim()) {
      return;
    }
    const updated = [...categories];
    const oldCat = updated[index];
    const newCat = editingCatText.trim();
    updated[index] = newCat;
    setCategories(updated);

    // Update news using this category
    setNewsList((prev) =>
      prev.map((item) =>
        item.category === oldCat ? { ...item, category: newCat } : item
      )
    );

    setEditingCatIndex(null);
    setEditingCatText('');
    showToast({
      title: 'Kategori Diperbarui',
      description: `Kategori diubah menjadi "${newCat}".`,
      type: 'success',
    });
  };

  const handleDeleteCategory = async (catName: string) => {
    if (categories.length <= 1) {
      showToast({
        title: 'Gagal Menghapus',
        description: 'Minimal harus ada 1 kategori aktif.',
        type: 'error',
      });
      return;
    }
    const confirmed = await confirmAction({
      title: 'Hapus Kategori?',
      description: `Kategori "${catName}" akan dihapus.`,
    });
    if (!confirmed) {
      return;
    }
    setCategories((prev) => prev.filter((c) => c !== catName));
    showToast({
      title: 'Kategori Dihapus',
      description: `Kategori "${catName}" telah dihapus.`,
      type: 'info',
    });
  };

  // Filtered News
  const filteredNews = newsList.filter((item) => {
    const matchSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) =>
        t.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchCategory =
      selectedCategory === 'all' || item.category === selectedCategory;
    const matchType = selectedType === 'all' || item.type === selectedType;
    const matchStatus =
      selectedStatus === 'all' || item.status === selectedStatus;

    return matchSearch && matchCategory && matchType && matchStatus;
  });

  // Calculate High-level Stats
  const totalNews = newsList.length;
  const publishedCount = newsList.filter(
    (n) => n.status === 'published'
  ).length;
  const draftCount = newsList.filter((n) => n.status === 'draft').length;
  const totalViews = newsList.reduce((acc, curr) => acc + curr.viewsCount, 0);
  const totalLikes = newsList.reduce((acc, curr) => acc + curr.likesCount, 0);

  return (
    <div className="fade-in animate-in space-y-6 duration-200">
      {/* 1. TOP HEADER & ACTION BAR */}
      <AdminPageHeader
        actions={
          <button
            className={HERO_BUTTON_PRIMARY}
            onClick={handleOpenCreate}
            type="button"
          >
            <Plus className="h-4 w-4" />
            <span>Buat Berita Baru</span>
          </button>
        }
        badge={<span className={HERO_BADGE}>Super Admin</span>}
        description="Publikasikan dokumentasi kegiatan lapangan, siaran pers BWI, dan pengumuman resmi transparansi amwal."
        icon={<Newspaper aria-hidden="true" />}
        title="Manajemen Berita &amp; Kegiatan"
      />

      <AdminTabs
        label="Bagian manajemen berita"
        onChange={setSubView}
        tabs={[
          {
            id: 'list',
            label: 'Daftar Berita',
            icon: <FileText className="h-4 w-4" />,
            count: totalNews,
          },
          {
            id: 'categories',
            label: 'Kategori',
            icon: <FolderPlus className="h-4 w-4" />,
            count: categories.length,
          },
          {
            id: 'analytics',
            label: 'Statistik',
            icon: <BarChart3 className="h-4 w-4" />,
          },
        ]}
        value={subView}
      />

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs sm:p-6">
        {/* STATS METRIC RIBBON */}
        <div>
          <div className="font-bold text-slate-700 text-xs">
            Ringkasan Berita:
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="font-bold text-xs text-slate-500 uppercase tracking-wider">
              Total Publikasi
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 font-black text-slate-900 text-xl">
              <span>{publishedCount}</span>
              <span className="font-medium text-slate-400 text-xs">
                / {totalNews} rilis
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
            <div className="font-bold text-xs text-emerald-800 uppercase tracking-wider">
              Total Pembaca
            </div>
            <div className="mt-1 font-black text-emerald-950 text-xl">
              {totalViews.toLocaleString('id-ID')}{' '}
              <span className="font-medium text-emerald-700 text-xs">
                Views
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
            <div className="font-bold text-xs text-amber-800 uppercase tracking-wider">
              Apresiasi & Suka
            </div>
            <div className="mt-1 font-black text-amber-950 text-xl">
              {totalLikes.toLocaleString('id-ID')}{' '}
              <span className="font-medium text-amber-700 text-xs">Likes</span>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
            <div className="font-bold text-xs text-blue-800 uppercase tracking-wider">
              Status Konsep (Draft)
            </div>
            <div className="mt-1 flex items-center justify-between font-black text-blue-950 text-xl">
              <span>{draftCount} Draft</span>
              <span className="rounded-full bg-blue-200/80 px-2 py-0.5 font-bold text-xs text-blue-900">
                Siap Review
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN SUB-VIEW SWITCHER */}

      {/* --- SUBVIEW: LIST BERITA --- */}
      {subView === 'list' && (
        <div className="space-y-5">
          {/* Filter and Search Toolbar */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs md:flex-row">
            <div className="relative w-full md:w-80">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3.5 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-4 pl-9 text-slate-800 text-xs outline-none transition focus:border-emerald-600 focus:bg-white"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul berita, tag, atau lokasi..."
                type="text"
                value={searchQuery}
              />
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
              {/* Category Filter */}
              <SelectField
                onChange={(e) => setSelectedCategory(e.target.value)}
                value={selectedCategory}
              >
                <option value="all">Semua Kategori</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>

              {/* Type Filter */}
              <SelectField
                onChange={(e) => setSelectedType(e.target.value)}
                value={selectedType}
              >
                <option value="all">Semua Tipe</option>
                <option value="kegiatan">Kegiatan Lapangan</option>
                <option value="siaran_pers">Siaran Pers</option>
                <option value="pengumuman">Pengumuman Resmi</option>
                <option value="liputan_khusus">Liputan Khusus</option>
              </SelectField>

              {/* Status Filter */}
              <SelectField
                onChange={(e) => setSelectedStatus(e.target.value)}
                value={selectedStatus}
              >
                <option value="all">Semua Status</option>
                <option value="published">Terbit (Published)</option>
                <option value="draft">Draft (Konsep)</option>
              </SelectField>
            </div>
          </div>

          {/* NEWS CARDS GRID */}
          {loadState === 'loading' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 text-xs shadow-2xs">
              Memuat berita...
            </div>
          )}
          {loadState === 'error' && (
            <div
              className="rounded-2xl border border-rose-200 bg-rose-50 p-12 text-center shadow-2xs"
              role="alert"
            >
              <h3 className="font-bold text-base text-rose-800">
                Gagal memuat berita
              </h3>
              <button
                className="mt-4 cursor-pointer rounded-xl bg-rose-100 px-4 py-2 font-bold text-rose-800 text-xs transition hover:bg-rose-200"
                onClick={() => {
                  setLoadState('loading');
                  fetchBackendNews();
                }}
                type="button"
              >
                Coba Lagi
              </button>
            </div>
          )}
          {loadState === 'ready' && newsList.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-2xs">
              <Newspaper className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <h3 className="font-bold text-base text-slate-800">
                Belum ada artikel yang diterbitkan
              </h3>
              <p className="mx-auto mt-1 max-w-md text-slate-500 text-xs">
                Klik &quot;Buat Berita Baru&quot; untuk membuat.
              </p>
            </div>
          )}
          {loadState === 'ready' &&
          newsList.length > 0 &&
          filteredNews.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-2xs">
              <Newspaper className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <h3 className="font-bold text-base text-slate-800">
                Tidak ada berita yang sesuai
              </h3>
              <p className="mx-auto mt-1 max-w-md text-slate-500 text-xs">
                Silakan sesuaikan kata kunci pencarian atau filter kategori di
                atas.
              </p>
              <button
                className="mt-4 cursor-pointer rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedType('all');
                  setSelectedStatus('all');
                }}
                type="button"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredNews.map((item) => (
                <div
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition hover:border-emerald-500/50 hover:shadow-md"
                  key={item.id}
                >
                  {/* Cover Image Container */}
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
                    {/* biome-ignore lint/performance/noImgElement: dipulihkan 1:1 dari origin/awan (PR #28) — mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
                    <img
                      alt={item.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      src={item.coverImage}
                    />

                    {/* Top Badges */}
                    <div className="absolute top-2.5 right-2.5 left-2.5 flex items-center justify-between gap-1.5">
                      <span className="rounded-lg bg-black/70 px-2.5 py-1 font-bold text-xs text-white backdrop-blur-xs">
                        {item.category}
                      </span>

                      <div className="flex items-center gap-1">
                        {item.isPinned && (
                          <span
                            className="rounded-lg bg-amber-500 p-1.5 text-white shadow-xs"
                            title="Disematkan di Beranda"
                          >
                            <Pin className="h-3 w-3 fill-current" />
                          </span>
                        )}
                        <span
                          className={`rounded-md px-2 py-0.5 font-bold text-xs uppercase tracking-wider ${
                            item.status === 'published'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-amber-500 text-white'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>

                    {/* Location Badge if exists */}
                    {item.location && (
                      <div className="absolute bottom-2 left-2.5 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-xs">
                        <MapPin className="h-2.5 w-2.5 text-emerald-400" />
                        <span className="max-w-[200px] truncate">
                          {item.location}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      {/* Publication Date & Author */}
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{item.publishDate}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span className="max-w-[120px] truncate">
                            {item.author.split(' ')[0]}
                          </span>
                        </span>
                      </div>

                      {/* biome-ignore lint/nursery/noNoninteractiveElementInteractions: dipulihkan 1:1 dari origin/awan (PR #28) — menjadikannya <button> akan mengubah DOM */}
                      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dipulihkan 1:1 dari origin/awan (PR #28) — handler papan ketik menyusul saat a11y pass; mengubah elemen sekarang akan mengubah DOM */}
                      <h3
                        className="line-clamp-2 cursor-pointer font-bold text-slate-900 text-sm leading-snug transition hover:text-emerald-800"
                        onClick={() => setPreviewNews(item)}
                      >
                        {item.title}
                      </h3>

                      <p className="mt-2 line-clamp-2 text-slate-500 text-xs leading-relaxed">
                        {item.summary}
                      </p>

                      {/* Tags */}
                      {item.tags && item.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {item.tags.slice(0, 3).map((t) => (
                            <span
                              className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-[9px] text-slate-600"
                              key={t}
                            >
                              #{t}
                            </span>
                          ))}
                          {item.tags.length > 3 && (
                            <span className="text-[9px] text-slate-400">
                              +{item.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-4 flex items-center justify-between border-slate-100 border-t pt-4">
                      {/* Views & Likes */}
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5 text-slate-400" />
                          <span>{item.viewsCount}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5 text-rose-500" />
                          <span>{item.likesCount}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                          <span>{item.comments?.length || 0}</span>
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          className={`cursor-pointer rounded-lg p-1.5 text-xs transition ${
                            item.isPinned
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                          }`}
                          onClick={(e) => handleTogglePin(item.id, e)}
                          title={
                            item.isPinned ? 'Lepas Pin' : 'Sematkan di Beranda'
                          }
                          type="button"
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>

                        <button
                          className="cursor-pointer rounded-lg p-1.5 text-slate-600 text-xs transition hover:bg-slate-100"
                          onClick={() => setPreviewNews(item)}
                          title="Lihat Pratinjau Pembaca"
                          type="button"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>

                        <button
                          className="cursor-pointer rounded-lg p-1.5 text-emerald-700 text-xs transition hover:bg-emerald-50"
                          onClick={() => handleEdit(item)}
                          title="Edit Berita"
                          type="button"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          className="cursor-pointer rounded-lg p-1.5 text-rose-600 text-xs transition hover:bg-rose-50"
                          onClick={() => handleDelete(item.id)}
                          title="Hapus Berita"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- SUBVIEW: CREATE / EDIT NEWS FORM --- */}
      {subView === 'create' && (
        <div className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs sm:p-7">
          {/* Header */}
          <div className="flex items-center justify-between border-slate-100 border-b pb-4">
            <div>
              <h2 className="font-bold text-lg text-slate-900">
                {editingId
                  ? 'Edit Artikel Berita & Kegiatan'
                  : 'Formulir Publikasi Berita & Kegiatan'}
              </h2>
              <p className="mt-0.5 text-slate-500 text-xs">
                Tuliskan liputan lapangan, siaran pers, atau pengumuman resmi
                transparansi dana wakaf.
              </p>
            </div>

            <button
              className="flex cursor-pointer items-center gap-1 rounded-xl bg-slate-100 px-3.5 py-1.5 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
              onClick={() => setSubView('list')}
              type="button"
            >
              <X className="h-4 w-4" />
              <span>Kembali</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left 2 Cols: Main Editor Inputs */}
            <div className="space-y-5 lg:col-span-2">
              {/* Judul Berita */}
              <div>
                <label
                  className="mb-1.5 block font-bold text-slate-700 text-xs uppercase tracking-wider"
                  htmlFor="newsmanagement-f1153"
                >
                  Judul Berita / Nama Kegiatan{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-semibold text-slate-900 text-sm outline-none transition focus:border-emerald-600 focus:bg-white"
                  id="newsmanagement-f1153"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Contoh: Seremoni Penyerahan Beasiswa Santri & Peresmian Sumur Bor Wakaf NTT..."
                  type="text"
                  value={form.title}
                />
              </div>

              {/* Ringkasan / Lead Paragraph */}
              <div>
                <label
                  className="mb-1.5 block font-bold text-slate-700 text-xs uppercase tracking-wider"
                  htmlFor="newsmanagement-f1168"
                >
                  Ringkasan / Lead Paragraph (Muncul di Beranda & Notifikasi)
                </label>
                <textarea
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-800 text-xs outline-none transition focus:border-emerald-600 focus:bg-white"
                  id="newsmanagement-f1168"
                  onChange={(e) =>
                    setForm({ ...form, summary: e.target.value })
                  }
                  placeholder="Tulis ringkasan padat 1-2 kalimat mengenai inti acara atau pengumuman..."
                  rows={2}
                  value={form.summary}
                />
              </div>

              {/* Isi Lengkap Berita (Rich Text Area) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    className="block font-bold text-slate-700 text-xs uppercase tracking-wider"
                    htmlFor="newsmanagement-f1185"
                  >
                    Isi Lengkap Berita & Liputan{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-xs text-slate-400">
                    Mendukung Markdown & Heading (##, ###, &gt; kutipan)
                  </span>
                </div>
                <textarea
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-sans text-slate-800 text-xs leading-relaxed outline-none transition focus:border-emerald-600 focus:bg-white sm:text-sm"
                  id="newsmanagement-f1185"
                  onChange={(e) =>
                    setForm({ ...form, content: e.target.value })
                  }
                  placeholder="Tulis narasi berita lengkap di sini... Anda dapat menggunakan subjudul (## Judul), poin-poin (1., 2.), dan kutipan (> Pesan)."
                  rows={10}
                  value={form.content}
                />
              </div>

              {/* Lokasi & Tanggal Kegiatan */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1.5 block font-bold text-slate-700 text-xs uppercase tracking-wider"
                    htmlFor="newsmanagement-f1207"
                  >
                    Lokasi Pelaksanaan Kegiatan
                  </label>
                  <div className="relative">
                    <MapPin className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-slate-400" />
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-slate-800 text-xs outline-none transition focus:border-emerald-600 focus:bg-white"
                      id="newsmanagement-f1207"
                      onChange={(e) =>
                        setForm({ ...form, location: e.target.value })
                      }
                      placeholder="Contoh: Bandung Barat / Kantor BWI Pusat"
                      type="text"
                      value={form.location}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="mb-1.5 block font-bold text-slate-700 text-xs uppercase tracking-wider"
                    htmlFor="newsmanagement-f1225"
                  >
                    Tanggal Kegiatan
                  </label>
                  <div className="relative">
                    <Calendar className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-slate-400" />
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-slate-800 text-xs outline-none transition focus:border-emerald-600 focus:bg-white"
                      id="newsmanagement-f1225"
                      onChange={(e) =>
                        setForm({ ...form, eventDate: e.target.value })
                      }
                      placeholder="Contoh: 24 Agustus 2026"
                      type="text"
                      value={form.eventDate}
                    />
                  </div>
                </div>
              </div>

              {/* Tags Management */}
              <div>
                <label
                  className="mb-1.5 block font-bold text-slate-700 text-xs uppercase tracking-wider"
                  htmlFor="newsmanagement-f1245"
                >
                  Topik / Tag Berita
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="-translate-y-1/2 absolute top-1/2 left-3 h-3.5 w-3.5 text-slate-400" />
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-slate-800 text-xs outline-none transition focus:border-emerald-600 focus:bg-white"
                      id="newsmanagement-f1245"
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Ketik tag (contoh: PenyaluranWakaf, BWI) lalu tekan Tambah..."
                      type="text"
                      value={tagInput}
                    />
                  </div>
                  <button
                    className="cursor-pointer rounded-xl bg-slate-200 px-3 py-1.5 font-bold text-slate-800 text-xs transition hover:bg-slate-300"
                    onClick={handleAddTag}
                    type="button"
                  >
                    Tambah Tag
                  </button>
                </div>

                {form.tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {form.tags.map((tag) => (
                      <span
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-xs text-emerald-800"
                        key={tag}
                      >
                        #{tag}
                        <button
                          className="cursor-pointer hover:text-rose-600"
                          onClick={() => handleRemoveTag(tag)}
                          type="button"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right 1 Col: Metadata, Cover, & Publishing Options */}
            <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5">
              {/* Category & Type */}
              <div>
                <label
                  className="mb-1.5 block font-bold text-slate-700 text-xs uppercase tracking-wider"
                  htmlFor="newsmanagement-f1300"
                >
                  Kategori Berita
                </label>
                <SelectField
                  className="w-full"
                  id="newsmanagement-f1300"
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  value={form.category}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div>
                <label
                  className="mb-1.5 block font-bold text-slate-700 text-xs uppercase tracking-wider"
                  htmlFor="newsmanagement-f1319"
                >
                  Tipe Publikasi
                </label>
                <SelectField
                  className="w-full"
                  id="newsmanagement-f1319"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target.value as NewsItem['type'],
                    })
                  }
                  value={form.type}
                >
                  <option value="kegiatan">Berita Kegiatan Lapangan</option>
                  <option value="siaran_pers">Siaran Pers Resmi</option>
                  <option value="pengumuman">Pengumuman Penting</option>
                  <option value="liputan_khusus">Liputan Khusus</option>
                </SelectField>
              </div>

              {/* Penulis */}
              <div>
                <label
                  className="mb-1.5 block font-bold text-slate-700 text-xs uppercase tracking-wider"
                  htmlFor="newsmanagement-f1338"
                >
                  Penulis / Redaktur
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 text-xs outline-none transition focus:border-emerald-600"
                  id="newsmanagement-f1338"
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  type="text"
                  value={form.author}
                />
              </div>

              {/* Headline / Pin Toggle */}
              <div className="border-slate-200 border-t pt-2">
                <label className="flex cursor-pointer select-none items-center gap-2">
                  <input
                    checked={form.isPinned}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    onChange={(e) =>
                      setForm({ ...form, isPinned: e.target.checked })
                    }
                    type="checkbox"
                  />
                  <span className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                    <Pin className="h-3.5 w-3.5 fill-current text-amber-500" />
                    <span>Jadikan Berita Utama / Pin ke Beranda</span>
                  </span>
                </label>
              </div>

              {/* Cover Image Selector */}
              <div className="border-slate-200 border-t pt-3">
                {/* biome-ignore lint/a11y/noLabelWithoutControl: dipulihkan 1:1 dari origin/awan (PR #28) — label ini menaungi satu GRUP kontrol (toggle unggah/tautan, preset, editor), bukan satu kontrol tunggal; perbaikan sebenarnya butuh fieldset/legend yang mengubah DOM */}
                <label className="mb-2 block font-bold text-slate-700 text-xs uppercase tracking-wider">
                  Foto Utama / Cover Berita
                </label>

                {/* Preset Thumbnails */}
                <div className="mb-3 grid grid-cols-3 gap-1.5">
                  {PRESET_IMAGES.map((img) => (
                    <button
                      className={`relative aspect-video cursor-pointer overflow-hidden rounded-lg border-2 transition ${
                        form.coverImage === img.url
                          ? 'border-emerald-600 ring-2 ring-emerald-500/20'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                      key={img.url}
                      onClick={() => setForm({ ...form, coverImage: img.url })}
                      type="button"
                    >
                      {/* biome-ignore lint/performance/noImgElement: dipulihkan 1:1 dari origin/awan (PR #28) — mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
                      <img
                        alt={img.label}
                        className="h-full w-full object-cover"
                        src={img.url}
                      />
                    </button>
                  ))}
                </div>

                {/* Custom URL Input */}
                <div className="relative">
                  <Link2 className="-translate-y-1/2 absolute top-1/2 left-3 h-3.5 w-3.5 text-slate-400" />
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-slate-800 text-xs outline-none transition focus:border-emerald-600"
                    onChange={(e) =>
                      setForm({ ...form, coverImage: e.target.value })
                    }
                    placeholder="Atau masukkan tautan URL gambar..."
                    type="text"
                    value={form.coverImage}
                  />
                </div>
              </div>

              {/* Save & Publish Buttons */}
              <div className="space-y-2 border-slate-200 border-t pt-4">
                <button
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#1B5E20] py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#154a19]"
                  onClick={() => handleSaveNews('published')}
                  type="button"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {editingId
                      ? 'Simpan & Publikasikan'
                      : 'Terbitkan Berita Sekarang'}
                  </span>
                </button>

                <button
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-100"
                  onClick={() => handleSaveNews('draft')}
                  type="button"
                >
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  <span>Simpan Sebagai Draft</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SUBVIEW: CATEGORIES MANAGEMENT --- */}
      {subView === 'categories' && (
        <div className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs sm:p-6">
          <div className="flex items-center justify-between border-slate-100 border-b pb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900 sm:text-lg">
                Manajemen Kategori Berita & Informasi
              </h2>
              <p className="mt-0.5 text-slate-500 text-xs">
                Kelola kelompok topik untuk memudahkan pengarsipan liputan
                kegiatan dan pengumuman.
              </p>
            </div>

            <button
              className="cursor-pointer rounded-xl bg-slate-100 px-3 py-1.5 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
              onClick={() => setSubView('list')}
              type="button"
            >
              Kembali ke Daftar
            </button>
          </div>

          {/* Add Category Form */}
          <div className="flex max-w-lg gap-2">
            <input
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-slate-900 text-xs outline-none transition focus:border-emerald-600 focus:bg-white"
              onChange={(e) => setNewCatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="Nama kategori baru (contoh: Beasiswa Santri, Kunjungan DPS)..."
              type="text"
              value={newCatInput}
            />
            <button
              className="flex cursor-pointer items-center gap-1 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs transition hover:bg-[#154a19]"
              onClick={handleAddCategory}
              type="button"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah</span>
            </button>
          </div>

          {/* Categories List Table */}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {categories.map((cat, idx) => {
              const count = newsList.filter((n) => n.category === cat).length;
              const isEditing = editingCatIndex === idx;

              return (
                <div
                  className="flex items-center justify-between bg-white p-3.5 transition hover:bg-slate-50/70"
                  key={cat}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 font-bold text-emerald-800 text-xs">
                      {idx + 1}
                    </div>

                    {isEditing ? (
                      <input
                        autoFocus
                        className="rounded-lg border border-emerald-500 px-2.5 py-1 font-semibold text-slate-800 text-xs outline-none"
                        onChange={(e) => setEditingCatText(e.target.value)}
                        type="text"
                        value={editingCatText}
                      />
                    ) : (
                      <div>
                        <div className="font-bold text-slate-900 text-xs">
                          {cat}
                        </div>
                        <div className="text-xs text-slate-400">
                          {count} artikel berita terdaftar
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isEditing ? (
                      <>
                        <button
                          className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white text-xs transition hover:bg-emerald-700"
                          onClick={() => handleSaveEditCategory(idx)}
                          type="button"
                        >
                          Simpan
                        </button>
                        <button
                          className="cursor-pointer rounded-lg bg-slate-200 px-2.5 py-1 font-semibold text-slate-700 text-xs transition hover:bg-slate-300"
                          onClick={() => setEditingCatIndex(null)}
                          type="button"
                        >
                          Batal
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="cursor-pointer rounded-lg p-1.5 text-slate-500 text-xs transition hover:bg-emerald-50 hover:text-emerald-700"
                          onClick={() => {
                            setEditingCatIndex(idx);
                            setEditingCatText(cat);
                          }}
                          title="Ubah Nama"
                          type="button"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="cursor-pointer rounded-lg p-1.5 text-slate-400 text-xs transition hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => handleDeleteCategory(cat)}
                          title="Hapus Kategori"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- SUBVIEW: STATISTIK & JANGKAUAN --- */}
      {subView === 'analytics' && (
        <div className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs sm:p-6">
          <div className="flex items-center justify-between border-slate-100 border-b pb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900 sm:text-lg">
                Statistik & Jangkauan Informasi Publik
              </h2>
              <p className="mt-0.5 text-slate-500 text-xs">
                Performa artikel berita, ketertarikan jamaah, dan engagement per
                kategori.
              </p>
            </div>

            <button
              className="cursor-pointer rounded-xl bg-slate-100 px-3 py-1.5 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
              onClick={() => setSubView('list')}
              type="button"
            >
              Kembali ke Berita
            </button>
          </div>

          {/* Top News Ranking */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">
              Berita Terpopuler Berdasarkan Pembaca
            </h3>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {newsList
                .sort((a, b) => b.viewsCount - a.viewsCount)
                .slice(0, 5)
                .map((n, i) => (
                  <div
                    className="flex items-center justify-between bg-white p-3.5 transition hover:bg-slate-50"
                    key={n.id}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg font-black text-xs ${rankBadgeClass(
                          i
                        )}`}
                      >
                        #{i + 1}
                      </div>
                      <div>
                        <div className="line-clamp-1 font-bold text-slate-900 text-xs">
                          {n.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                          <span>{n.category}</span>
                          <span>•</span>
                          <span>{n.publishDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 font-semibold text-xs">
                      <span className="flex items-center gap-1 text-emerald-800">
                        <Eye className="h-3.5 w-3.5" />
                        <span>{n.viewsCount.toLocaleString()}</span>
                      </span>
                      <span className="flex items-center gap-1 text-rose-600">
                        <Heart className="h-3.5 w-3.5" />
                        <span>{n.likesCount}</span>
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* --- READER PREVIEW MODAL --- */}
      {previewNews && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs duration-200">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-100 bg-white shadow-2xl">
            {/* Modal Header Cover */}
            <div className="relative aspect-video w-full bg-slate-900 sm:aspect-21/9">
              {/* biome-ignore lint/performance/noImgElement: dipulihkan 1:1 dari origin/awan (PR #28) — mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
              <img
                alt={previewNews.title}
                className="h-full w-full object-cover opacity-90"
                src={previewNews.coverImage}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              <button
                className="absolute top-4 right-4 cursor-pointer rounded-full bg-black/50 p-2 text-white transition hover:bg-black/80"
                onClick={() => setPreviewNews(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="absolute right-5 bottom-4 left-5 text-white">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-emerald-600 px-2.5 py-0.5 font-bold text-xs text-white">
                    {previewNews.category}
                  </span>
                  {previewNews.location && (
                    <span className="flex items-center gap-1 rounded-md bg-black/40 px-2 py-0.5 text-xs text-slate-200">
                      <MapPin className="h-3 w-3 text-emerald-400" />
                      <span>{previewNews.location}</span>
                    </span>
                  )}
                </div>
                <h1 className="font-black text-lg leading-snug sm:text-2xl">
                  {previewNews.title}
                </h1>
              </div>
            </div>

            {/* Modal Body */}
            <div className="space-y-6 p-6 sm:p-8">
              {/* Metadata Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-slate-100 border-b pb-4 text-slate-500 text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-slate-800">
                      {previewNews.author}
                    </span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{previewNews.publishDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 font-bold text-rose-700 text-xs transition hover:bg-rose-100"
                    onClick={() => handleLikeNews(previewNews.id)}
                    type="button"
                  >
                    <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                    <span>{previewNews.likesCount} Suka</span>
                  </button>

                  <button
                    className="cursor-pointer rounded-xl bg-slate-100 p-1.5 text-slate-700 transition hover:bg-slate-200"
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.href);
                      showToast({
                        title: 'Tautan Disalin',
                        description:
                          'Link publik berita telah disalin ke clipboard.',
                        type: 'info',
                      });
                    }}
                    title="Bagikan"
                    type="button"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Lead Summary */}
              {previewNews.summary && (
                <div className="rounded-2xl border-emerald-600 border-l-4 bg-emerald-50/80 p-4 font-medium text-emerald-950 text-xs leading-relaxed sm:text-sm">
                  {previewNews.summary}
                </div>
              )}

              {/* Main Content Body */}
              <div className="space-y-4 whitespace-pre-line font-sans text-slate-800 text-xs leading-relaxed sm:text-sm">
                {previewNews.content}
              </div>

              {/* Tags */}
              {previewNews.tags && previewNews.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-slate-100 border-t pt-4">
                  <span className="mr-1 font-bold text-slate-500 text-xs">
                    Topik:
                  </span>
                  {previewNews.tags.map((t) => (
                    <span
                      className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-xs text-slate-700"
                      key={t}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Comments Section */}
              <div className="space-y-4 border-slate-100 border-t pt-6">
                <h3 className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <MessageSquare className="h-4 w-4 text-emerald-700" />
                  <span>
                    Komentar & Apresiasi Publik (
                    {previewNews.comments?.length || 0})
                  </span>
                </h3>

                {/* Comment Input */}
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-slate-800 text-xs outline-none transition focus:border-emerald-600 focus:bg-white"
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && handleAddComment(previewNews.id)
                    }
                    placeholder="Tuliskan respon atau tanggapan resmi admin..."
                    type="text"
                    value={commentInput}
                  />
                  <button
                    className="flex cursor-pointer items-center gap-1 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs transition hover:bg-[#154a19]"
                    onClick={() => handleAddComment(previewNews.id)}
                    type="button"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Kirim</span>
                  </button>
                </div>

                {/* Comments List */}
                <div className="mt-3 space-y-2.5">
                  {previewNews.comments && previewNews.comments.length > 0 ? (
                    previewNews.comments.map((comm) => (
                      <div
                        className="space-y-1 rounded-xl bg-slate-50 p-3"
                        key={comm.id}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">
                            {comm.authorName}
                          </span>
                          <span className="text-slate-400">
                            {comm.timestamp}
                          </span>
                        </div>
                        <p className="text-slate-700 text-xs leading-relaxed">
                          {comm.comment}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 text-xs italic">
                      Belum ada komentar untuk artikel ini.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
