import { useEffect, useRef } from 'react'

import { DEMO_HOME_POINT } from '@shared/defaults'
import type { GeodeticPoint } from '@shared/ipc'
import {
  type GeoJSONSource,
  MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

import {
  type LongitudeLatitude,
  circleRingCoordinates,
  toLongitudeLatitude,
} from '../prediction/localFrame'
import type { PredictionOverlay } from '../prediction/trajectoryPrediction'

// MapLibre resolves its worker relative to node_modules; under file:// in a packaged app that path does not exist.
setWorkerUrl(maplibreWorkerUrl)

type MapScene = {
  vehicle: { position: GeodeticPoint; headingDegrees: number | null } | null
  autopilotHome: GeodeticPoint | null
  interceptor: { launchPoint: GeodeticPoint; reachMeters: number } | null
  trackCoordinates: LongitudeLatitude[]
  prediction: PredictionOverlay
}

type Props = {
  scene: MapScene
  onMapClick: (point: GeodeticPoint) => void
}

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const DEFAULT_ZOOM = 13
const VEHICLE_FOCUS_ZOOM = 14
const MIN_POINTS_FOR_LINE = 2

/** Same palette as the CSS tokens in app.css; MapLibre paint properties cannot read CSS variables. */
const MAP_COLORS = {
  background: '#0b0f14',
  vehicle: '#2ecc71',
  prediction: '#f1c40f',
  home: '#3498db',
  interceptor: '#e74c3c',
} as const

const VEHICLE_ICON = {
  name: 'vehicle-icon',
  sizePx: 48,
  /** Chevron pointing up as [x, y] pixel corners; MapLibre rotates it by the heading property. */
  cornersPx: [
    [24, 4],
    [40, 42],
    [24, 32],
    [8, 42],
  ] as const,
  outlineWidthPx: 3,
  renderScale: 0.6,
}

const SOURCE_IDS = {
  vehicle: 'vehicle',
  track: 'track',
  home: 'home',
  interceptor: 'interceptor',
  prediction: 'prediction',
  ellipses: 'ellipses',
  reach: 'reach',
} as const

const LAYER_IDS = {
  reachFill: 'reach-fill',
  reachOutline: 'reach-outline',
  track: 'track-line',
  ellipsesFill: 'ellipses-fill',
  ellipsesOutline: 'ellipses-outline',
  predictionLine: 'prediction-line',
  predictionPoints: 'prediction-points',
  predictionLabels: 'prediction-labels',
  home: 'home-point',
  interceptor: 'interceptor-point',
  vehicle: 'vehicle-symbol',
} as const

const featureCollectionOf = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features,
})

const pointFeature = (
  point: GeodeticPoint,
  properties: GeoJSON.GeoJsonProperties = {}
): GeoJSON.Feature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: toLongitudeLatitude(point) },
})

const lineStringFeature = (coordinates: LongitudeLatitude[]): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates },
})

const polygonFeature = (ring: LongitudeLatitude[]): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [ring] },
})

const vehicleIconImageData = (): ImageData => {
  const canvas = document.createElement('canvas')
  canvas.width = VEHICLE_ICON.sizePx
  canvas.height = VEHICLE_ICON.sizePx
  const context = canvas.getContext('2d')!
  context.beginPath()
  VEHICLE_ICON.cornersPx.forEach(([x, y], cornerIndex) =>
    cornerIndex === 0 ? context.moveTo(x, y) : context.lineTo(x, y)
  )
  context.closePath()
  context.fillStyle = MAP_COLORS.vehicle
  context.fill()
  context.lineWidth = VEHICLE_ICON.outlineWidthPx
  context.strokeStyle = MAP_COLORS.background
  context.stroke()
  return context.getImageData(0, 0, VEHICLE_ICON.sizePx, VEHICLE_ICON.sizePx)
}

