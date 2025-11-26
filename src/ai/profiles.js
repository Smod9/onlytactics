"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_PRESETS = exports.createAiConfig = exports.getAiPreset = void 0;
const PRESETS = {
    steady: {
        id: 'steady',
        label: 'Steady VMG',
        accuracy: 0.8,
        reactionMs: 800,
        upwindAwa: 38,
        downwindAwa: 140,
        tackThresholdDeg: 18,
        gybeThresholdDeg: 20,
        laylineBuffer: 6,
    },
    aggressive: {
        id: 'aggressive',
        label: 'Aggressive',
        accuracy: 0.92,
        reactionMs: 600,
        upwindAwa: 34,
        downwindAwa: 135,
        tackThresholdDeg: 12,
        gybeThresholdDeg: 14,
        laylineBuffer: 4,
    },
    casual: {
        id: 'casual',
        label: 'Casual',
        accuracy: 0.65,
        reactionMs: 1200,
        upwindAwa: 42,
        downwindAwa: 150,
        tackThresholdDeg: 24,
        gybeThresholdDeg: 26,
        laylineBuffer: 10,
    },
    chill: {
        id: 'chill',
        label: 'Chill Cruiser',
        accuracy: 0.6,
        reactionMs: 1500,
        upwindAwa: 43,
        downwindAwa: 152,
        tackThresholdDeg: 28,
        gybeThresholdDeg: 30,
        laylineBuffer: 12,
    },
};
const getAiPreset = (profileId) => PRESETS[profileId] ?? PRESETS.steady;
exports.getAiPreset = getAiPreset;
const createAiConfig = (profileId) => {
    const preset = (0, exports.getAiPreset)(profileId);
    return {
        profileId: preset.id,
        accuracy: preset.accuracy,
        reactionMs: preset.reactionMs,
        upwindAwa: preset.upwindAwa,
        downwindAwa: preset.downwindAwa,
        tackThresholdDeg: preset.tackThresholdDeg,
        gybeThresholdDeg: preset.gybeThresholdDeg,
        laylineBuffer: preset.laylineBuffer,
        separationDistance: 70,
        enabled: true,
    };
};
exports.createAiConfig = createAiConfig;
exports.AI_PRESETS = PRESETS;
