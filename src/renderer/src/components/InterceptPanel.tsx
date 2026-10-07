import { EMPTY_VALUE_TEXT } from '@shared/defaults'
import type { GeodeticPoint } from '@shared/ipc'
import { PERCENT_PER_RATIO } from '@shared/units'

import { formatNumber } from '../format'
import type { LaunchPointState } from '../hooks/useInterceptScenario'
import {
  INTERCEPT_SETTING_RANGES,
  type InterceptEstimate,
  type InterceptSettings,
} from '../intercept/interceptProbability'
import type { UncertaintyEllipse } from '../prediction/kalmanConstantVelocity'
import { formatHorizonLabel } from '../prediction/trajectoryPrediction'

type PredictedEllipse = {
  horizonSeconds: number
  ellipse: UncertaintyEllipse
}

type Props = {
  interceptSettings: InterceptSettings
  onSettingsChange: (interceptSettings: InterceptSettings) => void
  interceptEstimate: InterceptEstimate
  predictedEllipses: PredictedEllipse[]
  launchPoint: LaunchPointState
  onResetLaunchPoint: () => void
}

type SettingSliderProps = {
  label: string
  value: number
  range: { min: number; max: number; step: number }
  onValueChange: (value: number) => void
}

const LAUNCH_POINT_COORDINATE_DECIMALS = 5
const ELLIPSE_AXIS_DECIMALS = 0

const describeLaunchPoint = (launchPoint: LaunchPointState): string => {
  if (!launchPoint.point) return 'click the map to place the launch point'
  const coordinates = `${formatNumber(launchPoint.point.latitudeDegrees, LAUNCH_POINT_COORDINATE_DECIMALS)}, ${formatNumber(launchPoint.point.longitudeDegrees, LAUNCH_POINT_COORDINATE_DECIMALS)}`
  return `launch ${launchPoint.isCustom ? 'point' : 'from home'}: ${coordinates} · click the map to move it`
}

const describeEstimate = (
  interceptEstimate: InterceptEstimate,
  launchPoint: GeodeticPoint | null
): string => {
  if (interceptEstimate.typicalInterceptHorizonSeconds !== null) {
    return `most intercepts by ${formatHorizonLabel(interceptEstimate.typicalInterceptHorizonSeconds)} · ${interceptEstimate.sampleCount} samples`
  }
  return launchPoint ? 'target out of reach at every horizon' : 'waiting for a launch point'
}

const formatProbability = (
  interceptEstimate: InterceptEstimate,
  launchPoint: GeodeticPoint | null
): string =>
  launchPoint && interceptEstimate.sampleCount > 0
    ? `${Math.round(interceptEstimate.probability * PERCENT_PER_RATIO)} %`
    : EMPTY_VALUE_TEXT

const SettingSlider = ({ label, value, range, onValueChange }: SettingSliderProps) => (
  <label className="slider">
    <span>
      {label}: {value}
    </span>
    <input
      type="range"
      min={range.min}
      max={range.max}
      step={range.step}
      value={value}
      onChange={(changeEvent) => onValueChange(Number(changeEvent.target.value))}
    />
  </label>
)

const InterceptPanel = ({
  interceptSettings,
  onSettingsChange,
  interceptEstimate,
  predictedEllipses,
  launchPoint,
  onResetLaunchPoint,
}: Props) => (
  <div className="panel" data-testid="intercept">
    <div className="panel__title">Intercept</div>
    <div className="panel__row panel__row--spaced">
      <span className="panel__hint">{describeLaunchPoint(launchPoint)}</span>
      {launchPoint.isCustom && (
        <button type="button" className="panel__button" onClick={onResetLaunchPoint}>
          Reset to home
        </button>
      )}
    </div>
    <div className="intercept__probability">
      {formatProbability(interceptEstimate, launchPoint.point)}
    </div>
    <div className="panel__hint">{describeEstimate(interceptEstimate, launchPoint.point)}</div>
    <SettingSlider
      label="Interceptor speed, m/s"
      value={interceptSettings.interceptorSpeedMetersPerSecond}
      range={INTERCEPT_SETTING_RANGES.interceptorSpeedMetersPerSecond}
      onValueChange={(interceptorSpeedMetersPerSecond) =>
        onSettingsChange({ ...interceptSettings, interceptorSpeedMetersPerSecond })
      }
    />
    <SettingSlider
      label="Launch delay, s"
      value={interceptSettings.launchDelaySeconds}
      range={INTERCEPT_SETTING_RANGES.launchDelaySeconds}
      onValueChange={(launchDelaySeconds) =>
        onSettingsChange({ ...interceptSettings, launchDelaySeconds })
      }
    />
    <div className="panel__title panel__title--secondary">Prediction, 1σ</div>
    <dl className="panel__grid panel__grid--compact">
      {predictedEllipses.map(({ horizonSeconds, ellipse }) => (
        <div key={horizonSeconds} className="panel__row">
          <dt>{formatHorizonLabel(horizonSeconds)}</dt>
          <dd>
            {formatNumber(ellipse.semiMajorMeters, ELLIPSE_AXIS_DECIMALS)} ×{' '}
            {formatNumber(ellipse.semiMinorMeters, ELLIPSE_AXIS_DECIMALS)} m
          </dd>
        </div>
      ))}
    </dl>
  </div>
)

export { InterceptPanel }
export type { PredictedEllipse }
