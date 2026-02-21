import type { ResolvedTheme } from '@/state/themeStore'

export interface ScenePalette {
  water: number
  windPuff: number
  windLull: number
  windShadow: number
  windArrowDefault: number
  windArrowRight: number
  windArrowLeft: number
  boatHullOutline: number
  boatHullOutlineAlpha: number
  boatSailFill: number
  boatSailAlpha: number
  boatPortEdge: number
  boatStarboardEdge: number
  boatProjection: number
  boatProjectionAlpha: number
  boatNameDefault: string
  boatNameFouled: string
  mark: number
  markAlpha: number
  markZone: number
  markZoneAlpha: number
  startLine: number
  pinMark: number
  committeBoat: number
  leewardGate: number
  gateLine: number
  nextMarkHighlight: number
  contextLine: number
  contextLineAlpha: number
  countdownBg: number
  countdownBgAlpha: number
  countdownFill: number
  countdownFillWarning: number
  countdownLabelFill: string
  countdownTimeFill: string
  hudTextFill: string
  wakeLabelFill: string
}

const darkPalette: ScenePalette = {
  water: 0x021428,
  windPuff: 0x19d3c5,
  windLull: 0xb07aa1,
  windShadow: 0x6aaeff,
  windArrowDefault: 0xffffff,
  windArrowRight: 0xff8f70,
  windArrowLeft: 0x70d6ff,
  boatHullOutline: 0xffffff,
  boatHullOutlineAlpha: 0.4,
  boatSailFill: 0xffffff,
  boatSailAlpha: 0.65,
  boatPortEdge: 0x00c389,
  boatStarboardEdge: 0xff5e5e,
  boatProjection: 0xffffff,
  boatProjectionAlpha: 0.3,
  boatNameDefault: '#ffffff',
  boatNameFouled: '#ff6b6b',
  mark: 0xffff00,
  markAlpha: 0.8,
  markZone: 0xffffff,
  markZoneAlpha: 0.2,
  startLine: 0xffffff,
  pinMark: 0xffd166,
  committeBoat: 0x5cc8ff,
  leewardGate: 0xff6b6b,
  gateLine: 0xffe066,
  nextMarkHighlight: 0x00ffc3,
  contextLine: 0x70d6ff,
  contextLineAlpha: 0.42,
  countdownBg: 0x050a1a,
  countdownBgAlpha: 0.85,
  countdownFill: 0x53e0ff,
  countdownFillWarning: 0xff8f70,
  countdownLabelFill: '#f7d19f',
  countdownTimeFill: '#ffffff',
  hudTextFill: '#ffffff',
  wakeLabelFill: '#ffcf70',
}

const lightPalette: ScenePalette = {
  water: 0x4a90d9,
  windPuff: 0x0a8f84,
  windLull: 0x8b5a7a,
  windShadow: 0x3366aa,
  windArrowDefault: 0x1a1d2e,
  windArrowRight: 0xcc5533,
  windArrowLeft: 0x2277aa,
  boatHullOutline: 0x1a1d2e,
  boatHullOutlineAlpha: 0.5,
  boatSailFill: 0xffffff,
  boatSailAlpha: 0.85,
  boatPortEdge: 0x009966,
  boatStarboardEdge: 0xcc3333,
  boatProjection: 0x1a1d2e,
  boatProjectionAlpha: 0.35,
  boatNameDefault: '#1a1d2e',
  boatNameFouled: '#cc3333',
  mark: 0xdd9900,
  markAlpha: 0.9,
  markZone: 0x1a1d2e,
  markZoneAlpha: 0.25,
  startLine: 0x1a1d2e,
  pinMark: 0xcc8800,
  committeBoat: 0x2277bb,
  leewardGate: 0xcc3333,
  gateLine: 0xcc8800,
  nextMarkHighlight: 0x008855,
  contextLine: 0x2277aa,
  contextLineAlpha: 0.5,
  countdownBg: 0xf0f2f8,
  countdownBgAlpha: 0.92,
  countdownFill: 0x2277bb,
  countdownFillWarning: 0xcc5533,
  countdownLabelFill: '#6b5500',
  countdownTimeFill: '#1a1d2e',
  hudTextFill: '#1a1d2e',
  wakeLabelFill: '#996600',
}

export const getSceneColors = (theme: ResolvedTheme): ScenePalette =>
  theme === 'light' ? lightPalette : darkPalette
