/* eslint-disable no-continue */

import { isNumber, toNumber } from 'lodash'
import { generateArgsNames, Maybe, Nullable } from 'uiSrc/utils'
import { CommandProvider, IRedisCommand, IRedisCommandTree, ICommandTokenType } from 'uiSrc/constants'
import { COMPOSITE_ARGS } from 'uiSrc/pages/workbench/constants'
import { ArgName, FoundCommandArgument } from '../types'

export const splitQueryByArgs = (query: string, position: number = 0) => {
  const args: [string[], string[]] = [[], []]
  let arg = ''
  let inQuotes = false
  let escapeNextChar = false
  let quoteChar = ''
  let isCursorInQuotes = false
  let lastArg = ''
  let argLeftOffset = 0
  let argRightOffset = 0

  const pushToProperTuple = (isAfterOffset: boolean, arg: string) => {
    lastArg = arg
    isAfterOffset ? args[1].push(arg) : args[0].push(arg)
  }

  const updateLastArgument = (isAfterOffset: boolean, arg: string) => {
    const argsBySide = args[isAfterOffset ? 1 : 0]
    argsBySide[argsBySide.length - 1] = `${argsBySide[argsBySide.length - 1]} ${arg}`
  }

  const updateArgOffsets = (left: number, right: number) => {
    argLeftOffset = left
    argRightOffset = right
  }

  for (let i = 0; i < query.length; i++) {
    const char = query[i]
    const isAfterOffset = i >= position + (inQuotes ? -1 : 0)

    if (escapeNextChar) {
      arg += char
      escapeNextChar = !quoteChar
    } else if (char === '\\') {
      escapeNextChar = true
    } else if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false
        const argWithChat = arg + char

        if (isAfterOffset && !argLeftOffset) {
          updateArgOffsets(i - arg.length, i + 1)
        }

        if (isCompositeArgument(argWithChat, lastArg)) {
          updateLastArgument(isAfterOffset, argWithChat)
        } else {
          pushToProperTuple(isAfterOffset, argWithChat)
        }

        arg = ''
      } else {
        arg += char
      }
    } else if (char === '"' || char === "'") {
      inQuotes = true
      quoteChar = char
      arg += char
    } else if (char === ' ' || char === '\n') {
      if (arg.length > 0) {
        if (isAfterOffset && !argLeftOffset) {
          updateArgOffsets(i - arg.length, i)
        }

        if (isCompositeArgument(arg, lastArg)) {
          updateLastArgument(isAfterOffset, arg)
        } else {
          pushToProperTuple(isAfterOffset, arg)
        }

        arg = ''
      }
    } else {
      arg += char
    }

    if (i === position - 1) isCursorInQuotes = inQuotes
  }

  if (arg.length > 0) {
    if (!argLeftOffset) updateArgOffsets(query.length - arg.length, query.length)
    pushToProperTuple(true, arg)
  }

  const cursor = {
    isCursorInQuotes,
    prevCursorChar: query[position - 1]?.trim() || '',
    nextCursorChar: query[position]?.trim() || '',
    argLeftOffset,
    argRightOffset
  }

  return { args, cursor }
}

export const findCurrentArgument = (
  args: IRedisCommand[],
  prev: string[],
  untilTokenArgs: string[] = [],
  parent?: IRedisCommandTree
): Nullable<FoundCommandArgument> => {
  for (let i = prev.length - 1; i >= 0; i--) {
    const arg = prev[i]
    const currentArg = findArgByToken(args, arg)
    const currentWithParent: IRedisCommandTree = { ...currentArg, parent }

    if (currentArg?.arguments && currentArg?.type === ICommandTokenType.Block) {
      return findCurrentArgument(currentArg.arguments, prev.slice(i), prev, currentWithParent)
    }

    const tokenIndex = args.findIndex((cArg) =>
      cArg.token?.toLowerCase() === arg.toLowerCase())
    const token = args[tokenIndex]

    if (token) {
      const pastArgs = prev.slice(i)
      const commandArgs = parent ? args.slice(tokenIndex, args.length) : [token]

      // getArgByRest - here we preparing the list of arguments which can be inserted,
      // this is the main function which creates the list of arguments
      return {
        ...getArgumentSuggestions({ tokenArgs: pastArgs, untilTokenArgs }, commandArgs, parent),
        parent: parent || token
      }
    }
  }

  return null
}

