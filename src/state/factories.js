"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneRaceState = exports.createInitialRaceState = exports.createBoatState = exports.createRaceMeta = exports.AI_BOAT_CONFIGS = exports.defaultBoatColors = void 0;
const env_1 = require("@/config/env");
const profiles_1 = require("@/ai/profiles");
const ids_1 = require("@/utils/ids");
const rng_1 = require("@/utils/rng");
exports.defaultBoatColors = [
    0xff9ecd, // pink
    0xffd166, // golden
    0x8dd3c7, // mint
    0xaec9ff, // pastel blue
    0xff8e72, // coral
    0xcdb4db, // lavender
    0x9bdeac, // seafoam
    0xffc4eb, // blush
    0xf4d35e, // sunflower
    0xb5e48c, // lime pastel
];
const defaultStartLine = {
    pin: { x: -210, y: 80 },
    committee: { x: 210, y: 70 },
};
const defaultLeewardGate = {
    left: { x: -40, y: -20 },
    right: { x: 40, y: -30 },
};
const structuredCopy = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};
exports.AI_BOAT_CONFIGS = [
    { id: 'ai-dennis', name: 'Dennis (AI)', aiProfileId: 'steady' },
    { id: 'ai-terry', name: 'Terry (AI)', aiProfileId: 'casual' },
];
const createRaceMeta = (raceId, seed) => ({
    raceId,
    courseName: 'Practice Course',
    createdAt: Date.now(),
    seed: seed ?? (0, rng_1.seedFromString)(raceId),
});
exports.createRaceMeta = createRaceMeta;
const createBoatState = (name, index, id, aiProfileId) => {
    const lineTop = Math.max(defaultStartLine.pin.y, defaultStartLine.committee.y);
    const spawnPadding = 30;
    const left = defaultStartLine.pin.x + spawnPadding;
    const right = defaultStartLine.committee.x - spawnPadding;
    const span = Math.max(60, right - left);
    const columnSpacingTarget = 80;
    const maxColumns = Math.max(1, Math.min(6, Math.floor(span / columnSpacingTarget) + 1));
    const columnCount = Math.max(1, maxColumns);
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const step = columnCount > 1 ? span / (columnCount - 1) : 0;
    const baseX = left + column * step;
    const baseY = lineTop + 120 + row * 40;
    return {
        id: id ?? (0, ids_1.createId)(`boat${index + 1}`),
        name,
        color: exports.defaultBoatColors[index % exports.defaultBoatColors.length],
        headingDeg: 0,
        desiredHeadingDeg: 0,
        lap: 0,
        nextMarkIndex: 0,
        inMarkZone: false,
        finished: false,
        finishTime: undefined,
        distanceToNextMark: undefined,
        penalties: 0,
        pos: { x: baseX, y: baseY },
        speed: 0,
        stallTimer: 0,
        overEarly: false,
        fouled: false,
        lastInputSeq: 0,
        lastInputAppliedAt: 0,
        rightsSuspended: false,
        ai: aiProfileId ? (0, profiles_1.createAiConfig)(aiProfileId) : undefined,
    };
};
exports.createBoatState = createBoatState;
const createInitialRaceState = (raceId, countdown = env_1.appEnv.countdownSeconds) => {
    const boatConfigs = env_1.appEnv.aiEnabled ? exports.AI_BOAT_CONFIGS : [];
    const boats = boatConfigs.map((config, idx) => (0, exports.createBoatState)(config.name, idx, config.id, config.aiProfileId));
    const baselineWind = env_1.appEnv.baselineWindDeg;
    const defaultMarks = [
        { x: 0, y: -240 }, // windward mark
        defaultStartLine.committee,
        defaultStartLine.pin,
        defaultLeewardGate.left,
        defaultLeewardGate.right,
    ];
    return {
        t: -countdown,
        meta: (0, exports.createRaceMeta)(raceId),
        wind: {
            directionDeg: baselineWind,
            speed: 12,
        },
        baselineWindDeg: baselineWind,
        marks: structuredCopy(defaultMarks),
        startLine: structuredCopy(defaultStartLine),
        leewardGate: structuredCopy(defaultLeewardGate),
        phase: 'prestart',
        countdownArmed: false,
        clockStartMs: null,
        hostId: undefined,
        lapsToFinish: env_1.appEnv.lapsToFinish,
        leaderboard: [],
        aiEnabled: env_1.appEnv.aiEnabled,
        boats: boats.reduce((acc, boat) => {
            acc[boat.id] = boat;
            return acc;
        }, {}),
    };
};
exports.createInitialRaceState = createInitialRaceState;
const cloneRaceState = (state) => structuredCopy(state);
exports.cloneRaceState = cloneRaceState;
