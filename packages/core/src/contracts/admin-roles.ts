import { z } from 'zod';
import {
  FEATURE_KEYS,
  type FeatureKey,
  PERMISSION_ROLES,
} from '../auth/permissions';

/**
 * ADMIN is the locked master role — it cannot appear in a change set, so the
 * validation (not just the UI) rejects any attempt to strip its permissions.
 */
const editableRole = z.enum(PERMISSION_ROLES).exclude(['ADMIN']);

export const updateMatrixInput = z.object({
  changes: z
    .array(
      z.object({
        role: editableRole,
        featureKey: z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]]),
        isEnabled: z.boolean(),
      })
    )
    .min(1)
    .max(PERMISSION_ROLES.length * FEATURE_KEYS.length),
});
