import { akadAdmin } from './akad';
import { amil } from './amil';
import { analytics } from './analytics';
import { cmsAdmin } from './cms';
import { documents } from './documents';
import { education } from './education';
import { infaq } from './infaq';
import { masterData } from './master-data';
import { notifications } from './notifications';
import { overview } from './overview';
import { qurban } from './qurban';
import { rolesAdmin } from './roles';
import { settings } from './settings';
import { transparency } from './transparency';
import { usersAdmin } from './users';
import { wa } from './wa';
import { waqf } from './waqf';
import { zakat } from './zakat';

/**
 * Parent oRPC namespace for the entire admin backoffice (Putaran 17,
 * Batch 4) — the oRPC-side twin of `apps/server/src/routes/admin/index.ts`.
 * Every leaf procedure carries its own `adminProcedure` guard
 * (`roleProcedure('ADMIN')`), so there is no separate path list that can
 * drift out of sync (the failure mode of AMW-03).
 */
export const admin = {
  akad: akadAdmin,
  waqf,
  zakat,
  qurban,
  infaq,
  documents,
  masterData,
  notifications,
  transparency,
  settings,
  overview,
  amil,
  analytics,
  cms: cmsAdmin,
  wa,
  education,
  users: usersAdmin,
  roles: rolesAdmin,
};
