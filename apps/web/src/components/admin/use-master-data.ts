import type { MasterDataType } from '@amwal/core/contracts/admin-master-data';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  resourceCache,
  STALE_PICKLIST_MS,
} from '@/lib/amwal-api/resource-cache';
import { orpc } from '@/lib/orpc/client';

/** Cache-key prefix; the Master Data screen invalidates it after every change. */
export const MASTER_DATA_KEY = 'master-data:';

export interface MasterDataOption {
  id: string;
  /** Kode DB (jenis zakat/infaq); `null` untuk picklist bebas. */
  kode: string | null;
  /** Hanya Akad Waqaf: jenis wakaf program yang dipetakan. */
  jenisWakaf?: 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL' | null;
  label: string;
  isActive: boolean;
}

/**
 * Picklist dari Master Data admin. `labels` memetakan kode → label untuk
 * menampilkan data lama (termasuk jenis yang sudah dinonaktifkan), sedangkan
 * `activeOptions` hanya berisi yang boleh dipilih di form.
 */
export function useMasterData(type: MasterDataType) {
  const key = `${MASTER_DATA_KEY}${type}`;
  const [rows, setRows] = useState<MasterDataOption[]>(
    () => resourceCache.peek<MasterDataOption[]>(key)?.data ?? []
  );
  const [isLoading, setIsLoading] = useState(false);

  // Picklists change rarely, so one fetch is shared by every form for 5 minutes;
  // the manual `reload()` always goes to the server.
  const load = useCallback(
    async (force: boolean) => {
      setIsLoading(true);
      try {
        setRows(
          await resourceCache.fetch(
            key,
            async () =>
              (await orpc.admin.masterData.list({ type }))
                .data as MasterDataOption[],
            { force, staleTime: STALE_PICKLIST_MS }
          )
        );
      } catch {
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    },
    [key, type]
  );

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    load(false);
  }, [load]);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.kode ?? row.label] = row.label;
    }
    return map;
  }, [rows]);

  const activeOptions = useMemo(() => rows.filter((r) => r.isActive), [rows]);

  return { rows, activeOptions, labels, isLoading, reload };
}

/**
 * Opsi dropdown aktif, ditambah nilai yang sedang terpilih bila nilai itu
 * sudah dinonaktifkan — supaya form edit data lama tidak diam-diam berganti.
 */
export function withCurrentOption(
  options: MasterDataOption[],
  labels: Record<string, string>,
  current: string,
  valueOf: (option: MasterDataOption) => string
): { value: string; label: string }[] {
  const list = options.map((o) => ({ value: valueOf(o), label: o.label }));
  if (current && !list.some((o) => o.value === current)) {
    list.unshift({
      value: current,
      label: `${labels[current] ?? current} (nonaktif)`,
    });
  }
  return list;
}
