"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedFromString = exports.createSeededRandom = void 0;
const createSeededRandom = (seed) => {
    let value = seed >>> 0;
    return () => {
        value += 0x6d2b79f5;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
exports.createSeededRandom = createSeededRandom;
const seedFromString = (input) => {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return hash >>> 0;
};
exports.seedFromString = seedFromString;
