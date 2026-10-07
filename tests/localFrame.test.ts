import { describe, expect, it } from 'vitest'

import {
  circleRingCoordinates,
  toGeodetic,
  toLocal,
} from '../src/renderer/src/prediction/localFrame'
import { DEMO_HOME_POINT } from '../src/shared/defaults'
import { METERS_PER_DEGREE_LATITUDE } from '../src/shared/units'

describe('local frame', () => {
  it('round-trips a point a few hundred metres away', () => {
    const localOffset = { eastMeters: 300, northMeters: -200 }
    const roundTripped = toLocal(DEMO_HOME_POINT, toGeodetic(DEMO_HOME_POINT, localOffset))
    expect(roundTripped.eastMeters).toBeCloseTo(localOffset.eastMeters, 6)
    expect(roundTripped.northMeters).toBeCloseTo(localOffset.northMeters, 6)
  })

  it('places one degree of latitude at about 111 km', () => {
    const oneDegreeNorth = {
      latitudeDegrees: DEMO_HOME_POINT.latitudeDegrees + 1,
      longitudeDegrees: DEMO_HOME_POINT.longitudeDegrees,
    }
    expect(toLocal(DEMO_HOME_POINT, oneDegreeNorth).northMeters).toBeCloseTo(
      METERS_PER_DEGREE_LATITUDE,
      0
    )
  })

  it('shrinks longitude degrees with latitude', () => {
    const oneDegreeEast = {
      latitudeDegrees: DEMO_HOME_POINT.latitudeDegrees,
      longitudeDegrees: DEMO_HOME_POINT.longitudeDegrees + 1,
    }
    const eastMeters = toLocal(DEMO_HOME_POINT, oneDegreeEast).eastMeters
    expect(eastMeters).toBeLessThan(METERS_PER_DEGREE_LATITUDE)
    expect(eastMeters).toBeGreaterThan(70_000)
  })

  it('draws a closed circle ring of the requested radius', () => {
    const radiusMeters = 250
    const ring = circleRingCoordinates(DEMO_HOME_POINT, radiusMeters)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    for (const [longitudeDegrees, latitudeDegrees] of ring) {
      const local = toLocal(DEMO_HOME_POINT, { latitudeDegrees, longitudeDegrees })
      expect(Math.hypot(local.eastMeters, local.northMeters)).toBeCloseTo(radiusMeters, 6)
    }
  })
})
