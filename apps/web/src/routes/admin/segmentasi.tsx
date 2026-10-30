import { createFileRoute } from '@tanstack/react-router';
import { DonorSegmentationView } from '@/components/admin/donor-segmentation-view';

export const Route = createFileRoute('/admin/segmentasi')({
  component: DonorSegmentationView,
});
