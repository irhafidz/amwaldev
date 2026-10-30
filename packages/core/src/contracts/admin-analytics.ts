import { z } from 'zod';
import { AKAD_CATEGORIES } from '../analytics/akad-category';
import { DONOR_SEGMENTS } from '../analytics/donor-segments';

export const analyticsPeriodSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12).optional(),
});

const akadSchema = z.enum(AKAD_CATEGORIES);

export const rfmSegmentsInput = z.object({
  segment: z.enum(DONOR_SEGMENTS).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(20),
});

export const retentionCohortInput = z.object({
  akad: akadSchema.optional(),
  /** Columns M+0 .. M+(months-1). */
  months: z.number().int().min(2).max(12).default(6),
  /** Most recent acquisition cohorts to show. */
  cohorts: z.number().int().min(1).max(24).default(12),
});
