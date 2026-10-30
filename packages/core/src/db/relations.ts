import { relations } from 'drizzle-orm/relations';
import {
  certificates,
  chatbotConversations,
  chatbotMessages,
  educationContents,
  fundWithdrawalRequests,
  gamificationPointLedgers,
  hewanBatches,
  infaqOrders,
  mauqufAlaihDistributions,
  mustahiqProfiles,
  nadzirDocuments,
  nadzirProfiles,
  notifications,
  permohonanPenyaluranInstitusional,
  petugasLapanganProfiles,
  programProgressReports,
  quizAttempts,
  quizQuestions,
  quizzes,
  qurbanAnimalSlots,
  qurbanDistributionAllocations,
  qurbanDistributionReports,
  qurbanOrders,
  refreshTokens,
  setoranPetugasLapangan,
  setoranQurbanOrderLinks,
  transactions,
  users,
  waqfOrders,
  waqfPrincipalLedgers,
  waqfPrograms,
  waqfYieldEntries,
  zakatCalculations,
  zakatDistributions,
  zakatOrders,
} from './schema';

export const waqfProgramsRelations = relations(
  waqfPrograms,
  ({ one, many }) => ({
    nadzirProfile: one(nadzirProfiles, {
      fields: [waqfPrograms.nadzirProfileId],
      references: [nadzirProfiles.id],
    }),
    waqfPrincipalLedgers: many(waqfPrincipalLedgers),
    fundWithdrawalRequests: many(fundWithdrawalRequests),
    waqfYieldEntries: many(waqfYieldEntries),
    waqfOrders: many(waqfOrders),
    programProgressReports: many(programProgressReports),
    mauqufAlaihDistributions: many(mauqufAlaihDistributions),
  })
);

export const nadzirProfilesRelations = relations(
  nadzirProfiles,
  ({ one, many }) => ({
    waqfPrograms: many(waqfPrograms),
    user_userId: one(users, {
      fields: [nadzirProfiles.userId],
      references: [users.id],
      relationName: 'nadzirProfiles_userId_users_id',
    }),
    user_verifiedById: one(users, {
      fields: [nadzirProfiles.verifiedById],
      references: [users.id],
      relationName: 'nadzirProfiles_verifiedById_users_id',
    }),
    nadzirDocuments: many(nadzirDocuments),
  })
);

export const waqfPrincipalLedgersRelations = relations(
  waqfPrincipalLedgers,
  ({ one }) => ({
    waqfProgram: one(waqfPrograms, {
      fields: [waqfPrincipalLedgers.waqfProgramId],
      references: [waqfPrograms.id],
    }),
  })
);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  nadzirProfiles_userId: many(nadzirProfiles, {
    relationName: 'nadzirProfiles_userId_users_id',
  }),
  nadzirProfiles_verifiedById: many(nadzirProfiles, {
    relationName: 'nadzirProfiles_verifiedById_users_id',
  }),
  fundWithdrawalRequests_approvedById: many(fundWithdrawalRequests, {
    relationName: 'fundWithdrawalRequests_approvedById_users_id',
  }),
  fundWithdrawalRequests_requestedById: many(fundWithdrawalRequests, {
    relationName: 'fundWithdrawalRequests_requestedById_users_id',
  }),
  waqfOrders_enteredByAmilId: many(waqfOrders, {
    relationName: 'waqfOrders_enteredByAmilId_users_id',
  }),
  waqfOrders_wakifId: many(waqfOrders, {
    relationName: 'waqfOrders_wakifId_users_id',
  }),
  transactions: many(transactions),
  infaqOrders: many(infaqOrders),
  zakatCalculations: many(zakatCalculations),
  zakatOrders_enteredByAmilId: many(zakatOrders, {
    relationName: 'zakatOrders_enteredByAmilId_users_id',
  }),
  zakatOrders_muzakkiId: many(zakatOrders, {
    relationName: 'zakatOrders_muzakkiId_users_id',
  }),
  programProgressReports: many(programProgressReports),
  qurbanOrders: many(qurbanOrders),
  petugasLapanganProfiles: many(petugasLapanganProfiles),
  setoranPetugasLapangans: many(setoranPetugasLapangan),
  zakatDistributions: many(zakatDistributions),
  gamificationPointLedgers: many(gamificationPointLedgers),
  permohonanPenyaluranInstitusionals: many(permohonanPenyaluranInstitusional),
  quizAttempts: many(quizAttempts),
  chatbotConversations: many(chatbotConversations),
  notifications: many(notifications),
}));

export const nadzirDocumentsRelations = relations(
  nadzirDocuments,
  ({ one }) => ({
    nadzirProfile: one(nadzirProfiles, {
      fields: [nadzirDocuments.nadzirProfileId],
      references: [nadzirProfiles.id],
    }),
  })
);

