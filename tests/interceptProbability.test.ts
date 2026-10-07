import { describe, expect, it } from 'vitest'

import {
  DEFAULT_INTERCEPT_SETTINGS,
  EMPTY_INTERCEPT_ESTIMATE,
  type InterceptScenario,
  estimateInterceptProbability,
  interceptReachMeters,
} from '../src/renderer/src/intercept/interceptProbability'

const LCG_MULTIPLIER = 1_103_515_245
const LCG_INCREMENT = 12_345
const LCG_MODULUS = 2_147_483_648

/** Linear congruential generator: deterministic uniforms so the probabilities are reproducible. */
const seededUniform = (seed: number) => {
  let generatorState = seed
  return () => {
    generatorState = (generatorState * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS
    return generatorState / LCG_MODULUS
  }
}

const baseScenario: InterceptScenario = {
  interceptorLaunchPoint: { eastMeters: 0, northMeters: 0 },
  settings: { interceptorSpeedMetersPerSecond: 50, launchDelaySeconds: 0, sampleCount: 2000 },
  predictedTargetPoints: [
    { horizonSeconds: 5, eastMeters: 100, northMeters: 0, positionCovariance: [25, 0, 0, 25] },
    { horizonSeconds: 10, eastMeters: 200, northMeters: 0, positionCovariance: [100, 0, 0, 100] },
  ],
}

const withSettings = (settings: Partial<InterceptScenario['settings']>): InterceptScenario => ({
  ...baseScenario,
  settings: { ...baseScenario.settings, ...settings },
})

describe('estimateInterceptProbability', () => {
  it('is near certain when the interceptor easily outruns the target', () => {
    const estimate = estimateInterceptProbability(baseScenario, seededUniform(1))
    expect(estimate.probability).toBeGreaterThan(0.99)
    expect(estimate.typicalInterceptHorizonSeconds).toBe(5)
  })

  it('is zero when the target is far beyond reach', () => {
    const estimate = estimateInterceptProbability(
      withSettings({ interceptorSpeedMetersPerSecond: 5 }),
      seededUniform(1)
    )
    expect(estimate.probability).toBe(0)
    expect(estimate.typicalInterceptHorizonSeconds).toBeNull()
  })

  it('lands between the extremes when the reach circle cuts through the uncertainty cloud', () => {
    // Reach at +5 s is 100 m, exactly the mean distance: roughly half the samples fall inside.
    const borderline: InterceptScenario = {
      ...withSettings({ interceptorSpeedMetersPerSecond: 20 }),
      predictedTargetPoints: [baseScenario.predictedTargetPoints[0]],
    }
    const estimate = estimateInterceptProbability(borderline, seededUniform(7))
    expect(estimate.probability).toBeGreaterThan(0.3)
    expect(estimate.probability).toBeLessThan(0.7)
  })

  it('respects the launch delay', () => {
    const estimate = estimateInterceptProbability(
      withSettings({ interceptorSpeedMetersPerSecond: 21, launchDelaySeconds: 4.9 }),
      seededUniform(3)
    )
    expect(estimate.probability).toBeLessThan(0.1)
  })

  it('returns the empty estimate without predicted points', () => {
    expect(estimateInterceptProbability({ ...baseScenario, predictedTargetPoints: [] })).toEqual(
      EMPTY_INTERCEPT_ESTIMATE
    )
  })
})

describe('interceptReachMeters', () => {
  it('is speed times the time left after the launch delay', () => {
    expect(interceptReachMeters(DEFAULT_INTERCEPT_SETTINGS, 15)).toBe(40 * 13)
  })

  it('never goes negative when the delay exceeds the horizon', () => {
    expect(
      interceptReachMeters({ ...DEFAULT_INTERCEPT_SETTINGS, launchDelaySeconds: 20 }, 15)
    ).toBe(0)
  })
})
