/**
 * 2D constant-velocity Kalman filter, state [east, north, eastVelocity, northVelocity] in metres and m/s.
 * Hand-rolled 4x4 algebra on Float64Array.
 */
import {
  type Matrix4x4,
  type Vector4,
  addMatrices,
  addVectors,
  diagonalMatrix,
  identityMatrix,
  index,
  invertMatrix,
  multiplyMatrices,
  multiplyMatrixVector,
  subtractMatrices,
  subtractVectors,
  transposeMatrix,
} from './matrix4'

/** Positions of each quantity inside the state vector and the covariance matrix. */
const EAST = 0
const NORTH = 1
const EAST_VELOCITY = 2
const NORTH_VELOCITY = 3

type FilterState = {
  stateVector: Vector4
  covariance: Matrix4x4
}

type PositionVelocityMeasurement = {
  eastMeters: number
  northMeters: number
  eastVelocityMetersPerSecond: number
  northVelocityMetersPerSecond: number
}

type FilterTuning = {
  /** Process noise: expected unmodelled acceleration, m/s^2. Higher trusts measurements more. */
  accelerationNoiseMetersPerSecondSquared: number
  positionMeasurementNoiseMeters: number
  velocityMeasurementNoiseMetersPerSecond: number
}

type UncertaintyEllipse = {
  /** 1 sigma. */
  semiMajorMeters: number
  semiMinorMeters: number
  orientationRadians: number
}

/** 2x2 position block of the covariance: [eastEast, eastNorth, northEast, northNorth] in metres^2. */
type PositionCovariance2x2 = [number, number, number, number]

const DEFAULT_TUNING: FilterTuning = {
  accelerationNoiseMetersPerSecondSquared: 1.5,
  positionMeasurementNoiseMeters: 2.5,
  velocityMeasurementNoiseMetersPerSecond: 0.5,
}

const measurementToVector = (measurement: PositionVelocityMeasurement): Vector4 =>
  Float64Array.from([
    measurement.eastMeters,
    measurement.northMeters,
    measurement.eastVelocityMetersPerSecond,
    measurement.northVelocityMetersPerSecond,
  ])

const transitionMatrix = (deltaTimeSeconds: number): Matrix4x4 => {
  const matrix = identityMatrix()
  matrix[index(EAST, EAST_VELOCITY)] = deltaTimeSeconds
  matrix[index(NORTH, NORTH_VELOCITY)] = deltaTimeSeconds
  return matrix
}

/** Discrete white-noise acceleration model: Q = G * G^T * sigma_a^2 with G = [dt^2/2, dt^2/2, dt, dt]. */
const processNoiseMatrix = (
  deltaTimeSeconds: number,
  accelerationNoiseMetersPerSecondSquared: number
): Matrix4x4 => {
  const halfDeltaTimeSquared = (deltaTimeSeconds * deltaTimeSeconds) / 2
  const accelerationVariance = accelerationNoiseMetersPerSecondSquared ** 2
  const positionPosition = halfDeltaTimeSquared * halfDeltaTimeSquared * accelerationVariance
  const positionVelocity = halfDeltaTimeSquared * deltaTimeSeconds * accelerationVariance
  const velocityVelocity = deltaTimeSeconds * deltaTimeSeconds * accelerationVariance
  const matrix = diagonalMatrix([
    positionPosition,
    positionPosition,
    velocityVelocity,
    velocityVelocity,
  ])
  matrix[index(EAST, EAST_VELOCITY)] = positionVelocity
  matrix[index(EAST_VELOCITY, EAST)] = positionVelocity
  matrix[index(NORTH, NORTH_VELOCITY)] = positionVelocity
  matrix[index(NORTH_VELOCITY, NORTH)] = positionVelocity
  return matrix
}

const measurementNoiseMatrix = (tuning: FilterTuning): Matrix4x4 => {
  const positionVariance = tuning.positionMeasurementNoiseMeters ** 2
  const velocityVariance = tuning.velocityMeasurementNoiseMetersPerSecond ** 2
  return diagonalMatrix([positionVariance, positionVariance, velocityVariance, velocityVariance])
}

const initialFilterState = (
  measurement: PositionVelocityMeasurement,
  tuning: FilterTuning = DEFAULT_TUNING
): FilterState => ({
  stateVector: measurementToVector(measurement),
  covariance: measurementNoiseMatrix(tuning),
})

const predictState = (
  filterState: FilterState,
  deltaTimeSeconds: number,
  tuning: FilterTuning = DEFAULT_TUNING
): FilterState => {
  const transition = transitionMatrix(deltaTimeSeconds)
  return {
    stateVector: multiplyMatrixVector(transition, filterState.stateVector),
    covariance: addMatrices(
      multiplyMatrices(
        multiplyMatrices(transition, filterState.covariance),
        transposeMatrix(transition)
      ),
      processNoiseMatrix(deltaTimeSeconds, tuning.accelerationNoiseMetersPerSecondSquared)
    ),
  }
}

/** Measurement matrix is identity (we observe the whole state), so H drops out of the equations. */
const updateState = (
  filterState: FilterState,
  measurement: PositionVelocityMeasurement,
  tuning: FilterTuning = DEFAULT_TUNING
): FilterState => {
  const innovation = subtractVectors(measurementToVector(measurement), filterState.stateVector)
  const innovationCovariance = addMatrices(filterState.covariance, measurementNoiseMatrix(tuning))
  const gain = multiplyMatrices(filterState.covariance, invertMatrix(innovationCovariance))
  return {
    stateVector: addVectors(filterState.stateVector, multiplyMatrixVector(gain, innovation)),
    covariance: multiplyMatrices(subtractMatrices(identityMatrix(), gain), filterState.covariance),
  }
}

const positionCovariance = (covariance: Matrix4x4): PositionCovariance2x2 => [
  covariance[index(EAST, EAST)],
  covariance[index(EAST, NORTH)],
  covariance[index(NORTH, EAST)],
  covariance[index(NORTH, NORTH)],
]

/** Eigen-decomposition of the 2x2 position block: semi-axes in metres (1 sigma) and orientation of the major axis. */
const positionUncertaintyEllipse = (covariance: Matrix4x4): UncertaintyEllipse => {
  const eastVariance = covariance[index(EAST, EAST)]
  const northVariance = covariance[index(NORTH, NORTH)]
  const eastNorthCovariance = covariance[index(EAST, NORTH)]
  const trace = eastVariance + northVariance
  const determinant = eastVariance * northVariance - eastNorthCovariance * eastNorthCovariance
  const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant))
  const largeEigenvalue = trace / 2 + discriminant
  const smallEigenvalue = Math.max(0, trace / 2 - discriminant)
  return {
    semiMajorMeters: Math.sqrt(largeEigenvalue),
    semiMinorMeters: Math.sqrt(smallEigenvalue),
    orientationRadians: Math.atan2(largeEigenvalue - eastVariance, eastNorthCovariance),
  }
}

export {
  EAST,
  NORTH,
  EAST_VELOCITY,
  NORTH_VELOCITY,
  DEFAULT_TUNING,
  initialFilterState,
  predictState,
  updateState,
  positionCovariance,
  positionUncertaintyEllipse,
}
export type {
  FilterState,
  FilterTuning,
  PositionVelocityMeasurement,
  UncertaintyEllipse,
  PositionCovariance2x2,
}
