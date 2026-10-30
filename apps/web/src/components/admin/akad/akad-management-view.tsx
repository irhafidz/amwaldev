'use client';

import {
  AKAD_MODULES,
  type AkadModule,
  type AkadTemplateSummary,
} from '@amwal/core/contracts/akad';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  AdminPageHeader,
  HERO_BUTTON_PRIMARY,
  HERO_BUTTON_SECONDARY,
} from '@/components/admin/admin-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  activateAkadVersion,
  listAkadVersions,
  publishAkadVersion,
} from '@/lib/amwal-api/akad';
import { formatWibDate } from '@/lib/format-wib';

export function AkadManagementView() {
  const [selectedModule, setSelectedModule] = useState<AkadModule>('WAKAF');
  const [versions, setVersions] = useState<AkadTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] =
    useState<AkadTemplateSummary | null>(null);
  const [confirmActivateTarget, setConfirmActivateTarget] =
    useState<AkadTemplateSummary | null>(null);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchVersions = useCallback(async (mod: AkadModule) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAkadVersions(mod);
      setVersions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal memuat riwayat versi akad'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVersions(selectedModule);
  }, [selectedModule, fetchVersions]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(newTitle.trim() && newBody.trim())) {
      setFormError('Judul dan redaksi akad wajib diisi');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const created = await publishAkadVersion({
        module: selectedModule,
        title: newTitle.trim(),
        body: newBody.trim(),
      });
      setPublishModalOpen(false);
      setNewTitle('');
      setNewBody('');
      setSuccessMessage(
        `Versi baru (v${created.version}) berhasil diterbitkan sebagai draf nonaktif.`
      );
      await fetchVersions(selectedModule);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Gagal menerbitkan versi akad baru'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async () => {
    if (!confirmActivateTarget) {
      return;
    }

    setSubmitting(true);
    try {
      await activateAkadVersion({
        module: confirmActivateTarget.module,
        version: confirmActivateTarget.version,
      });
      setConfirmActivateTarget(null);
      setSuccessMessage(
        `Versi ${confirmActivateTarget.version} berhasil diaktifkan untuk modul ${confirmActivateTarget.module}.`
      );
      await fetchVersions(selectedModule);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal mengaktifkan versi akad'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        actions={
          <div className="flex items-center gap-2">
            <button
              className={HERO_BUTTON_SECONDARY}
              disabled={loading}
              onClick={() => fetchVersions(selectedModule)}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${loading ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Segarkan</span>
            </button>
            <button
              className={HERO_BUTTON_PRIMARY}
              onClick={() => {
                setFormError(null);
                setPublishModalOpen(true);
              }}
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" />
              <span>Terbitkan Versi Baru</span>
            </button>
          </div>
        }
        description="Pengelolaan redaksi akad hukum per modul (Append-only &amp; bukti integritas SHA-256)."
        icon={<ScrollText aria-hidden="true" />}
        title="Manajemen Templat Akad Dinamis"
      />

      {/* Success / Error Alerts */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2
              aria-hidden="true"
              className="size-5 shrink-0 text-emerald-600"
            />
            <span>{successMessage}</span>
          </div>
          <button
            className="text-emerald-600 hover:text-emerald-900"
            onClick={() => setSuccessMessage(null)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle
              aria-hidden="true"
              className="size-5 shrink-0 text-rose-600"
            />
            <span>{error}</span>
          </div>
          <button
            className="text-rose-600 hover:text-rose-900"
            onClick={() => setError(null)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Module Tabs */}
      <div className="flex flex-wrap gap-2 border-border-subtle border-b pb-3">
        {AKAD_MODULES.map((mod) => (
          <button
            className={`rounded-lg px-4 py-2 font-medium text-sm transition-all ${
              selectedModule === mod
                ? 'bg-brand-primary text-white shadow-xs'
                : 'bg-bg-surface-soft text-text-secondary hover:bg-gray-200'
            }`}
            key={mod}
            onClick={() => setSelectedModule(mod)}
            type="button"
          >
            {mod}
          </button>
        ))}
      </div>

      {/* Versions List Table */}
      <div className="rounded-xl border border-border-subtle bg-bg-surface shadow-xs">
        <div className="border-border-subtle border-b p-4 font-semibold text-text-primary">
          Daftar Versi Akad ({selectedModule})
        </div>

        {loading && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12 w-full" label="Memuat riwayat akad…" />
            <Skeleton aria-hidden="true" className="h-12 w-full" />
            <Skeleton aria-hidden="true" className="h-12 w-full" />
          </div>
        )}

        {!loading && versions.length === 0 && (
          <div className="p-8 text-center text-sm text-text-secondary">
            Belum ada versi templat akad yang diterbitkan untuk modul{' '}
            {selectedModule}.
            <div className="mt-3">
              <Button
                onClick={() => setPublishModalOpen(true)}
                size="sm"
                variant="outline"
              >
                Terbitkan Versi 1
              </Button>
            </div>
          </div>
        )}

        {!loading && versions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-border-subtle border-b bg-bg-surface-soft text-text-secondary text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Versi</th>
                  <th className="px-4 py-3">Judul Templat</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tanggal Dibuat</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {versions.map((ver) => (
                  <tr className="hover:bg-bg-surface-soft/50" key={ver.id}>
                    <td className="px-4 py-3 font-semibold text-text-primary">
                      v{ver.version}
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {ver.title}
                    </td>
                    <td className="px-4 py-3">
                      {ver.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-800 text-xs">
                          <BadgeCheck aria-hidden="true" className="size-3.5" />
                          Aktif Digunakan
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-600 text-xs">
                          Draf Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {ver.createdAt ? formatWibDate(ver.createdAt) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => setPreviewTemplate(ver)}
                          size="sm"
                          variant="ghost"
                        >
                          <FileText aria-hidden="true" className="size-4" />
                          <span>Lihat Redaksi</span>
                        </Button>
                        {!ver.isActive && (
                          <Button
                            onClick={() => setConfirmActivateTarget(ver)}
                            size="sm"
                            variant="outline"
                          >
                            <ShieldCheck
                              aria-hidden="true"
                              className="size-4 text-emerald-600"
                            />
                            <span>Aktifkan</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Preview Redaksi */}
      {previewTemplate && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-2xl bg-bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-border-subtle border-b pb-3">
              <h3 className="font-bold text-lg text-text-primary">
                Pratinjau Redaksi Akad (v{previewTemplate.version})
              </h3>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setPreviewTemplate(null)}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <span className="font-semibold text-text-secondary text-xs uppercase">
                  Judul Akad
                </span>
                <p className="font-medium text-text-primary">
                  {previewTemplate.title}
                </p>
              </div>
              <div>
                <span className="font-semibold text-text-secondary text-xs uppercase">
                  Isi Teks Redaksi
                </span>
                <div className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-bg-surface-soft p-3 font-mono text-text-primary text-xs leading-relaxed">
                  {previewTemplate.body}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setPreviewTemplate(null)}>Tutup</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Publish Version */}
      {publishModalOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-2xl bg-bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-border-subtle border-b pb-3">
              <h3 className="font-bold text-lg text-text-primary">
                Terbitkan Versi Baru — Modul {selectedModule}
              </h3>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setPublishModalOpen(false)}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handlePublish}>
              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 text-xs">
                  {formError}
                </div>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
                <p className="font-semibold">Ketentuan Append-Only Hukum:</p>
                <p className="mt-0.5">
                  Versi baru akan dibuat dengan nomor urut berikutnya. Versi
                  lama tidak pernah dihapus agar integritas donasi yang lalu
                  tetap valid.
                </p>
              </div>

              <div>
                <label
                  className="block font-semibold text-text-secondary text-xs uppercase"
                  htmlFor="new-akad-title"
                >
                  Judul Akad
                </label>
                <Input
                  className="mt-1"
                  disabled={submitting}
                  id="new-akad-title"
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Contoh: Akad Wakaf Uang Sah"
                  required
                  value={newTitle}
                />
              </div>

              <div>
                <label
                  className="block font-semibold text-text-secondary text-xs uppercase"
                  htmlFor="new-akad-body"
                >
                  Isi Redaksi Akad
                </label>
                <textarea
                  className="mt-1 h-36 w-full rounded-lg border border-border-subtle bg-bg-surface p-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:bg-gray-100"
                  disabled={submitting}
                  id="new-akad-body"
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Tuliskan teks redaksi hukum yang akan disetujui donatur..."
                  required
                  value={newBody}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  disabled={submitting}
                  onClick={() => setPublishModalOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Batal
                </Button>
                <Button disabled={submitting} type="submit">
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Menerbitkan...
                    </>
                  ) : (
                    'Terbitkan Versi'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Aktivasi */}
      {confirmActivateTarget && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-2xl bg-bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-3 text-amber-600">
              <ShieldAlert aria-hidden="true" className="size-6 shrink-0" />
              <h3 className="font-bold text-lg text-text-primary">
                Konfirmasi Aktivasi Akad
              </h3>
            </div>

            <p className="mt-3 text-sm text-text-secondary">
              Anda akan mengaktifkan{' '}
              <span className="font-semibold text-text-primary">
                {confirmActivateTarget.title} (v{confirmActivateTarget.version})
              </span>{' '}
              untuk modul{' '}
              <span className="font-semibold text-text-primary">
                {confirmActivateTarget.module}
              </span>
              . Versi yang sedang aktif saat ini akan dinonaktifkan secara
              otomatis.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                disabled={submitting}
                onClick={() => setConfirmActivateTarget(null)}
                variant="outline"
              >
                Batal
              </Button>
              <Button disabled={submitting} onClick={handleActivate}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengaktifkan...
                  </>
                ) : (
                  'Ya, Aktifkan'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