const findStopArgumentInQuery = (
  queryArgs: string[],
  restCommandArgs: Maybe<IRedisCommand[]> = [],
): {
  restArguments: IRedisCommand[]
  stopArgIndex: number
  argumentsIntered?: number
  isBlocked: boolean
  parent?: IRedisCommand
} => {
  let currentCommandArgIndex = 0
  let argumentsIntered = 0
  let isBlockedOnCommand = false
  let multipleIndexStart = 0
  let multipleCountNumber = 0

  const moveToNextCommandArg = () => {
    currentCommandArgIndex++
    argumentsIntered++
  }
  const blockCommand = () => { isBlockedOnCommand = true }
  const unBlockCommand = () => { isBlockedOnCommand = false }

  const skipArg = () => {
    argumentsIntered -= 1
    moveToNextCommandArg()
    unBlockCommand()
  }

  for (let i = 0; i < queryArgs.length; i++) {
    const arg = queryArgs[i]
    const currentCommandArg = restCommandArgs[currentCommandArgIndex]

    if (currentCommandArg?.type === ICommandTokenType.PureToken) {
      skipArg()
      continue
    }

    if (!isBlockedOnCommand && currentCommandArg?.optional) {
      const isNotToken = currentCommandArg?.token && currentCommandArg.token !== arg.toUpperCase()
      const isNotOneOfToken = !currentCommandArg?.token && currentCommandArg?.type === ICommandTokenType.OneOf
        && currentCommandArg?.arguments?.every(({ token }) => token !== arg.toUpperCase())

      if (isNotToken || isNotOneOfToken) {
        moveToNextCommandArg()
        skipArg()
        continue
      }
    }

    if (currentCommandArg?.type === ICommandTokenType.Block) {
      let blockArguments = currentCommandArg.arguments ? [...currentCommandArg.arguments] : []
      const nArgs = toNumber(queryArgs[i - 1]) || 0

      // if block is multiple - we duplicate nArgs inner arguments
      if (currentCommandArg?.multiple && nArgs) {
        blockArguments = Array(nArgs).fill(currentCommandArg.arguments).flat()
      }

      const currentQueryArg = queryArgs.slice(i)?.[0]?.toUpperCase()
      const isBlockHasToken = blockArguments?.[0]?.token === currentQueryArg

      if (currentCommandArg.token && !isBlockHasToken && currentQueryArg) {
        blockArguments.unshift({
          type: ICommandTokenType.PureToken,
          token: currentQueryArg
        })
      }

      const blockSuggestion = findStopArgumentInQuery(queryArgs.slice(i), blockArguments)
      const stopArg = blockSuggestion.restArguments?.[blockSuggestion.stopArgIndex]
      const { argumentsIntered } = blockSuggestion

      if (nArgs && currentCommandArg?.multiple && isNumber(argumentsIntered) && argumentsIntered >= nArgs) {
        i += queryArgs.slice(i).length - 1
        skipArg()
        continue
      }

      if (blockSuggestion.isBlocked || stopArg) {
        return {
          ...blockSuggestion,
          parent: currentCommandArg
        }
      }

      i += queryArgs.slice(i).length - 1
      skipArg()
      continue
    }

    // if we are on token - that requires one more argument
    if (currentCommandArg?.token === arg.toUpperCase()) {
      blockCommand()
      continue
    }

    if (currentCommandArg?.name === ArgName.NArgs || currentCommandArg?.name === ArgName.Count) {
      const numberOfArgs = toNumber(arg)

      if (numberOfArgs === 0) {
        moveToNextCommandArg()
        skipArg()
        continue
      }

      moveToNextCommandArg()
      blockCommand()
      continue
    }

    if (currentCommandArg?.type === ICommandTokenType.OneOf && currentCommandArg?.optional) {
      // if oneof is optional then we can switch to another argument
      if (!currentCommandArg?.arguments?.some(({ token }) => token === arg)) {
        moveToNextCommandArg()
      }

      skipArg()
      continue
    }

    if (currentCommandArg?.multiple) {
      if (!multipleIndexStart) {
        multipleCountNumber = toNumber(queryArgs[i - 1])
        multipleIndexStart = i - 1
      }

      if (i - multipleIndexStart >= multipleCountNumber) {
        skipArg()
        multipleIndexStart = 0
        continue
      }

      blockCommand()
      continue
    }

    moveToNextCommandArg()

    isBlockedOnCommand = false
  }

  return {
    restArguments: restCommandArgs,
    stopArgIndex: currentCommandArgIndex,
    argumentsIntered,
    isBlocked: isBlockedOnCommand
  }
}

