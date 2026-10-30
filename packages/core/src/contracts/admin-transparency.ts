import { z } from 'zod';
import { AKAD_CATEGORIES } from '../analytics/akad-category';

export const ledgerInput = z.object({
  akad: z.enum(AKAD_CATEGORIES).optional(),
  /** Matches the transaction ID or the (already anonymity-masked) donor name. */
  search: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(20),
});

export const realizationLogInput = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(20),
});