const addLayers = (map: MapLibreMap): void => {
  map.addImage(VEHICLE_ICON.name, vehicleIconImageData())
  for (const sourceId of Object.values(SOURCE_IDS)) {
    map.addSource(sourceId, { type: 'geojson', data: featureCollectionOf([]) })
  }
  map.addLayer({
    id: LAYER_IDS.reachFill,
    type: 'fill',
    source: SOURCE_IDS.reach,
    paint: { 'fill-color': MAP_COLORS.interceptor, 'fill-opacity': 0.08 },
  })
  map.addLayer({
    id: LAYER_IDS.reachOutline,
    type: 'line',
    source: SOURCE_IDS.reach,
    paint: { 'line-color': MAP_COLORS.interceptor, 'line-width': 1, 'line-dasharray': [4, 3] },
  })
  map.addLayer({
    id: LAYER_IDS.track,
    type: 'line',
    source: SOURCE_IDS.track,
    paint: { 'line-color': MAP_COLORS.vehicle, 'line-width': 2, 'line-opacity': 0.8 },
  })
  map.addLayer({
    id: LAYER_IDS.ellipsesFill,
    type: 'fill',
    source: SOURCE_IDS.ellipses,
    paint: { 'fill-color': MAP_COLORS.prediction, 'fill-opacity': 0.15 },
  })
  map.addLayer({
    id: LAYER_IDS.ellipsesOutline,
    type: 'line',
    source: SOURCE_IDS.ellipses,
    paint: { 'line-color': MAP_COLORS.prediction, 'line-width': 1 },
  })
  map.addLayer({
    id: LAYER_IDS.predictionLine,
    type: 'line',
    source: SOURCE_IDS.prediction,
    filter: ['==', '$type', 'LineString'],
    paint: { 'line-color': MAP_COLORS.prediction, 'line-width': 2, 'line-dasharray': [2, 2] },
  })
  map.addLayer({
    id: LAYER_IDS.predictionPoints,
    type: 'circle',
    source: SOURCE_IDS.prediction,
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': 4,
      'circle-color': MAP_COLORS.prediction,
      'circle-stroke-color': MAP_COLORS.background,
      'circle-stroke-width': 1,
    },
  })
  map.addLayer({
    id: LAYER_IDS.predictionLabels,
    type: 'symbol',
    source: SOURCE_IDS.prediction,
    filter: ['==', '$type', 'Point'],
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 1.2],
      'text-font': ['Noto Sans Regular'],
    },
    paint: {
      'text-color': MAP_COLORS.prediction,
      'text-halo-color': MAP_COLORS.background,
      'text-halo-width': 1,
    },
  })
  map.addLayer({
    id: LAYER_IDS.home,
    type: 'circle',
    source: SOURCE_IDS.home,
    paint: {
      'circle-radius': 6,
      'circle-color': MAP_COLORS.home,
      'circle-stroke-color': MAP_COLORS.background,
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: LAYER_IDS.interceptor,
    type: 'circle',
    source: SOURCE_IDS.interceptor,
    paint: {
      'circle-radius': 7,
      'circle-color': MAP_COLORS.interceptor,
      'circle-stroke-color': MAP_COLORS.background,
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: LAYER_IDS.vehicle,
    type: 'symbol',
    source: SOURCE_IDS.vehicle,
    layout: {
      'icon-image': VEHICLE_ICON.name,
      'icon-size': VEHICLE_ICON.renderScale,
      'icon-rotate': ['get', 'headingDegrees'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
    },
  })
}

const buildVehicleFeatures = (vehicle: MapScene['vehicle']): GeoJSON.Feature[] =>
  vehicle ? [pointFeature(vehicle.position, { headingDegrees: vehicle.headingDegrees ?? 0 })] : []

const buildTrackFeatures = (trackCoordinates: LongitudeLatitude[]): GeoJSON.Feature[] =>
  trackCoordinates.length >= MIN_POINTS_FOR_LINE ? [lineStringFeature(trackCoordinates)] : []

const buildPredictionFeatures = (
  vehicle: MapScene['vehicle'],
  prediction: PredictionOverlay
): GeoJSON.Feature[] => {
  const pointFeatures = prediction.points.map((point) =>
    pointFeature(point.geodeticPosition, { label: point.label })
  )
  if (!vehicle || prediction.points.length === 0) return pointFeatures
  const pathCoordinates = [
    toLongitudeLatitude(vehicle.position),
    ...prediction.points.map((point) => toLongitudeLatitude(point.geodeticPosition)),
  ]
  return [...pointFeatures, lineStringFeature(pathCoordinates)]
}

const buildReachFeatures = (interceptor: MapScene['interceptor']): GeoJSON.Feature[] =>
  interceptor && interceptor.reachMeters > 0
    ? [polygonFeature(circleRingCoordinates(interceptor.launchPoint, interceptor.reachMeters))]
    : []

const setSourceData = (
  map: MapLibreMap,
  sourceId: string,
  featureCollection: GeoJSON.FeatureCollection
): void => {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  source?.setData(featureCollection)
}

const renderScene = (map: MapLibreMap, scene: MapScene): void => {
  setSourceData(map, SOURCE_IDS.vehicle, featureCollectionOf(buildVehicleFeatures(scene.vehicle)))
  setSourceData(
    map,
    SOURCE_IDS.track,
    featureCollectionOf(buildTrackFeatures(scene.trackCoordinates))
  )
  setSourceData(
    map,
    SOURCE_IDS.home,
    featureCollectionOf(scene.autopilotHome ? [pointFeature(scene.autopilotHome)] : [])
  )
  setSourceData(
    map,
    SOURCE_IDS.interceptor,
    featureCollectionOf(scene.interceptor ? [pointFeature(scene.interceptor.launchPoint)] : [])
  )
  setSourceData(
    map,
    SOURCE_IDS.prediction,
    featureCollectionOf(buildPredictionFeatures(scene.vehicle, scene.prediction))
  )
  setSourceData(
    map,
    SOURCE_IDS.ellipses,
    featureCollectionOf(scene.prediction.ellipseRings.map(polygonFeature))
  )
  setSourceData(map, SOURCE_IDS.reach, featureCollectionOf(buildReachFeatures(scene.interceptor)))
}

const MapView = ({ scene, onMapClick }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const isMapReadyRef = useRef(false)
  const hasCenteredOnVehicleRef = useRef(false)
  const onMapClickRef = useRef(onMapClick)

  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: toLongitudeLatitude(DEMO_HOME_POINT),
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.on('load', () => {
      addLayers(map)
      isMapReadyRef.current = true
      containerRef.current?.setAttribute('data-loaded', 'true')
    })
    map.on('error', (errorEvent) => console.error('map:', errorEvent.error?.message ?? errorEvent))
    map.on('click', (clickEvent) =>
      onMapClickRef.current({
        latitudeDegrees: clickEvent.lngLat.lat,
        longitudeDegrees: clickEvent.lngLat.lng,
      })
    )
    map.getCanvas().style.cursor = 'crosshair'
    mapRef.current = map
    return () => {
      isMapReadyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReadyRef.current) return
    renderScene(map, scene)
    if (scene.vehicle && !hasCenteredOnVehicleRef.current) {
      map.jumpTo({ center: toLongitudeLatitude(scene.vehicle.position), zoom: VEHICLE_FOCUS_ZOOM })
      hasCenteredOnVehicleRef.current = true
    }
  }, [scene])

  return <div ref={containerRef} className="map" data-testid="map" />
}

export { MapView }
export type { MapScene }
