import { useCallback, useEffect, useRef, useState } from 'react'

import type { GeodeticPoint, TelemetryBatch, TelemetryFrame } from '@shared/ipc'
import { MILLISECONDS_PER_SECOND } from '@shared/units'

import {
  DEFAULT_TUNING,
  EAST,
  type FilterState,
  type FilterTuning,
  NORTH,
  type PositionVelocityMeasurement,
  initialFilterState,
  predictState,
  updateState,
} from '../prediction/kalmanConstantVelocity'
import { type LongitudeLatitude, toLocal } from '../prediction/localFrame'
import { type PredictedPoint, predictTrajectory } from '../prediction/trajectoryPrediction'
import { createTrackBuffer } from '../telemetry/trackBuffer'

import { useAnimationFrameFlush } from './useAnimationFrameFlush'
import { useTelemetryBatches } from './useTelemetryBatches'

type TrackedVehicle = {
  /** ENU origin: the first position seen on this link. Everything in metres is relative to it. */
  localFrameOrigin: GeodeticPoint | null
  vehiclePosition: GeodeticPoint | null
  trackCoordinates: LongitudeLatitude[]
  predictedPoints: PredictedPoint[]
  /** Distance in metres between the last position measurement and the filter's prediction. */
  lastInnovationMeters: number
}

/** Everything the batch handler mutates between React renders. */
type TrackingSession = {
  localFrameOrigin: GeodeticPoint | null
  vehiclePosition: GeodeticPoint | null
  filterState: FilterState | null
  /** Autopilot clock when available (monotonic, immune to IPC batching jitter), wall clock otherwise. */
  lastSampleClockSeconds: number | null
  lastInnovationMeters: number
}

type PositionFrame = TelemetryFrame & { position: NonNullable<TelemetryFrame['position']> }

const TRACK_CAPACITY_SAMPLES = 36_000
/** Gaps longer than this mean the vehicle was out of sight; re-seed instead of extrapolating across the hole. */
const MAX_FILTER_GAP_SECONDS = 10

const EMPTY_TRACKED_VEHICLE: TrackedVehicle = {
  localFrameOrigin: null,
  vehiclePosition: null,
  trackCoordinates: [],
  predictedPoints: [],
  lastInnovationMeters: 0,
}

const emptySession = (): TrackingSession => ({
  localFrameOrigin: null,
  vehiclePosition: null,
  filterState: null,
  lastSampleClockSeconds: null,
  lastInnovationMeters: 0,
})

const hasPosition = (frame: TelemetryFrame): frame is PositionFrame => frame.position !== undefined

const sampleClockSeconds = (frame: TelemetryFrame): number =>
  (frame.timeSinceBootMs ?? frame.receivedAtEpochMs) / MILLISECONDS_PER_SECOND

const isUsableFilterStep = (deltaTimeSeconds: number | null): deltaTimeSeconds is number =>
  deltaTimeSeconds !== null && deltaTimeSeconds > 0 && deltaTimeSeconds <= MAX_FILTER_GAP_SECONDS

/** Feeds every position frame into the filter; the merged HUD snapshot is too sparse for dt. */
const useTrajectoryPrediction = (tuning: FilterTuning = DEFAULT_TUNING) => {
  const [trackedVehicle, setTrackedVehicle] = useState<TrackedVehicle>(EMPTY_TRACKED_VEHICLE)
  const sessionRef = useRef<TrackingSession>(emptySession())
  const trackBufferRef = useRef(createTrackBuffer(TRACK_CAPACITY_SAMPLES))
  const tuningRef = useRef(tuning)

  useEffect(() => {
    tuningRef.current = tuning
  }, [tuning])

  const requestFlush = useAnimationFrameFlush(
    useCallback(() => {
      const session = sessionRef.current
      setTrackedVehicle({
        localFrameOrigin: session.localFrameOrigin,
        vehiclePosition: session.vehiclePosition,
        trackCoordinates: trackBufferRef.current.toLineStringCoordinates(),
        predictedPoints:
          session.localFrameOrigin && session.filterState
            ? predictTrajectory(session.filterState, session.localFrameOrigin, tuningRef.current)
            : [],
        lastInnovationMeters: session.lastInnovationMeters,
      })
    }, [])
  )

  const ingestPositionFrame = useCallback((frame: PositionFrame): void => {
    const session = sessionRef.current
    const vehiclePosition: GeodeticPoint = {
      latitudeDegrees: frame.position.latitudeDegrees,
      longitudeDegrees: frame.position.longitudeDegrees,
    }
    session.vehiclePosition = vehiclePosition
    trackBufferRef.current.push(vehiclePosition)
    if (!session.localFrameOrigin) session.localFrameOrigin = vehiclePosition

    const localPosition = toLocal(session.localFrameOrigin, vehiclePosition)
    const measurement: PositionVelocityMeasurement = {
      eastMeters: localPosition.eastMeters,
      northMeters: localPosition.northMeters,
      eastVelocityMetersPerSecond: frame.position.velocityEastMetersPerSecond,
      northVelocityMetersPerSecond: frame.position.velocityNorthMetersPerSecond,
    }
    const clockSeconds = sampleClockSeconds(frame)
    const deltaTimeSeconds =
      session.lastSampleClockSeconds === null ? null : clockSeconds - session.lastSampleClockSeconds
    session.lastSampleClockSeconds = clockSeconds

    if (!session.filterState || !isUsableFilterStep(deltaTimeSeconds)) {
      session.filterState = initialFilterState(measurement, tuningRef.current)
      session.lastInnovationMeters = 0
      return
    }
    const predictedFilterState = predictState(
      session.filterState,
      deltaTimeSeconds,
      tuningRef.current
    )
    session.lastInnovationMeters = Math.hypot(
      measurement.eastMeters - predictedFilterState.stateVector[EAST],
      measurement.northMeters - predictedFilterState.stateVector[NORTH]
    )
    session.filterState = updateState(predictedFilterState, measurement, tuningRef.current)
  }, [])

  useTelemetryBatches(
    useCallback(
      (telemetryBatch: TelemetryBatch) => {
        for (const frame of telemetryBatch.frames) {
          if (hasPosition(frame)) ingestPositionFrame(frame)
        }
        requestFlush()
      },
      [ingestPositionFrame, requestFlush]
    )
  )

  const reset = useCallback((): void => {
    sessionRef.current = emptySession()
    trackBufferRef.current.clear()
    setTrackedVehicle(EMPTY_TRACKED_VEHICLE)
  }, [])

  return { trackedVehicle, reset }
}

export { useTrajectoryPrediction }
export type { TrackedVehicle }
