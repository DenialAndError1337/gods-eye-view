import * as Cesium from 'cesium';
import { createMonitoringPanel } from '../ui/monitoringPanel.js';
import { layerSnapshot } from '../data/layerSnapshot.js';

/** Standalone-only composition; no extra feed ownership or Cesium click handlers. */
export function mountMonitoring({
  viewer,
  dataManager,
  catalog,
  regional,
  navigation,
  document = globalThis.document,
}) {
  const anchor = document.getElementById('top-center-actions');
  const earthquakes = catalog.get('earthquakes');
  if (
    !anchor ||
    !earthquakes ||
    new URLSearchParams(globalThis.location?.search).get('embed') === '1'
  )
    return null;
  const nativeId = (entity) => {
    const id = entity?.id;
    return typeof id === 'string' && id.startsWith('earthquake:')
      ? id.slice(11)
      : null;
  };
  return createMonitoringPanel({
    document,
    anchor,
    newsService: regional,
    readEarthquakes() {
      const row = dataManager.getAll().find((r) => r.id === 'earthquakes');
      const snapshot = layerSnapshot(row);
      if (
        row?.lifecycleState === 'enabling' ||
        row?.lifecycleState === 'disabling'
      )
        snapshot.feedState = 'loading';
      return {
        ...snapshot,
        rows: earthquakes.getMonitoringRecords(),
      };
    },
    subscribeEarthquakes(fn) {
      return dataManager.subscribe((change) => {
        if (change.layerId === 'earthquakes') fn();
      });
    },
    subscribeMapSelection(fn) {
      return viewer.selectedEntityChanged.addEventListener((entity) =>
        fn(nativeId(entity)),
      );
    },
    selectMapEvent(id) {
      earthquakes.setMonitoringSelection(id);
      if (id) {
        const entity = earthquakes.getMonitoringEntity(id);
        if (entity && viewer.selectedEntity !== entity)
          viewer.selectedEntity = entity;
      } else if (nativeId(viewer.selectedEntity))
        viewer.selectedEntity = undefined;
    },
    applyMapFilter: (predicate) => earthquakes.setMonitoringFilter(predicate),
    enableEarthquakes: () =>
      dataManager.setEnabled('earthquakes', true, { origin: 'user' }),
    focusEvent(event) {
      if (!event.coordinates) return;
      navigation.runImmediateNavigation('monitoring event', () => {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            event.coordinates.lon,
            event.coordinates.lat,
            350000,
          ),
          duration: 1.2,
        });
      });
    },
    readMapArea() {
      const scene = viewer.scene;
      const position = viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(
          scene.canvas.clientWidth / 2,
          scene.canvas.clientHeight / 2,
        ),
        scene.globe.ellipsoid,
      );
      if (!position) return null;
      const point = Cesium.Cartographic.fromCartesian(position);
      const rect = viewer.camera.computeViewRectangle(scene.globe.ellipsoid);
      return {
        point: {
          lat: Cesium.Math.toDegrees(point.latitude),
          lon: Cesium.Math.toDegrees(point.longitude),
        },
        bounds: rect
          ? {
              west: Cesium.Math.toDegrees(rect.west),
              south: Cesium.Math.toDegrees(rect.south),
              east: Cesium.Math.toDegrees(rect.east),
              north: Cesium.Math.toDegrees(rect.north),
            }
          : null,
      };
    },
  });
}
