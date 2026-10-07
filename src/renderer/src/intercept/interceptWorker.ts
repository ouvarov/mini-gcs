import { type InterceptScenario, estimateInterceptProbability } from './interceptProbability'

// Thousands of samples per estimate would stall the UI; the worker keeps it off the main thread.
self.onmessage = (scenarioMessageEvent: MessageEvent<InterceptScenario>) => {
  self.postMessage(estimateInterceptProbability(scenarioMessageEvent.data))
}
