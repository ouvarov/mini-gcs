import type { GeodeticPoint } from '@shared/ipc'

import type { LongitudeLatitude } from '../prediction/localFrame'

type TrackBuffer = {
  push: (point: GeodeticPoint) => void
  toLineStringCoordinates: () => LongitudeLatitude[]
  sampleCount: () => number
  clear: () => void
}

const VALUES_PER_SAMPLE = 2

/** Fixed-size ring on one Float64Array: an hour at 10 Hz is 36k samples and never reallocates. */
const createTrackBuffer = (capacitySamples: number): TrackBuffer => {
  const packedLongitudeLatitudeValues = new Float64Array(capacitySamples * VALUES_PER_SAMPLE)
  let writeIndex = 0
  let storedSampleCount = 0

  const push = (point: GeodeticPoint): void => {
    const offset = writeIndex * VALUES_PER_SAMPLE
    packedLongitudeLatitudeValues[offset] = point.longitudeDegrees
    packedLongitudeLatitudeValues[offset + 1] = point.latitudeDegrees
    writeIndex = (writeIndex + 1) % capacitySamples
    storedSampleCount = Math.min(storedSampleCount + 1, capacitySamples)
  }

  const toLineStringCoordinates = (): LongitudeLatitude[] => {
    const coordinates: LongitudeLatitude[] = []
    const oldestIndex = storedSampleCount < capacitySamples ? 0 : writeIndex
    for (let orderedIndex = 0; orderedIndex < storedSampleCount; orderedIndex++) {
      const offset = ((oldestIndex + orderedIndex) % capacitySamples) * VALUES_PER_SAMPLE
      coordinates.push([
        packedLongitudeLatitudeValues[offset],
        packedLongitudeLatitudeValues[offset + 1],
      ])
    }
    return coordinates
  }

  const clear = (): void => {
    writeIndex = 0
    storedSampleCount = 0
  }

  return { push, toLineStringCoordinates, sampleCount: () => storedSampleCount, clear }
}

export { createTrackBuffer }
export type { TrackBuffer }
