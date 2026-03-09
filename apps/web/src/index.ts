import type { LedraBundle } from '@ledra/types';
import { VIEWER_POLICY } from '@ledra/schemas';

export const appName = '@ledra/web';

export const renderBundleView = (bundle: LedraBundle): string => {
  const header = `<h1>Ledra Registry Viewer</h1><p>Mode: ${VIEWER_POLICY.mode} / readOnly=${String(!VIEWER_POLICY.writable)}</p>`;
  const entityList = bundle.graph.entities
    .map((entity) => `<li><strong>${entity.type}/${entity.id}</strong> - ${entity.title}</li>`)
    .join('');
  const viewList = bundle.graph.views
    .map((view) => `<li><strong>${view.id}</strong> - ${view.title}</li>`)
    .join('');

  return `${header}<h2>Views</h2><ul>${viewList}</ul><h2>Entities</h2><ul>${entityList}</ul>`;
};
