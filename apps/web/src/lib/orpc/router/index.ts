import { publicProcedure } from '../procedures';
import { admin } from './admin';
import { affiliate } from './affiliate';
import { akad } from './akad';
import { amil } from './amil';
import { askAi } from './ask-ai';
import { auth } from './auth';
import { certificate } from './certificate';
import { cms } from './cms';
import { content } from './content';
import { education } from './education';
import { gamification } from './gamification';
import { infaq } from './infaq';
import { nadzir } from './nadzir';
import { notifications } from './notifications';
import { qurban } from './qurban';
import { receipts } from './receipts';
import { stats } from './stats';
import { transactionsRouter } from './transactions';
import { user } from './user';
import { waqf } from './waqf';
import { wilayahRouter } from './wilayah';
import { zakat } from './zakat';

const health = publicProcedure.handler(() => ({ ok: true }));

export const router = {
  health,
  admin,
  auth,
  user,
  certificate,
  waqf,
  zakat,
  qurban,
  infaq,
  nadzir,
  amil,
  notifications,
  askAi,
  transactions: transactionsRouter,
  // Sprint 11 — stub milik agent lain, dipasang Claude Pro supaya permukaan
  // dan guard-nya sudah ada sebelum kueri riil diinjeksi. `admin.analytics`
  // tidak di sini: sudah ter-mount di `admin/index.ts` sejak Senin.
  gamification,
  affiliate,
  akad,
  receipts,
  stats,
  cms,
  content,
  education,
  wilayah: wilayahRouter,
};

export type AppRouter = typeof router;
