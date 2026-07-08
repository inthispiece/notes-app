export interface Point {
  x: number;
  y: number;
}

export function isPointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const crosses = yi > point.y !== yj > point.y;
    if (crosses) {
      const xAtY = ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (point.x < xAtY) {
        inside = !inside;
      }
    }
  }
  return inside;
}
