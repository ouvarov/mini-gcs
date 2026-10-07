import { describe, expect, it } from 'vitest'

import { createTrackBuffer } from '../src/renderer/src/telemetry/trackBuffer'

const pointAt = (sampleIndex: number) => ({
  latitudeDegrees: 50 + sampleIndex,
  longitudeDegrees: 30 + sampleIndex,
})

describe('createTrackBuffer', () => {
  it('returns coordinates oldest first before wrapping', () => {
    const trackBuffer = createTrackBuffer(4)
    for (let sampleIndex = 0; sampleIndex < 3; sampleIndex++) trackBuffer.push(pointAt(sampleIndex))
    expect(trackBuffer.toLineStringCoordinates()).toEqual([
      [30, 50],
      [31, 51],
      [32, 52],
    ])
  })

  it('drops the oldest samples once full and keeps order', () => {
    const trackBuffer = createTrackBuffer(3)
    for (let sampleIndex = 0; sampleIndex < 5; sampleIndex++) trackBuffer.push(pointAt(sampleIndex))
    expect(trackBuffer.sampleCount()).toBe(3)
    expect(trackBuffer.toLineStringCoordinates()).toEqual([
      [32, 52],
      [33, 53],
      [34, 54],
    ])
  })

  it('clears without reallocating', () => {
    const trackBuffer = createTrackBuffer(2)
    trackBuffer.push(pointAt(0))
    trackBuffer.clear()
    expect(trackBuffer.sampleCount()).toBe(0)
    expect(trackBuffer.toLineStringCoordinates()).toEqual([])
  })
})