export const fundWithdrawalRequestsRelations = relations(
  fundWithdrawalRequests,
  ({ one, many }) => ({
    user_approvedById: one(users, {
      fields: [fundWithdrawalRequests.approvedById],
      references: [users.id],
      relationName: 'fundWithdrawalRequests_approvedById_users_id',
    }),
    user_requestedById: one(users, {
      fields: [fundWithdrawalRequests.requestedById],
      references: [users.id],
      relationName: 'fundWithdrawalRequests_requestedById_users_id',
    }),
    waqfProgram: one(waqfPrograms, {
      fields: [fundWithdrawalRequests.waqfProgramId],
      references: [waqfPrograms.id],
    }),
    mauqufAlaihDistributions: many(mauqufAlaihDistributions),
  })
);

export const waqfYieldEntriesRelations = relations(
  waqfYieldEntries,
  ({ one }) => ({
    waqfProgram: one(waqfPrograms, {
      fields: [waqfYieldEntries.waqfProgramId],
      references: [waqfPrograms.id],
    }),
  })
);

export const waqfOrdersRelations = relations(waqfOrders, ({ one }) => ({
  user_enteredByAmilId: one(users, {
    fields: [waqfOrders.enteredByAmilId],
    references: [users.id],
    relationName: 'waqfOrders_enteredByAmilId_users_id',
  }),
  transaction: one(transactions, {
    fields: [waqfOrders.transactionId],
    references: [transactions.id],
  }),
  user_wakifId: one(users, {
    fields: [waqfOrders.wakifId],
    references: [users.id],
    relationName: 'waqfOrders_wakifId_users_id',
  }),
  waqfProgram: one(waqfPrograms, {
    fields: [waqfOrders.waqfProgramId],
    references: [waqfPrograms.id],
  }),
}));

export const transactionsRelations = relations(
  transactions,
  ({ one, many }) => ({
    infaqOrders: many(infaqOrders),
    waqfOrders: many(waqfOrders),
    user: one(users, {
      fields: [transactions.wakifId],
      references: [users.id],
    }),
    zakatOrders: many(zakatOrders),
    qurbanOrders: many(qurbanOrders),
    certificates: many(certificates),
  })
);

export const infaqOrdersRelations = relations(infaqOrders, ({ one }) => ({
  user: one(users, {
    fields: [infaqOrders.userId],
    references: [users.id],
  }),
  transaction: one(transactions, {
    fields: [infaqOrders.transactionId],
    references: [transactions.id],
  }),
}));

export const zakatCalculationsRelations = relations(
  zakatCalculations,
  ({ one }) => ({
    user: one(users, {
      fields: [zakatCalculations.wakifId],
      references: [users.id],
    }),
    zakatOrder: one(zakatOrders, {
      fields: [zakatCalculations.zakatOrderId],
      references: [zakatOrders.id],
    }),
  })
);

export const zakatOrdersRelations = relations(zakatOrders, ({ one, many }) => ({
  zakatCalculations: many(zakatCalculations),
  user_enteredByAmilId: one(users, {
    fields: [zakatOrders.enteredByAmilId],
    references: [users.id],
    relationName: 'zakatOrders_enteredByAmilId_users_id',
  }),
  user_muzakkiId: one(users, {
    fields: [zakatOrders.muzakkiId],
    references: [users.id],
    relationName: 'zakatOrders_muzakkiId_users_id',
  }),
  transaction: one(transactions, {
    fields: [zakatOrders.transactionId],
    references: [transactions.id],
  }),
}));

export const programProgressReportsRelations = relations(
  programProgressReports,
  ({ one }) => ({
    user: one(users, {
      fields: [programProgressReports.createdById],
      references: [users.id],
    }),
    waqfProgram: one(waqfPrograms, {
      fields: [programProgressReports.waqfProgramId],
      references: [waqfPrograms.id],
    }),
  })
);

export const qurbanOrdersRelations = relations(
  qurbanOrders,
  ({ one, many }) => ({
    petugasLapanganProfile: one(petugasLapanganProfiles, {
      fields: [qurbanOrders.enteredByPetugasId],
      references: [petugasLapanganProfiles.id],
    }),
    transaction: one(transactions, {
      fields: [qurbanOrders.transactionId],
      references: [transactions.id],
    }),
    user: one(users, {
      fields: [qurbanOrders.wakifId],
      references: [users.id],
    }),
    qurbanDistributionReports: many(qurbanDistributionReports),
    qurbanDistributionAllocations: many(qurbanDistributionAllocations),
    setoranQurbanOrderLinks: many(setoranQurbanOrderLinks),
    qurbanAnimalSlots: many(qurbanAnimalSlots),
  })
);

export const petugasLapanganProfilesRelations = relations(
  petugasLapanganProfiles,
  ({ one, many }) => ({
    qurbanOrders: many(qurbanOrders),
    user: one(users, {
      fields: [petugasLapanganProfiles.userId],
      references: [users.id],
    }),
    setoranPetugasLapangans: many(setoranPetugasLapangan),
  })
);

export const qurbanDistributionReportsRelations = relations(
  qurbanDistributionReports,
  ({ one }) => ({
    qurbanOrder: one(qurbanOrders, {
      fields: [qurbanDistributionReports.qurbanOrderId],
      references: [qurbanOrders.id],
    }),
  })
);

