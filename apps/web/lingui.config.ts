import { defineConfig } from '@lingui/cli';

export default defineConfig({
  locales: ['en', 'id'],
  sourceLocale: 'en',
  fallbackLocales: {
    default: 'en',
  },
  catalogs: [
    // Global translations (header, common UI, shared components)
    {
      path: '<rootDir>/src/locales/global-{locale}',
      include: ['src/components/**', 'src/lib/**'],
      exclude: [
        '**/node_modules/**',
        'src/routes/**/-locales/**', // Exclude feature locales - they have their own catalogs
      ],
    },
    // Auth feature translations
    {
      path: '<rootDir>/src/routes/auth/-locales/auth-{locale}',
      include: ['src/routes/auth/**'],
      exclude: ['**/node_modules/**'],
    },
    // Todos feature translations
    {
      path: '<rootDir>/src/routes/todos/-locales/todos-{locale}',
      include: ['src/routes/todos/**'],
      exclude: ['**/node_modules/**'],
    },
  ],
  format: 'po',
  formatOptions: {
    lineNumbers: false,
  },
});
