import { createFileRoute } from '@tanstack/react-router';
import { NazhirProgramView } from '@/components/nadzir/nazhir-program-view';

export const Route = createFileRoute('/nadzir/')({
  component: NazhirProgramView,
});
