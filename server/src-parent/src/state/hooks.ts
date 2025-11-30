import { useSyncExternalStore } from 'react'
import type { ChatMessage, RaceEvent, RaceState } from '@/types/race'
import { raceStore, type InputTelemetrySnapshot } from './raceStore'

export const useRaceState = (): RaceState =>
  useSyncExternalStore(raceStore.subscribe, raceStore.getState)

export const useRaceEvents = (): RaceEvent[] =>
  useSyncExternalStore(raceStore.subscribe, raceStore.getRecentEvents)

export const useChatLog = (): ChatMessage[] =>
  useSyncExternalStore(raceStore.subscribe, raceStore.getChatLog)

export const useInputTelemetry = (): InputTelemetrySnapshot =>
  useSyncExternalStore(
    raceStore.subscribeTelemetry,
    raceStore.getInputTelemetry,
    raceStore.getInputTelemetry,
  )