export const getArgumentSuggestions = (
  { tokenArgs, untilTokenArgs }: {
    tokenArgs: string[],
    untilTokenArgs: string[]
  },
  pastCommandArgs: IRedisCommand[],
  current?: IRedisCommandTree
): {
  isComplete: boolean
  stopArg: Maybe<IRedisCommand>,
  isBlocked: boolean,
  append: Array<IRedisCommand[]>,
} => {
  const {
    restArguments,
    stopArgIndex,
    isBlocked: isWasBlocked,
    parent
  } = findStopArgumentInQuery(tokenArgs, pastCommandArgs)

  const prevArg = restArguments[stopArgIndex - 1]
  const stopArgument = restArguments[stopArgIndex]
  const restNotFilledArgs = restArguments.slice(stopArgIndex)

  const isOneOfArgument = stopArgument?.type === ICommandTokenType.OneOf
    || (stopArgument?.type === ICommandTokenType.PureToken && current?.parent?.type === ICommandTokenType.OneOf)

  if (isWasBlocked) {
    return {
      isComplete: false,
      stopArg: stopArgument,
      isBlocked: !isOneOfArgument,
      append: isOneOfArgument ? [stopArgument.arguments!] : [],
    }
  }

  const isPrevArgWasMandatory = prevArg && !prevArg.optional
  if (isPrevArgWasMandatory && stopArgument && !stopArgument.optional) {
    const isCanAppend = stopArgument?.token || isOneOfArgument
    const append = isCanAppend ? [[isOneOfArgument ? stopArgument.arguments! : stopArgument].flat()] : []

    return {
      isComplete: false,
      stopArg: stopArgument,
      isBlocked: !isCanAppend,
      append,
    }
  }

  // if we finished argument - stopArgument will be undefined, then we get it as token
  const lastArgument = stopArgument ?? restArguments[0]
  const isBlockHasParent = current?.arguments?.some(({ name }) => parent?.name && name === parent?.name)
  const foundParent = isBlockHasParent ? { ...parent, parent: current } : (parent || current)

  const isBlockComplete = !stopArgument && current?.name === lastArgument?.name
  const beforeMandatoryOptionalArgs = getAllRestArguments(foundParent, lastArgument, untilTokenArgs, isBlockComplete)
  const requiredArgsLength = restNotFilledArgs.filter((arg) => !arg.optional).length

  return {
    isComplete: requiredArgsLength === 0,
    stopArg: stopArgument,
    isBlocked: false,
    append: beforeMandatoryOptionalArgs,
  }
}

export const getRestArguments = (
  current: Maybe<IRedisCommandTree>,
  stopArgument: Nullable<IRedisCommand>
): IRedisCommandTree[] => {
  const argumentIndexInArg = current?.arguments
    ?.findIndex(({ name }) => name === stopArgument?.name)
  const nextMandatoryIndex = stopArgument && !stopArgument.optional
    ? argumentIndexInArg
    : argumentIndexInArg && argumentIndexInArg > -1 ? current?.arguments
      ?.findIndex(({ optional }, i) => !optional && i > argumentIndexInArg) : -1

  const prevMandatory = current?.arguments?.slice(0, argumentIndexInArg).reverse()
    .find(({ optional }) => !optional)
  const prevMandatoryIndex = current?.arguments?.findIndex(({ name }) => name === prevMandatory?.name)

  const beforeMandatoryOptionalArgs = (
    nextMandatoryIndex && nextMandatoryIndex > -1
      ? current?.arguments?.slice(prevMandatoryIndex, nextMandatoryIndex)
      : current?.arguments?.slice((prevMandatoryIndex || 0) + 1)
  ) || []

  const nextMandatoryArg = nextMandatoryIndex && nextMandatoryIndex > -1
    ? current?.arguments?.[nextMandatoryIndex]
    : undefined

  if (nextMandatoryArg?.token) {
    beforeMandatoryOptionalArgs.unshift(nextMandatoryArg)
  }

  if (nextMandatoryArg?.type === ICommandTokenType.OneOf) {
    beforeMandatoryOptionalArgs.unshift(...(nextMandatoryArg.arguments || []))
  }

  return beforeMandatoryOptionalArgs.map((arg) => ({ ...arg, parent: current }))
}

