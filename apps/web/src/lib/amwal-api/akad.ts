import type {
  ActivateAkadInput,
  AkadModule,
  AkadTemplateSummary,
  PublishAkadInput,
} from '@amwal/core/contracts/akad';
import { orpc } from '../orpc/client';

export async function getActiveAkad(
  module: AkadModule
): Promise<AkadTemplateSummary | null> {
  return await orpc.akad.active({ module });
}

export async function listAkadVersions(
  module: AkadModule
): Promise<AkadTemplateSummary[]> {
  return await orpc.admin.akad.list({ module });
}

export async function publishAkadVersion(
  input: PublishAkadInput
): Promise<AkadTemplateSummary> {
  return await orpc.admin.akad.publishVersion(input);
}

export async function activateAkadVersion(
  input: ActivateAkadInput
): Promise<AkadTemplateSummary> {
  return await orpc.admin.akad.activate(input);
}
