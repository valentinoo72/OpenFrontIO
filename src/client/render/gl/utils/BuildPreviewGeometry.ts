import { UnitType } from "@openfront/engine-api/game/GameTypes";
import type { RenderSettings } from "../RenderSettings";

export const CROSSHAIR_HALF_SIZE_PX = 20;

// Bottom edges in local quad coordinates, as defined by shapeSDF.
const frameRadius = 0.45;
const frameBottom: Partial<Record<string, number>> = {
  [UnitType.City]: frameRadius,
  [UnitType.Port]: frameRadius * Math.cos(Math.PI / 5),
  [UnitType.Factory]: frameRadius * Math.cos(Math.PI / 6),
  [UnitType.DefensePost]: frameRadius * Math.cos(Math.PI / 8),
  [UnitType.SAMLauncher]: frameRadius / Math.SQRT2,
  [UnitType.MissileSilo]: frameRadius / 2,
  [UnitType.Throne]: 0.01 + frameRadius * 0.92,
};

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

export function placementIconBottomPx(
  settings: RenderSettings["structure"],
  type: string,
  zoom: number,
): number | undefined {
  if (type === UnitType.Warship || type === UnitType.MIRV) {
    return CROSSHAIR_HALF_SIZE_PX;
  }
  const bottom = frameBottom[type];
  if (bottom === undefined) return undefined;
  return (
    bottom *
    structureIconSizePx(settings, zoom) *
    (settings.shapes[type]?.scale ?? 1)
  );
}
