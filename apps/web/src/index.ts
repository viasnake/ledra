import type { LedraBundle } from '@ledra/types';
import { WEB_POLICY } from '@ledra/schemas';

export const appName = '@ledra/web';

export const renderBundleView = (bundle: LedraBundle): string => {
  const header = `<h1>Ledra Bundle Viewer</h1><p>Mode: ${WEB_POLICY.mode} / readOnly=${String(!WEB_POLICY.writable)}</p>`;
  const list = bundle.entities
    .map((entity) => `<li><strong>${entity.type}/${entity.id}</strong> - ${entity.title}</li>`)
    .join('');

  return `${header}<ul>${list}</ul>`;
};
