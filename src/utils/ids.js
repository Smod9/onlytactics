"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = void 0;
const fallbackRandom = () => Math.random().toString(36).slice(2, 10);
const createId = (prefix = 'id') => {
    const base = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : fallbackRandom();
    return `${prefix}-${base}`;
};
exports.createId = createId;
