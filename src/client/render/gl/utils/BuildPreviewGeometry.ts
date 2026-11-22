import type { RenderSettings } from "../RenderSettings";

export function structureIconSizePx(
  settings: RenderSettings["structure"],
  zoom: number,
): number {
  if (zoom <= settings.dotsZoomThreshold) {
    return settings.iconSize * settings.dotScale;
  }
  if (zoom >= settings.iconGrowZoom) {
    return settings.iconSize * (zoom / settings.iconGrowZoom);
  }
  return (
    settings.iconSize * Math.min(1, zoom / settings.iconScaleFactorZoomedOut)
  );
}
