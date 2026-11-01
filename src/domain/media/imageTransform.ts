export function zoomAt(zoom: number, x: number, y: number, next: number, anchorX = 0, anchorY = 0) {
  const scale = Math.max(1, Math.min(8, next));
  const ratio = scale / zoom;
  return { zoom: scale, x: anchorX - (anchorX - x) * ratio, y: anchorY - (anchorY - y) * ratio };
}
