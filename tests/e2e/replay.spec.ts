import path from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

const PROJECT_ROOT = path.resolve(__dirname, '../..')
const MAIN_ENTRY = path.join(PROJECT_ROOT, 'out/main/index.js')
const FIXTURE_TLOG = path.join(PROJECT_ROOT, 'fixtures/sitl-square.tlog')
const SCREENSHOT_PATH = path.join(PROJECT_ROOT, 'test-results/replay.png')
const KYIV_LATITUDE_PREFIX = '50.4'
const REPLAY_CONNECT_TIMEOUT_MS = 15_000
const MAP_LOAD_TIMEOUT_MS = 30_000
const ACCUMULATION_WAIT_MS = 4_000

/** Needs `npm run build` first: Playwright drives the built main entry, not the Vite dev server. */
test('replays a recorded SITL flight into the HUD and the map', async () => {
  const electronApp = await electron.launch({ args: [MAIN_ENTRY] })
  const appWindow = await electronApp.firstWindow()
  const consoleErrors: string[] = []
  appWindow.on('console', (consoleMessage) => {
    if (consoleMessage.type() === 'error') consoleErrors.push(consoleMessage.text())
  })

  // The app auto-connects on UDP 14550 at startup; the transport select is locked while a link is active.
  await appWindow.getByRole('button', { name: 'Disconnect' }).click()
  await expect(appWindow.getByTestId('link-state')).toHaveText('idle')
  await appWindow.getByLabel('Transport').selectOption('tlog')
  await appWindow.getByLabel('Telemetry log path').fill(FIXTURE_TLOG)
  await appWindow.getByLabel('Playback speed').selectOption('5')
  await appWindow.getByRole('button', { name: 'Connect' }).click()

  await expect(appWindow.getByTestId('link-state')).toHaveText(/connected/, {
    timeout: REPLAY_CONNECT_TIMEOUT_MS,
  })
  await expect(appWindow.getByTestId('hud-mode')).toContainText('AUTO', {
    timeout: REPLAY_CONNECT_TIMEOUT_MS,
  })
  await expect(appWindow.getByTestId('hud-latitude')).toContainText(KYIV_LATITUDE_PREFIX)
  await expect(appWindow.getByTestId('map')).toHaveAttribute('data-loaded', 'true', {
    timeout: MAP_LOAD_TIMEOUT_MS,
  })
  await expect(appWindow.getByTestId('intercept')).toContainText('%', {
    timeout: REPLAY_CONNECT_TIMEOUT_MS,
  })
  await expect(appWindow.getByTestId('hud-mode')).toContainText('AUTO')
  await expect(appWindow.getByTestId('diagnostics')).not.toContainText('Packets/s0')

  await appWindow.waitForTimeout(ACCUMULATION_WAIT_MS)
  await appWindow.screenshot({ path: SCREENSHOT_PATH })
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  await electronApp.close()
})
