/**
 * The inverse of shared's `decodePolyline` — test-only, so a fixture can set
 * a lane's `routeGeometry` to something real rather than a hand-typed string
 * with no relationship to the points it's supposed to encode. Not exported
 * from `packages/shared` itself: nothing outside tests needs to encode, only
 * OSRM does that for real (`RoutingService.routeGeometry`).
 */
export function encodePolyline(points: Array<{ latitude: number; longitude: number }>, precision = 6): string {
  const factor = 10 ** precision;
  const encodeValue = (value: number): string => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let out = '';
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return out + String.fromCharCode(v + 63);
  };
  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const point of points) {
    const lat = Math.round(point.latitude * factor);
    const lng = Math.round(point.longitude * factor);
    output += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}