export const setoranPetugasLapanganRelations = relations(
  setoranPetugasLapangan,
  ({ one, many }) => ({
    petugasLapanganProfile: one(petugasLapanganProfiles, {
      fields: [setoranPetugasLapangan.petugasId],
      references: [petugasLapanganProfiles.id],
    }),
    user: one(users, {
      fields: [setoranPetugasLapangan.verifiedByAdminId],
      references: [users.id],
    }),
    setoranQurbanOrderLinks: many(setoranQurbanOrderLinks),
  })
);

export const zakatDistributionsRelations = relations(
  zakatDistributions,
  ({ one }) => ({
    user: one(users, {
      fields: [zakatDistributions.distributedByAmilId],
      references: [users.id],
    }),
    mustahiqProfile: one(mustahiqProfiles, {
      fields: [zakatDistributions.mustahiqId],
      references: [mustahiqProfiles.id],
    }),
  })
);

export const mustahiqProfilesRelations = relations(
  mustahiqProfiles,
  ({ many }) => ({
    zakatDistributions: many(zakatDistributions),
  })
);

export const qurbanDistributionAllocationsRelations = relations(
  qurbanDistributionAllocations,
  ({ one }) => ({
    hewanBatch: one(hewanBatches, {
      fields: [qurbanDistributionAllocations.hewanBatchId],
      references: [hewanBatches.id],
    }),
    permohonanPenyaluranInstitusional: one(permohonanPenyaluranInstitusional, {
      fields: [qurbanDistributionAllocations.permohonanId],
      references: [permohonanPenyaluranInstitusional.id],
    }),
    qurbanOrder: one(qurbanOrders, {
      fields: [qurbanDistributionAllocations.qurbanOrderId],
      references: [qurbanOrders.id],
    }),
  })
);

export const hewanBatchesRelations = relations(hewanBatches, ({ many }) => ({
  qurbanDistributionAllocations: many(qurbanDistributionAllocations),
  qurbanAnimalSlots: many(qurbanAnimalSlots),
}));

export const permohonanPenyaluranInstitusionalRelations = relations(
  permohonanPenyaluranInstitusional,
  ({ one, many }) => ({
    qurbanDistributionAllocations: many(qurbanDistributionAllocations),
    user: one(users, {
      fields: [permohonanPenyaluranInstitusional.approvedByAdminId],
      references: [users.id],
    }),
  })
);

export const certificatesRelations = relations(certificates, ({ one }) => ({
  transaction: one(transactions, {
    fields: [certificates.transactionId],
    references: [transactions.id],
  }),
}));

export const gamificationPointLedgersRelations = relations(
  gamificationPointLedgers,
  ({ one }) => ({
    user: one(users, {
      fields: [gamificationPointLedgers.userId],
      references: [users.id],
    }),
  })
);

export const setoranQurbanOrderLinksRelations = relations(
  setoranQurbanOrderLinks,
  ({ one }) => ({
    qurbanOrder: one(qurbanOrders, {
      fields: [setoranQurbanOrderLinks.qurbanOrderId],
      references: [qurbanOrders.id],
    }),
    setoranPetugasLapangan: one(setoranPetugasLapangan, {
      fields: [setoranQurbanOrderLinks.setoranId],
      references: [setoranPetugasLapangan.id],
    }),
  })
);

export const mauqufAlaihDistributionsRelations = relations(
  mauqufAlaihDistributions,
  ({ one }) => ({
    waqfProgram: one(waqfPrograms, {
      fields: [mauqufAlaihDistributions.waqfProgramId],
      references: [waqfPrograms.id],
    }),
    fundWithdrawalRequest: one(fundWithdrawalRequests, {
      fields: [mauqufAlaihDistributions.withdrawalRequestId],
      references: [fundWithdrawalRequests.id],
    }),
  })
);

export const qurbanAnimalSlotsRelations = relations(
  qurbanAnimalSlots,
  ({ one }) => ({
    hewanBatch: one(hewanBatches, {
      fields: [qurbanAnimalSlots.hewanBatchId],
      references: [hewanBatches.id],
    }),
    qurbanOrder: one(qurbanOrders, {
      fields: [qurbanAnimalSlots.qurbanOrderId],
      references: [qurbanOrders.id],
    }),
  })
);

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  educationContent: one(educationContents, {
    fields: [quizzes.educationContentId],
    references: [educationContents.id],
  }),
  quizQuestions: many(quizQuestions),
  quizAttempts: many(quizAttempts),
}));

export const educationContentsRelations = relations(
  educationContents,
  ({ many }) => ({
    quizzes: many(quizzes),
  })
);

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizQuestions.quizId],
    references: [quizzes.id],
  }),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizAttempts.quizId],
    references: [quizzes.id],
  }),
  user: one(users, {
    fields: [quizAttempts.userId],
    references: [users.id],
  }),
}));

export const chatbotConversationsRelations = relations(
  chatbotConversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [chatbotConversations.userId],
      references: [users.id],
    }),
    chatbotMessages: many(chatbotMessages),
  })
);

export const chatbotMessagesRelations = relations(
  chatbotMessages,
  ({ one }) => ({
    chatbotConversation: one(chatbotConversations, {
      fields: [chatbotMessages.conversationId],
      references: [chatbotConversations.id],
    }),
  })
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
