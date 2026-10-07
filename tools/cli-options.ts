type CommandLineOptions = {
  readNumber: (optionName: string, defaultValue: number) => number
  readString: (optionName: string, defaultValue: string) => string
}

/** `--name value` pairs; a flag without a value becomes "true". */
const parseCommandLineOptions = (argumentList: string[]): CommandLineOptions => {
  const rawValues: Record<string, string> = {}
  for (let argumentIndex = 0; argumentIndex < argumentList.length; argumentIndex++) {
    const argument = argumentList[argumentIndex]
    if (argument.startsWith('--'))
      rawValues[argument.slice(2)] = argumentList[argumentIndex + 1] ?? 'true'
  }
  return {
    readNumber: (optionName, defaultValue) =>
      rawValues[optionName] === undefined ? defaultValue : Number(rawValues[optionName]),
    readString: (optionName, defaultValue) => rawValues[optionName] ?? defaultValue,
  }
}

export { parseCommandLineOptions }
export type { CommandLineOptions }
