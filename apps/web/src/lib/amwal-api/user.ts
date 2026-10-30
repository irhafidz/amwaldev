import { invalidateSessionUserCache } from '@/lib/auth/session-cache';
import { orpc } from '@/lib/orpc/client';

export type {
  UserDocumentItem,
  UserProfileResponse,
} from '@/lib/orpc/router/user';

export interface UpdateProfileInput {
  name: string;
  phone?: string | null;
  gender?: 'Laki-laki' | 'Perempuan' | string | null;
  birthDate?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
}

export interface UpdatePreferencesInput {
  notifikasi: boolean;
  newsletter: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const getUserProfile = async () => await orpc.user.getProfile();

export const updateUserProfile = async (payload: UpdateProfileInput) => {
  const result = await orpc.user.updateProfile(payload);
  invalidateSessionUserCache();
  return result;
};

export const updateUserPreferences = async (payload: UpdatePreferencesInput) =>
  await orpc.user.updatePreferences(payload);

export const changeUserPassword = async (payload: ChangePasswordInput) =>
  await orpc.user.changePassword(payload);

export const getUserAvatarUploadUrl = async (file: File) =>
  await orpc.user.getAvatarUploadUrl({
    fileName: file.name,
    contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
    size: file.size,
  });
