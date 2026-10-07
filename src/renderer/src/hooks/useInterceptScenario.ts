import { useCallback, useEffect, useRef, useState } from 'react'

import type { GeodeticPoint } from '@shared/ipc'

import {
  DEFAULT_INTERCEPT_SETTINGS,
  EMPTY_INTERCEPT_ESTIMATE,
  type InterceptEstimate,
  type InterceptScenario,
  type InterceptSettings,
  interceptReachMeters,
} from '../intercept/interceptProbability'
import { toLocal } from '../prediction/localFrame'
import {
  PREDICTION_HORIZONS_SECONDS,
  type PredictedPoint,
} from '../prediction/trajectoryPrediction'

type InterceptScenarioInput = {
  localFrameOrigin: GeodeticPoint | null
  autopilotHome: GeodeticPoint | null
  predictedPoints: PredictedPoint[]
}

type LaunchPointState = {
  point: GeodeticPoint | null
  isCustom: boolean
}

const ESTIMATE_INTERVAL_MS = 200
const LAST_HORIZON_SECONDS = PREDICTION_HORIZONS_SECONDS[PREDICTION_HORIZONS_SECONDS.length - 1]

/** Owns everything about the interceptor: settings, launch point, reach and the Monte Carlo estimate from the worker. */
const useInterceptScenario = ({
  localFrameOrigin,
  autopilotHome,
  predictedPoints,
}: InterceptScenarioInput) => {
  const [settings, setSettings] = useState<InterceptSettings>(DEFAULT_INTERCEPT_SETTINGS)
  const [customLaunchPoint, setCustomLaunchPoint] = useState<GeodeticPoint | null>(null)
  const [estimate, setEstimate] = useState<InterceptEstimate>(EMPTY_INTERCEPT_ESTIMATE)
  const latestScenarioRef = useRef<InterceptScenario | null>(null)
  const isWorkerBusyRef = useRef(false)

  // Before HOME_POSITION arrives, the first seen position stands in for home. Only the interceptor wants that fallback.
  const launchPoint: LaunchPointState = {
    point: customLaunchPoint ?? autopilotHome ?? localFrameOrigin,
    isCustom: customLaunchPoint !== null,
  }

  useEffect(() => {
    const worker = new Worker(new URL('../intercept/interceptWorker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (estimateMessageEvent: MessageEvent<InterceptEstimate>) => {
      isWorkerBusyRef.current = false
      setEstimate(estimateMessageEvent.data)
    }
    // Posts the latest scenario at most every 200 ms; a slower worker just skips intermediate frames.
    const intervalHandle = setInterval(() => {
      if (isWorkerBusyRef.current || !latestScenarioRef.current) return
      isWorkerBusyRef.current = true
      worker.postMessage(latestScenarioRef.current)
    }, ESTIMATE_INTERVAL_MS)
    return () => {
      clearInterval(intervalHandle)
      worker.terminate()
    }
  }, [])

  const hasScenario =
    localFrameOrigin !== null && launchPoint.point !== null && predictedPoints.length > 0

  useEffect(() => {
    if (!localFrameOrigin || !launchPoint.point || predictedPoints.length === 0) {
      latestScenarioRef.current = null
      return
    }
    latestScenarioRef.current = {
      interceptorLaunchPoint: toLocal(localFrameOrigin, launchPoint.point),
      settings,
      predictedTargetPoints: predictedPoints.map((predictedPoint) => ({
        ...predictedPoint.localPosition,
        horizonSeconds: predictedPoint.horizonSeconds,
        positionCovariance: predictedPoint.positionCovariance,
      })),
    }
  }, [localFrameOrigin, launchPoint.point, predictedPoints, settings])

  const resetLaunchPoint = useCallback(() => setCustomLaunchPoint(null), [])

  return {
    settings,
    setSettings,
    launchPoint,
    setCustomLaunchPoint,
    resetLaunchPoint,
    reachMeters: interceptReachMeters(settings, LAST_HORIZON_SECONDS),
    // Without a scenario the worker never runs, so the last estimate would otherwise stay on screen.
    estimate: hasScenario ? estimate : EMPTY_INTERCEPT_ESTIMATE,
  }
}

export { useInterceptScenario }
export type { LaunchPointState }
