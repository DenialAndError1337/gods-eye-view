import { createApplicationData } from '../app/data.js';
import { getStandaloneCatalog } from './catalog.js';
import { mountMonitoring } from './monitoring.js';
export function createStandaloneData(options) {
  const data = createApplicationData({
    catalog: options?.catalog ?? getStandaloneCatalog(),
    ...options,
  });
  const monitoring = mountMonitoring({
    viewer: options.scene.viewer,
    dataManager: data.dataManager,
    catalog: data.catalog,
    regional: options.scene.operations.requests.regional,
    navigation: options.controls.styleManager,
  });
  options.defer(() => monitoring?.destroy());
  return data;
}
