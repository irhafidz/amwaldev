import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/wakaf/$programId')({
  component: Outlet,
});
