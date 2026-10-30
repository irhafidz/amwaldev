/**
 * Public helpdesk contact. Single source for every "hubungi kami" action.
 * ponytail: replace these placeholders with the institution's real channels
 * (or move them to env) before launch.
 */
export const SUPPORT_WHATSAPP_NUMBER = '6281234567890';
export const SUPPORT_WHATSAPP_DISPLAY = '0812-3456-7890';
export const SUPPORT_EMAIL = 'support@amwal.id';

export function supportWhatsAppUrl(message?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
