import type { GeodeticPoint } from '@shared/ipc'
import { DEGREES_PER_RADIAN, METERS_PER_DEGREE_LATITUDE } from '@shared/units'

/** East/North metres relative to an origin. Flat-earth is fine for a few kilometres around a GCS. */
type LocalPoint = {
  eastMeters: number
  northMeters: number
}

/** GeoJSON order, which is the opposite of how people say it. */
type LongitudeLatitude = [longitudeDegrees: number, latitudeDegrees: number]

const metersPerDegreeLongitudeAt = (latitudeDegrees: number): number =>
  METERS_PER_DEGREE_LATITUDE * Math.cos(latitudeDegrees / DEGREES_PER_RADIAN)

const toLocal = (localFrameOrigin: GeodeticPoint, point: GeodeticPoint): LocalPoint => ({
  eastMeters:
    (point.longitudeDegrees - localFrameOrigin.longitudeDegrees) *
    metersPerDegreeLongitudeAt(localFrameOrigin.latitudeDegrees),
  northMeters:
    (point.latitudeDegrees - localFrameOrigin.latitudeDegrees) * METERS_PER_DEGREE_LATITUDE,
})

const toGeodetic = (localFrameOrigin: GeodeticPoint, point: LocalPoint): GeodeticPoint => ({
  latitudeDegrees:
    localFrameOrigin.latitudeDegrees + point.northMeters / METERS_PER_DEGREE_LATITUDE,
  longitudeDegrees:
    localFrameOrigin.longitudeDegrees +
    point.eastMeters / metersPerDegreeLongitudeAt(localFrameOrigin.latitudeDegrees),
})

const toLongitudeLatitude = (point: GeodeticPoint): LongitudeLatitude => [
  point.longitudeDegrees,
  point.latitudeDegrees,
]

const RING_SEGMENT_COUNT = 48

/** Closed ring of geodetic points around a centre; `offsetAt(angleRadians)` draws the shape in local metres. */
const ringCoordinates = (
  localFrameOrigin: GeodeticPoint,
  centre: LocalPoint,
  offsetAt: (angleRadians: number) => LocalPoint
): LongitudeLatitude[] => {
  const ring: LongitudeLatitude[] = []
  for (let segment = 0; segment <= RING_SEGMENT_COUNT; segment++) {
    const angleRadians = (segment / RING_SEGMENT_COUNT) * 2 * Math.PI
    const offset = offsetAt(angleRadians)
    ring.push(
      toLongitudeLatitude(
        toGeodetic(localFrameOrigin, {
          eastMeters: centre.eastMeters + offset.eastMeters,
          northMeters: centre.northMeters + offset.northMeters,
        })
      )
    )
  }
  return ring
}

const circleRingCoordinates = (centre: GeodeticPoint, radiusMeters: number): LongitudeLatitude[] =>
  ringCoordinates(centre, { eastMeters: 0, northMeters: 0 }, (angleRadians) => ({
    eastMeters: radiusMeters * Math.cos(angleRadians),
    northMeters: radiusMeters * Math.sin(angleRadians),
  }))

export { toLocal, toGeodetic, toLongitudeLatitude, ringCoordinates, circleRingCoordinates }
export type { LocalPoint, LongitudeLatitude }
