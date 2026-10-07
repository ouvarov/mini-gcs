import type { GeodeticPoint } from '@shared/ipc'

import {
  DEFAULT_TUNING,
  EAST,
  type FilterState,
  type FilterTuning,
  NORTH,
  type PositionCovariance2x2,
  type UncertaintyEllipse,
  positionCovariance,
  positionUncertaintyEllipse,
  predictState,
} from './kalmanConstantVelocity'
import { type LocalPoint, type LongitudeLatitude, ringCoordinates, toGeodetic } from './localFrame'

type PredictedPoint = {
  horizonSeconds: number
  geodeticPosition: GeodeticPoint
  localPosition: LocalPoint
  ellipse: UncertaintyEllipse
  positionCovariance: PositionCovariance2x2
}

/** What the map needs and nothing more: no filter types leak into the UI. */
type PredictionOverlay = {
  points: { geodeticPosition: GeodeticPoint; label: string }[]
  ellipseRings: LongitudeLatitude[][]
}

const PREDICTION_HORIZONS_SECONDS = [5, 10, 15]

const formatHorizonLabel = (horizonSeconds: number): string => `+${horizonSeconds}s`

/** Runs the filter forward without measurements; uncertainty grows with each horizon. */
const predictTrajectory = (
  filterState: FilterState,
  localFrameOrigin: GeodeticPoint,
  tuning: FilterTuning = DEFAULT_TUNING,
  horizonsSeconds = PREDICTION_HORIZONS_SECONDS
): PredictedPoint[] => {
  const predictedPoints: PredictedPoint[] = []
  let rollingState = filterState
  let elapsedSeconds = 0
  for (const horizonSeconds of horizonsSeconds) {
    rollingState = predictState(rollingState, horizonSeconds - elapsedSeconds, tuning)
    elapsedSeconds = horizonSeconds
    const localPosition = {
      eastMeters: rollingState.stateVector[EAST],
      northMeters: rollingState.stateVector[NORTH],
    }
    predictedPoints.push({
      horizonSeconds,
      geodeticPosition: toGeodetic(localFrameOrigin, localPosition),
      localPosition,
      ellipse: positionUncertaintyEllipse(rollingState.covariance),
      positionCovariance: positionCovariance(rollingState.covariance),
    })
  }
  return predictedPoints
}

const rotateOffset = (offset: LocalPoint, orientationRadians: number): LocalPoint => ({
  eastMeters:
    offset.eastMeters * Math.cos(orientationRadians) -
    offset.northMeters * Math.sin(orientationRadians),
  northMeters:
    offset.eastMeters * Math.sin(orientationRadians) +
    offset.northMeters * Math.cos(orientationRadians),
})

/** Polygon ring of the uncertainty ellipse scaled by sigmaMultiplier, as [lon, lat] pairs for GeoJSON. */
const ellipseRingCoordinates = (
  predictedPoint: PredictedPoint,
  localFrameOrigin: GeodeticPoint,
  sigmaMultiplier = 1
): LongitudeLatitude[] => {
  const { semiMajorMeters, semiMinorMeters, orientationRadians } = predictedPoint.ellipse
  return ringCoordinates(localFrameOrigin, predictedPoint.localPosition, (angleRadians) =>
    rotateOffset(
      {
        eastMeters: semiMajorMeters * sigmaMultiplier * Math.cos(angleRadians),
        northMeters: semiMinorMeters * sigmaMultiplier * Math.sin(angleRadians),
      },
      orientationRadians
    )
  )
}

const buildPredictionOverlay = (
  predictedPoints: PredictedPoint[],
  localFrameOrigin: GeodeticPoint | null
): PredictionOverlay => ({
  points: predictedPoints.map((predictedPoint) => ({
    geodeticPosition: predictedPoint.geodeticPosition,
    label: formatHorizonLabel(predictedPoint.horizonSeconds),
  })),
  ellipseRings: localFrameOrigin
    ? predictedPoints.map((predictedPoint) =>
        ellipseRingCoordinates(predictedPoint, localFrameOrigin)
      )
    : [],
})

export {
  PREDICTION_HORIZONS_SECONDS,
  formatHorizonLabel,
  predictTrajectory,
  ellipseRingCoordinates,
  buildPredictionOverlay,
}
export type { PredictedPoint, PredictionOverlay }
