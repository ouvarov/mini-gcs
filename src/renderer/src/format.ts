import { EMPTY_VALUE_TEXT } from '@shared/defaults'

/** Fixed decimals, or the dash when the value has not arrived yet. */
const formatNumber = (value: number | null | undefined, decimals: number): string =>
  value === null || value === undefined ? EMPTY_VALUE_TEXT : value.toFixed(decimals)

export { formatNumber }
