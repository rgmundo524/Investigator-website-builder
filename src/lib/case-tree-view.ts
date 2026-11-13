export type TreeBounds = { left: number; top: number; right: number; bottom: number };
type TreeTransform = { x: number; y: number; scale: number };

function validBounds(bounds: TreeBounds | undefined): bounds is TreeBounds {
  return !!bounds && [bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)
    && bounds.left <= bounds.right && bounds.top <= bounds.bottom;
}

/** Combine visible circle and label rectangles without including invalid geometry. */
export function mergeTreeBounds(bounds: readonly TreeBounds[]): TreeBounds | undefined {
  let merged: TreeBounds | undefined;
  for (const rectangle of bounds) {
    if (!validBounds(rectangle)) continue;
    if (!merged) merged = { ...rectangle };
    else {
      merged.left = Math.min(merged.left, rectangle.left);
      merged.top = Math.min(merged.top, rectangle.top);
      merged.right = Math.max(merged.right, rectangle.right);
      merged.bottom = Math.max(merged.bottom, rectangle.bottom);
    }
  }
  return merged;
}

/** Center the full graph in a padded viewport, preserving its aspect ratio. */
export function fitTreeBounds(bounds: TreeBounds | undefined, width: number, height: number,
  padding = 24, maxScale = 1.5): TreeTransform | undefined {
  if (!validBounds(bounds) || ![width, height, padding, maxScale].every(Number.isFinite)
    || width <= 0 || height <= 0 || padding < 0 || maxScale <= 0) return undefined;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const boundsWidth = bounds.right - bounds.left;
  const boundsHeight = bounds.bottom - bounds.top;
  if (availableWidth <= 0 || availableHeight <= 0 || !Number.isFinite(boundsWidth) || !Number.isFinite(boundsHeight)) return undefined;
  const scale = Math.min(maxScale, availableWidth / Math.max(1, boundsWidth), availableHeight / Math.max(1, boundsHeight));
  const x = width / 2 - (bounds.left + boundsWidth / 2) * scale;
  const y = height / 2 - (bounds.top + boundsHeight / 2) * scale;
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) return undefined;
  return { x, y, scale };
}

/** Permit a fitted transform without the zoom container's pan clamps shifting it. */
export function treeFitPanLimit(transform: TreeTransform, width: number, height: number,
  contentWidth: number, contentHeight: number): number {
  const minimum = 0.4;
  const { x, y, scale } = transform;
  if (![x, y, scale, width, height, contentWidth, contentHeight].every(Number.isFinite)
    || scale < 1 || width <= 0 || height <= 0 || contentWidth <= 0 || contentHeight <= 0) return minimum;
  const required = Math.max(x / contentWidth, y / contentHeight,
    (width - x) / (contentWidth * scale) - 1,
    (height - y) / (contentHeight * scale) - 1);
  return required > minimum ? required + 0.000001 : minimum;
}
