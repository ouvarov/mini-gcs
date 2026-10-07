import { describe, expect, it } from 'vitest'

import {
  EAST,
  EAST_VELOCITY,
  NORTH,
  type PositionVelocityMeasurement,
  initialFilterState,
  positionUncertaintyEllipse,
  predictState,
  updateState,
} from '../src/renderer/src/prediction/kalmanConstantVelocity'
import { diagonalMatrix } from '../src/renderer/src/prediction/matrix4'
import { predictTrajectory } from '../src/renderer/src/prediction/trajectoryPrediction'
import { DEMO_HOME_POINT } from '../src/shared/defaults'

const SAMPLE_INTERVAL_SECONDS = 0.25
const SAMPLE_COUNT = 80
const SPEED_METERS_PER_SECOND = 15
const POSITION_NOISE_METERS = 3
const VELOCITY_NOISE_METERS_PER_SECOND = 0.3
const NOISE_PHASE_STEP = 1.7
const LAST_SAMPLE_EAST_METERS =
  SPEED_METERS_PER_SECOND * (SAMPLE_COUNT - 1) * SAMPLE_INTERVAL_SECONDS
const PREDICTION_HORIZON_SECONDS = 10
const POSITION_TOLERANCE_METERS = 2
const VELOCITY_TOLERANCE_METERS_PER_SECOND = 0.5
const PREDICTION_TOLERANCE_METERS = 6
const TURN_START_INDEX = 60
const TURN_LAG_MIN_METERS = 0.1
const TURN_LAG_MAX_METERS = 15

/** Deterministic pseudo-noise so the test is repeatable. */
const noise = (sampleIndex: number, amplitude: number): number =>
  amplitude * Math.sin(sampleIndex * NOISE_PHASE_STEP)

const straightLineMeasurement = (
  sampleIndex: number,
  positionNoiseMeters: number
): PositionVelocityMeasurement => ({
  eastMeters:
    SPEED_METERS_PER_SECOND * sampleIndex * SAMPLE_INTERVAL_SECONDS +
    noise(sampleIndex, positionNoiseMeters),
  northMeters: noise(sampleIndex + 3, positionNoiseMeters),
  eastVelocityMetersPerSecond:
    SPEED_METERS_PER_SECOND + noise(sampleIndex + 7, VELOCITY_NOISE_METERS_PER_SECOND),
  northVelocityMetersPerSecond: noise(sampleIndex + 11, VELOCITY_NOISE_METERS_PER_SECOND),
})

const turningMeasurement = (sampleIndex: number): PositionVelocityMeasurement =>
  sampleIndex < TURN_START_INDEX
    ? straightLineMeasurement(sampleIndex, 0)
    : {
        eastMeters: SPEED_METERS_PER_SECOND * TURN_START_INDEX * SAMPLE_INTERVAL_SECONDS,
        northMeters:
          SPEED_METERS_PER_SECOND * (sampleIndex - TURN_START_INDEX) * SAMPLE_INTERVAL_SECONDS,
        eastVelocityMetersPerSecond: 0,
        northVelocityMetersPerSecond: SPEED_METERS_PER_SECOND,
      }

const runFilter = (measurementAt: (sampleIndex: number) => PositionVelocityMeasurement) => {
  let filterState = initialFilterState(measurementAt(0))
  for (let sampleIndex = 1; sampleIndex < SAMPLE_COUNT; sampleIndex++) {
    filterState = updateState(
      predictState(filterState, SAMPLE_INTERVAL_SECONDS),
      measurementAt(sampleIndex)
    )
  }
  return filterState
}

describe('constant-velocity Kalman filter', () => {
  it('tracks a straight line through noisy measurements', () => {
    const filterState = runFilter((sampleIndex) =>
      straightLineMeasurement(sampleIndex, POSITION_NOISE_METERS)
    )
    expect(Math.abs(filterState.stateVector[EAST] - LAST_SAMPLE_EAST_METERS)).toBeLessThan(
      POSITION_TOLERANCE_METERS
    )
    expect(Math.abs(filterState.stateVector[NORTH])).toBeLessThan(POSITION_TOLERANCE_METERS)
    expect(Math.abs(filterState.stateVector[EAST_VELOCITY] - SPEED_METERS_PER_SECOND)).toBeLessThan(
      VELOCITY_TOLERANCE_METERS_PER_SECOND
    )
  })

  it('predicts the straight-line position 10 s ahead within a few metres', () => {
    const filterState = runFilter((sampleIndex) =>
      straightLineMeasurement(sampleIndex, POSITION_NOISE_METERS)
    )
    const [tenSecondsAhead] = predictTrajectory(filterState, DEMO_HOME_POINT, undefined, [
      PREDICTION_HORIZON_SECONDS,
    ])
    const expectedEastMeters =
      LAST_SAMPLE_EAST_METERS + SPEED_METERS_PER_SECOND * PREDICTION_HORIZON_SECONDS
    expect(Math.abs(tenSecondsAhead.localPosition.eastMeters - expectedEastMeters)).toBeLessThan(
      PREDICTION_TOLERANCE_METERS
    )
  })

  it('grows the uncertainty ellipse with the horizon', () => {
    const filterState = runFilter((sampleIndex) =>
      straightLineMeasurement(sampleIndex, POSITION_NOISE_METERS)
    )
    const [fiveSeconds, tenSeconds, fifteenSeconds] = predictTrajectory(
      filterState,
      DEMO_HOME_POINT,
      undefined,
      [5, 10, 15]
    )
    expect(fiveSeconds.ellipse.semiMajorMeters).toBeLessThan(tenSeconds.ellipse.semiMajorMeters)
    expect(tenSeconds.ellipse.semiMajorMeters).toBeLessThan(fifteenSeconds.ellipse.semiMajorMeters)
  })

  it('lags behind a sharp turn, which is the constant-velocity model being honest', () => {
    const filterState = runFilter(turningMeasurement)
    const trueNorthMeters =
      SPEED_METERS_PER_SECOND * (SAMPLE_COUNT - 1 - TURN_START_INDEX) * SAMPLE_INTERVAL_SECONDS
    const northErrorMeters = Math.abs(filterState.stateVector[NORTH] - trueNorthMeters)
    expect(northErrorMeters).toBeGreaterThan(TURN_LAG_MIN_METERS)
    expect(northErrorMeters).toBeLessThan(TURN_LAG_MAX_METERS)
  })

  it('reports an axis-aligned ellipse for a diagonal covariance', () => {
    const ellipse = positionUncertaintyEllipse(diagonalMatrix([16, 4, 0, 0]))
    expect(ellipse.semiMajorMeters).toBeCloseTo(4)
    expect(ellipse.semiMinorMeters).toBeCloseTo(2)
  })
})
