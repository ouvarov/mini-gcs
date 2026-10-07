import type { PositionCovariance2x2 } from '../prediction/kalmanConstantVelocity'
import type { LocalPoint } from '../prediction/localFrame'

type InterceptSettings = {
  interceptorSpeedMetersPerSecond: number
  launchDelaySeconds: number
  sampleCount: number
}

type PredictedTargetPoint = LocalPoint & {
  horizonSeconds: number
  positionCovariance: PositionCovariance2x2
}

type InterceptScenario = {
  /** Where the interceptor starts, in the same local frame as the target prediction. */
  interceptorLaunchPoint: LocalPoint
  settings: InterceptSettings
  /** Target mean track and covariance at each predicted horizon. */
  predictedTargetPoints: PredictedTargetPoint[]
}

type InterceptEstimate = {
  probability: number
  sampleCount: number
  /** Horizon at which most successful intercepts happen; null when none succeed. */
  typicalInterceptHorizonSeconds: number | null
}

const DEFAULT_INTERCEPT_SETTINGS: InterceptSettings = {
  interceptorSpeedMetersPerSecond: 40,
  launchDelaySeconds: 2,
  sampleCount: 2000,
}

const INTERCEPT_SETTING_RANGES = {
  interceptorSpeedMetersPerSecond: { min: 10, max: 120, step: 5 },
  launchDelaySeconds: { min: 0, max: 10, step: 0.5 },
} as const

const EMPTY_INTERCEPT_ESTIMATE: InterceptEstimate = {
  probability: 0,
  sampleCount: 0,
  typicalInterceptHorizonSeconds: null,
}

/** How far the interceptor can get by the last horizon; the circle drawn around its launch point. */
const interceptReachMeters = (settings: InterceptSettings, lastHorizonSeconds: number): number =>
  settings.interceptorSpeedMetersPerSecond *
  Math.max(0, lastHorizonSeconds - settings.launchDelaySeconds)

/** Box-Muller: two independent standard normals from two uniforms. */
const standardNormalPair = (nextUniform: () => number): [number, number] => {
  const radius = Math.sqrt(-2 * Math.log(1 - nextUniform()))
  const angleRadians = 2 * Math.PI * nextUniform()
  return [radius * Math.cos(angleRadians), radius * Math.sin(angleRadians)]
}

/** Cholesky factor of a 2x2 covariance so correlated samples come out right. */
const sampleOffsetFromCovariance = (
  covariance: PositionCovariance2x2,
  standardNormals: [number, number]
): LocalPoint => {
  const [eastVariance, eastNorthCovariance, , northVariance] = covariance
  const lower00 = Math.sqrt(Math.max(eastVariance, 0))
  const lower10 = lower00 > 0 ? eastNorthCovariance / lower00 : 0
  const lower11 = Math.sqrt(Math.max(northVariance - lower10 * lower10, 0))
  return {
    eastMeters: lower00 * standardNormals[0],
    northMeters: lower10 * standardNormals[0] + lower11 * standardNormals[1],
  }
}

const horizonWithMostSuccesses = (successCountByHorizon: Map<number, number>): number | null => {
  let typicalHorizonSeconds: number | null = null
  let highestSuccessCount = 0
  for (const [horizonSeconds, successCountAtHorizon] of successCountByHorizon) {
    if (successCountAtHorizon > highestSuccessCount) {
      highestSuccessCount = successCountAtHorizon
      typicalHorizonSeconds = horizonSeconds
    }
  }
  return typicalHorizonSeconds
}

/**
 * Monte Carlo over the target's predicted uncertainty. A sample is intercepted if, at some horizon,
 * the interceptor can cover the distance to the sampled target position within (horizon - launchDelay).
 * Model assumes a straight-line interceptor with no aerodynamics and a target that does not evade.
 */
const estimateInterceptProbability = (
  scenario: InterceptScenario,
  nextUniform: () => number = Math.random
): InterceptEstimate => {
  const { interceptorLaunchPoint, settings, predictedTargetPoints } = scenario
  if (predictedTargetPoints.length === 0 || settings.sampleCount <= 0)
    return EMPTY_INTERCEPT_ESTIMATE

  const successCountByHorizon = new Map<number, number>()
  let successCount = 0

  for (let sampleIndex = 0; sampleIndex < settings.sampleCount; sampleIndex++) {
    const standardNormals = standardNormalPair(nextUniform)
    for (const targetPoint of predictedTargetPoints) {
      const reachTimeSeconds = targetPoint.horizonSeconds - settings.launchDelaySeconds
      if (reachTimeSeconds <= 0) continue
      const offset = sampleOffsetFromCovariance(targetPoint.positionCovariance, standardNormals)
      const distanceMeters = Math.hypot(
        targetPoint.eastMeters + offset.eastMeters - interceptorLaunchPoint.eastMeters,
        targetPoint.northMeters + offset.northMeters - interceptorLaunchPoint.northMeters
      )
      if (distanceMeters <= settings.interceptorSpeedMetersPerSecond * reachTimeSeconds) {
        successCount++
        successCountByHorizon.set(
          targetPoint.horizonSeconds,
          (successCountByHorizon.get(targetPoint.horizonSeconds) ?? 0) + 1
        )
        break
      }
    }
  }

  return {
    probability: successCount / settings.sampleCount,
    sampleCount: settings.sampleCount,
    typicalInterceptHorizonSeconds: horizonWithMostSuccesses(successCountByHorizon),
  }
}

export {
  DEFAULT_INTERCEPT_SETTINGS,
  INTERCEPT_SETTING_RANGES,
  EMPTY_INTERCEPT_ESTIMATE,
  interceptReachMeters,
  estimateInterceptProbability,
}
export type { InterceptSettings, InterceptScenario, InterceptEstimate, PredictedTargetPoint }
