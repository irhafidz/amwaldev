import type { NotificationType } from '@amwal/core/contracts/admin-notifications';
import { NOTIFICATION_TYPES } from '@amwal/core/contracts/admin-notifications';
import {
  Bell,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AdminPageHeader,
  DataTable,
  HERO_BUTTON_PRIMARY,
  useAdminToast,
} from '@/components/admin/admin-primitives';
import { confirmAction } from '@/components/ui/confirm-action';
import { SelectField } from '@/components/ui/select-field';
import { orpc } from '@/lib/orpc/client';

interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string | null;
}

const TYPE_TONE: Record<string, string> = {
  INFO: 'border-blue-200 bg-blue-50 text-blue-700',
  PENGINGAT: 'border-amber-200 bg-amber-50 text-amber-700',
  TRANSAKSI: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  VERIFIKASI: 'border-purple-200 bg-purple-50 text-purple-700',
  SISTEM: 'border-slate-300 bg-slate-100 text-slate-700',
};

function TypeBadge({ type }: { type: string }) {
  const tone = TYPE_TONE[type] ?? 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 font-bold text-xs uppercase tracking-wide ${tone}`}
    >
      {type}
    </span>
  );
}

function UserPicker({
  value,
  onChange,
}: {
  value: UserOption | null;
  onChange: (user: UserOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<UserOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const timer = setTimeout(() => {
      orpc.admin.notifications
        .searchUsers({ search: query || undefined, limit: 20 })
        .then((res) => setOptions(res.data))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <div>
          <div className="font-semibold text-slate-800">{value.name}</div>
          <div className="text-xs text-slate-400">{value.email}</div>
        </div>
        <button
          className="cursor-pointer text-slate-400 text-xs hover:text-rose-600"
          onClick={() => onChange(null)}
          type="button"
        >
          Ganti
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder="Cari nama atau email pengguna…"
        type="text"
        value={query}
      />
      {isOpen && options.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {options.map((opt) => (
            <button
              className="flex w-full cursor-pointer flex-col items-start px-3 py-2 text-left text-sm hover:bg-emerald-50"
              key={opt.id}
              onClick={() => {
                onChange(opt);
                setQuery('');
                setIsOpen(false);
              }}
              type="button"
            >
              <span className="font-semibold text-slate-800">{opt.name}</span>
              <span className="text-xs text-slate-400">{opt.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationsManagementView() {
  const toast = useAdminToast();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formUser, setFormUser] = useState<UserOption | null>(null);
  const [formType, setFormType] = useState<NotificationType>('INFO');
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');

  const [editingRow, setEditingRow] = useState<NotificationRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editType, setEditType] = useState<NotificationType>('INFO');
  const [editIsRead, setEditIsRead] = useState(false);

  const fetchData = () => {
    setIsLoading(true);
    orpc.admin.notifications
      .list({ search: search || undefined, limit: 50, offset: 0 })
      .then((res) => {
        setRows(res.items as NotificationRow[]);
        setTotal(res.total);
      })
      .catch(() => toast.err('Gagal memuat notifikasi'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormUser(null);
    setFormType('INFO');
    setFormTitle('');
    setFormBody('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(formUser && formTitle.trim())) {
      return;
    }
    setIsSubmitting(true);
    try {
      await orpc.admin.notifications.create({
        userId: formUser.id,
        type: formType,
        title: formTitle.trim(),
        body: formBody.trim() || undefined,
      });
      toast.ok('Notifikasi berhasil dibuat');
      setIsFormOpen(false);
      resetForm();
      fetchData();
    } catch {
      toast.err('Gagal membuat notifikasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (row: NotificationRow) => {
    setEditingRow(row);
    setEditTitle(row.title);
    setEditBody(row.body ?? '');
    setEditType(row.type as NotificationType);
    setEditIsRead(row.isRead);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) {
      return;
    }
    setIsSubmitting(true);
    try {
      await orpc.admin.notifications.update({
        id: editingRow.id,
        title: editTitle.trim(),
        body: editBody.trim() || undefined,
        type: editType,
        isRead: editIsRead,
      });
      toast.ok('Notifikasi berhasil diperbarui');
      setEditingRow(null);
      fetchData();
    } catch {
      toast.err('Gagal memperbarui notifikasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (row: NotificationRow) => {
    const confirmed = await confirmAction({
      title: 'Hapus Notifikasi?',
      description: `Notifikasi "${row.title}" akan dihapus.`,
    });
    if (!confirmed) {
      return;
    }
    try {
      await orpc.admin.notifications.delete({ id: row.id });
      toast.ok('Notifikasi berhasil dihapus');
      fetchData();
    } catch {
      toast.err('Gagal menghapus notifikasi');
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <div className="flex items-center gap-2">
            <button
              className="cursor-pointer rounded-xl border border-white/30 bg-white/10 p-2.5 text-white transition hover:bg-white/20"
              onClick={fetchData}
              title="Muat Ulang"
              type="button"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
            <button
              className={HERO_BUTTON_PRIMARY}
              onClick={() => setIsFormOpen((prev) => !prev)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Buat Notifikasi
            </button>
          </div>
        }
        description="Kirim, ubah, dan hapus notifikasi in-app untuk pengguna tertentu."
        title="Manajemen Notifikasi"
      />

      <input
        className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && fetchData()}
        placeholder="Cari judul atau isi notifikasi…"
        type="text"
        value={search}
      />

      {isFormOpen && (
        <form
          className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-xs"
          onSubmit={handleCreate}
        >
          <h3 className="border-slate-200 border-b pb-2 font-semibold text-slate-800">
            Notifikasi Baru
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-slate-700 text-xs">
                Pengguna Tujuan *
              </label>
              <UserPicker onChange={setFormUser} value={formUser} />
            </div>
            <div>
              <label
                className="mb-1 block font-semibold text-slate-700 text-xs"
                htmlFor="notif-type"
              >
                Tipe
              </label>
              <SelectField
                className="w-full"
                id="notif-type"
                onChange={(e) =>
                  setFormType(e.target.value as NotificationType)
                }
                value={formType}
              >
                {NOTIFICATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
          <div>
            <label
              className="mb-1 block font-semibold text-slate-700 text-xs"
              htmlFor="notif-title"
            >
              Judul *
            </label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              id="notif-title"
              onChange={(e) => setFormTitle(e.target.value)}
              required
              type="text"
              value={formTitle}
            />
          </div>
          <div>
            <label
              className="mb-1 block font-semibold text-slate-700 text-xs"
              htmlFor="notif-body"
            >
              Isi Pesan
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              id="notif-body"
              onChange={(e) => setFormBody(e.target.value)}
              rows={3}
              value={formBody}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="cursor-pointer rounded-xl px-4 py-2 font-semibold text-slate-600 text-sm transition hover:bg-slate-200"
              onClick={() => {
                setIsFormOpen(false);
                resetForm();
              }}
              type="button"
            >
              Batal
            </button>
            <button
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-sm text-white transition hover:bg-emerald-700 disabled:opacity-50"
              disabled={isSubmitting || !formUser || !formTitle.trim()}
              type="submit"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Kirim Notifikasi
            </button>
          </div>
        </form>
      )}

      <DataTable
        head={['Judul', 'Pengguna', 'Tipe', 'Status', 'Dibuat', 'Aksi']}
      >
        {isLoading ? (
          <tr>
            <td className="px-4 py-12 text-center text-slate-400" colSpan={6}>
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
              Memuat notifikasi…
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td className="px-4 py-12 text-center text-slate-400" colSpan={6}>
              <Bell className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              Belum ada notifikasi.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr className="transition hover:bg-slate-50" key={row.id}>
              <td className="max-w-xs truncate px-4 py-3 font-semibold text-slate-800">
                {row.title}
              </td>
              <td className="px-4 py-3">
                <div className="text-slate-800">{row.userName ?? '—'}</div>
                <div className="text-xs text-slate-400">
                  {row.userEmail ?? row.userId}
                </div>
              </td>
              <td className="px-4 py-3">
                <TypeBadge type={row.type} />
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 font-bold text-xs uppercase tracking-wide ${
                    row.isRead
                      ? 'border-slate-200 bg-slate-50 text-slate-500'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {row.isRead ? 'Dibaca' : 'Belum Dibaca'}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500 text-xs">
                {new Date(row.createdAt).toLocaleString('id-ID')}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <button
                    className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700"
                    onClick={() => openEdit(row)}
                    title="Edit"
                    type="button"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => handleDelete(row)}
                    title="Hapus"
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </DataTable>

      <p className="text-xs text-slate-400">
        Menampilkan {rows.length} dari {total} notifikasi.
      </p>

      {editingRow && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150">
          <form
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onSubmit={handleUpdate}
          >
            <div className="flex items-center justify-between border-slate-100 border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Edit Notifikasi
              </h3>
              <button
                className="cursor-pointer p-1 text-slate-400 hover:text-slate-600"
                onClick={() => setEditingRow(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label
                className="mb-1 block font-semibold text-slate-700 text-xs"
                htmlFor="edit-notif-type"
              >
                Tipe
              </label>
              <SelectField
                className="w-full"
                id="edit-notif-type"
                onChange={(e) =>
                  setEditType(e.target.value as NotificationType)
                }
                value={editType}
              >
                {NOTIFICATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </SelectField>
            </div>

            <div>
              <label
                className="mb-1 block font-semibold text-slate-700 text-xs"
                htmlFor="edit-notif-title"
              >
                Judul
              </label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                id="edit-notif-title"
                onChange={(e) => setEditTitle(e.target.value)}
                required
                type="text"
                value={editTitle}
              />
            </div>

            <div>
              <label
                className="mb-1 block font-semibold text-slate-700 text-xs"
                htmlFor="edit-notif-body"
              >
                Isi Pesan
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                id="edit-notif-body"
                onChange={(e) => setEditBody(e.target.value)}
                rows={3}
                value={editBody}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-slate-700 text-xs">
              <input
                checked={editIsRead}
                onChange={(e) => setEditIsRead(e.target.checked)}
                type="checkbox"
              />
              Tandai sudah dibaca
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 text-xs hover:bg-slate-200"
                onClick={() => setEditingRow(null)}
                type="button"
              >
                Batal
              </button>
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B5E20] px-4 py-1.5 font-bold text-white text-xs shadow-xs hover:bg-[#144716] disabled:opacity-50"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default NotificationsManagementView;
