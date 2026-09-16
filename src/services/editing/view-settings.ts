/**
 * How far a score may be zoomed.
 *
 * Neither is a fact about a toolbar. The limits decide what a *layout* will be
 * asked to produce — below a quarter scale the staves stop being readable and
 * above four the system count makes scrolling useless. Two toolbars stating
 * them separately is how the web and the native app come to disagree about
 * what 400% means. The quantize grids are vocabulary, in music_types.
 */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/**
 * One press of zoom.
 *
 * A ratio rather than an increment, so a step out of 200% is the same visual
 * change as a step out of 50%.
 */
export const ZOOM_STEP = 1.25;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomIn(zoom: number): number {
  return clampZoom(zoom * ZOOM_STEP);
}

export function zoomOut(zoom: number): number {
  return clampZoom(zoom / ZOOM_STEP);
}