export const getAllRestArguments = (
  current: Maybe<IRedisCommandTree>,
  stopArgument: Nullable<IRedisCommand>,
  untilTokenArgs: string[] = [],
  skipLevel = false
) => {
  const appendArgs: Array<IRedisCommand[]> = []
  const currentLvlNextArgs = removeNotSuggestedArgs(
    untilTokenArgs,
    getRestArguments(current, stopArgument)
  )

  if (!skipLevel) {
    appendArgs.push(fillArgsByType(currentLvlNextArgs))
  }

  if (current?.parent) {
    const parentArgs = getAllRestArguments(current.parent, current, untilTokenArgs)
    if (parentArgs?.length) {
      appendArgs.push(...parentArgs)
    }
  }

  return appendArgs
}

export const removeNotSuggestedArgs = (args: string[], commandArgs: IRedisCommandTree[]) =>
  commandArgs.filter((arg) => {
    if (arg.token && arg.multiple) return true

    if (arg.type === ICommandTokenType.OneOf) {
      return !args
        .some((queryArg) => arg.arguments
          ?.some((oneOfArg) => oneOfArg.token?.toUpperCase() === queryArg.toUpperCase()))
    }

    if (arg.type === ICommandTokenType.Block) {
      if (arg.token) return !args.includes(arg.token) || arg.multiple
      return arg.arguments?.[0]?.token && (!args.includes(arg.arguments?.[0]?.token?.toUpperCase()) || arg.multiple)
    }

    return arg.token && !args.includes(arg.token)
  })

export const fillArgsByType = (args: IRedisCommand[], expandBlock = true): IRedisCommandTree[] => {
  const result: IRedisCommandTree[] = []

  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i]

    if (expandBlock && currentArg.type === ICommandTokenType.OneOf && !currentArg.token) {
      result.push(...(currentArg?.arguments?.map((arg) => ({ ...arg, parent: currentArg })) || []))
    }

    if (currentArg.token) {
      result.push(currentArg)
      continue
    }

    if (currentArg.type === ICommandTokenType.Block) {
      result.push({
        multiple: currentArg.multiple,
        optional: currentArg.optional,
        parent: currentArg,
        ...(currentArg?.arguments?.[0] as IRedisCommand || {}),
      })
    }
  }

  return result
}

export const findArgByToken = (list: IRedisCommand[], arg: string): Maybe<IRedisCommand> =>
  list.find((cArg) =>
    (cArg.type === ICommandTokenType.OneOf
      ? cArg.arguments?.some((oneOfArg: IRedisCommand) => oneOfArg?.token?.toLowerCase() === arg?.toLowerCase())
      : cArg.arguments?.[0]?.token?.toLowerCase() === arg.toLowerCase()))

export const isCompositeArgument = (arg: string, prevArg?: string) =>
  COMPOSITE_ARGS.includes([prevArg?.toUpperCase(), arg?.toUpperCase()].join(' '))

export const generateDetail = (command: Maybe<IRedisCommand>) => {
  if (!command) return ''
  if (command.arguments) return generateArgsNames(CommandProvider.Main, command.arguments).join(' ')
  if (command.token) {
    if (command.type === ICommandTokenType.PureToken) return command.token
    return `${command.token}`
  }

  return ''
}

export const addOwnTokenToArgs = (token: string, command: IRedisCommand) => {
  if (command.arguments) {
    return ({ ...command, arguments: [{ token, type: ICommandTokenType.PureToken }, ...command.arguments] })
  }
  return command
}
