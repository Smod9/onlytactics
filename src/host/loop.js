"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostLoop = void 0;
const physics_1 = require("@/logic/physics");
const rules_1 = require("@/logic/rules");
const factories_1 = require("@/state/factories");
const raceStore_1 = require("@/state/raceStore");
const rng_1 = require("@/utils/rng");
const env_1 = require("@/config/env");
const ids_1 = require("@/utils/ids");
const identity_1 = require("@/net/identity");
class HostLoop {
    constructor(store = raceStore_1.raceStore, rules = new rules_1.RulesEngine(env_1.appEnv.penaltyCooldownSeconds), tickRate = env_1.appEnv.tickRateHz, options = {}) {
        this.store = store;
        this.rules = rules;
        this.tickRate = tickRate;
        this.options = options;
        this.lastTick = 0;
        this.windTimer = 0;
        this.windShift = 0;
        this.windTargetShift = 0;
        this.windSpeedTarget = 12;
        this.startSignalSent = false;
        this.ocsBoats = new Set();
        this.penaltyHistory = new Map();
        this.raceStartWallClockMs = null;
        this.isRunning = () => Boolean(this.timer);
        const initialState = this.store.getState();
        this.windRandom = (0, rng_1.createSeededRandom)(initialState.meta.seed);
        this.windSpeedTarget = initialState.wind.speed;
        this.raceStartWallClockMs = initialState.clockStartMs;
    }
    start() {
        if (this.timer)
            return;
        this.lastTick = performance.now();
        const intervalMs = 1000 / this.tickRate;
        this.timer = window.setInterval(() => this.tick(), intervalMs);
    }
    stop() {
        if (!this.timer)
            return;
        clearInterval(this.timer);
        this.timer = undefined;
    }
    reset(state) {
        this.windRandom = (0, rng_1.createSeededRandom)(state.meta.seed);
        this.windSpeedTarget = state.wind.speed;
        this.windTimer = 0;
        this.windShift = 0;
        this.windTargetShift = 0;
        this.startSignalSent = false;
        this.ocsBoats.clear();
        this.courseSideSign = undefined;
        this.penaltyHistory.clear();
        this.raceStartWallClockMs = state.clockStartMs;
    }
    tick() {
        const now = performance.now();
        const rawDt = (now - this.lastTick) / 1000;
        const dt = Math.min(rawDt, 0.25);
        this.lastTick = now;
        const next = (0, factories_1.cloneRaceState)(this.store.getState());
        const inputs = this.store.consumeInputs();
        const countdownHeld = next.phase === 'prestart' && !next.countdownArmed;
        if (!countdownHeld) {
            (0, physics_1.stepRaceState)(next, inputs, dt);
        }
        else if (next.phase === 'prestart' && !next.countdownArmed) {
            next.t = -env_1.appEnv.countdownSeconds;
        }
        if (next.phase === 'running' && !this.raceStartWallClockMs) {
            this.raceStartWallClockMs = Date.now() - next.t * 1000;
        }
        const appliedAt = Date.now();
        Object.entries(inputs).forEach(([boatId, input]) => {
            const seq = input.seq;
            if (typeof seq !== 'number')
                return;
            const boat = next.boats[boatId];
            if (!boat)
                return;
            boat.lastInputSeq = seq;
            boat.lastInputAppliedAt = appliedAt;
        });
        this.applyWindOscillation(next, dt);
        if (next.clockStartMs) {
            next.t = (Date.now() - next.clockStartMs) / 1000;
        }
        this.checkRaceTimeout(next);
        this.updateLapProgress(next);
        const startEvents = this.updateStartLine(next);
        const rawResolutions = this.rules.evaluate(next);
        const resolutions = this.filterPenalties(rawResolutions, next.t);
        resolutions.forEach((violation) => {
            const offender = next.boats[violation.offenderId];
            if (offender)
                offender.penalties += 1;
        });
        const events = [...startEvents, ...this.rules.toEvents(next, resolutions)];
        Object.values(next.boats).forEach((boat) => {
            boat.fouled = false;
        });
        resolutions.forEach((violation) => {
            violation.boats.forEach((boatId) => {
                const boat = next.boats[boatId];
                if (boat)
                    boat.fouled = violation.offenderId === boatId;
            });
        });
        this.store.setState(next);
        this.store.appendEvents(events);
        this.options.onEvents?.(events);
        this.options.onTick?.(next, events);
    }
    applyWindOscillation(state, dt) {
        if (env_1.appEnv.fixedWind) {
            state.wind.directionDeg = state.baselineWindDeg;
            return;
        }
        const cycleSeconds = 18;
        const settleSeconds = 5;
        const shiftRange = 12;
        const speedMin = 8;
        const speedMax = 16;
        this.windTimer += dt;
        if (this.windTimer >= cycleSeconds) {
            this.windTimer = 0;
            const randomShift = (this.windRandom() - 0.5) * 2 * shiftRange;
            this.windTargetShift = (0, physics_1.clamp)(randomShift, -shiftRange, shiftRange);
            const speedDelta = (this.windRandom() - 0.5) * 2;
            this.windSpeedTarget = (0, physics_1.clamp)(this.windSpeedTarget + speedDelta, speedMin, speedMax);
        }
        const lerpFactor = Math.min(1, dt / settleSeconds);
        this.windShift += (this.windTargetShift - this.windShift) * lerpFactor;
        state.wind.directionDeg = state.baselineWindDeg + this.windShift;
        state.wind.speed += (this.windSpeedTarget - state.wind.speed) * lerpFactor;
    }
    updateLapProgress(state) {
        const marks = state.marks;
        const markCount = marks.length;
        if (!markCount)
            return;
        const lapTarget = Math.max(1, state.lapsToFinish || 1);
        Object.values(state.boats).forEach((boat) => {
            if (boat.nextMarkIndex === undefined)
                boat.nextMarkIndex = 0;
            if (boat.lap === undefined)
                boat.lap = 0;
            if (boat.finished) {
                boat.distanceToNextMark = 0;
                boat.inMarkZone = false;
                return;
            }
            const nextMark = marks[boat.nextMarkIndex % markCount];
            if (!nextMark)
                return;
            const crossed = this.didCrossMarkLine(boat, nextMark, state);
            boat.distanceToNextMark = this.distanceToLine(boat, nextMark);
            if (crossed) {
                boat.nextMarkIndex = (boat.nextMarkIndex + 1) % markCount;
                if (boat.nextMarkIndex === 0) {
                    boat.lap += 1;
                    if (boat.lap >= lapTarget) {
                        boat.finished = true;
                        boat.finishTime = state.t;
                        boat.distanceToNextMark = 0;
                    }
                }
            }
        });
        const boats = Object.values(state.boats);
        boats.sort((a, b) => this.compareLeaderboard(a, b));
        state.leaderboard = boats.map((boat) => boat.id);
    }
    compareLeaderboard(a, b) {
        if (a.finished && b.finished) {
            if ((a.finishTime ?? Infinity) !== (b.finishTime ?? Infinity)) {
                return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
            }
        }
        else if (a.finished !== b.finished) {
            return a.finished ? -1 : 1;
        }
        const aPenalty = a.penalties > 0 || a.overEarly;
        const bPenalty = b.penalties > 0 || b.overEarly;
        if (aPenalty !== bPenalty) {
            return aPenalty ? 1 : -1;
        }
        if (b.lap !== a.lap) {
            return b.lap - a.lap;
        }
        if (b.nextMarkIndex !== a.nextMarkIndex) {
            return b.nextMarkIndex - a.nextMarkIndex;
        }
        return (a.distanceToNextMark ?? Infinity) - (b.distanceToNextMark ?? Infinity);
    }
    didCrossMarkLine(boat, mark, state) {
        if (state.marks[0] === mark) {
            return this.crossedHorizontalLine(boat, mark.y, 1);
        }
        const gate = this.getGateCenter(state);
        if (gate && Math.abs(gate.y - mark.y) < 1) {
            return this.crossedHorizontalLine(boat, gate.y, -1);
        }
        return this.distanceToLine(boat, mark) <= 30;
    }
    crossedHorizontalLine(boat, lineY, direction) {
        const prevY = boat.pos.y - boat.speed;
        const currentY = boat.pos.y;
        if (direction === 1) {
            return prevY < lineY && currentY >= lineY;
        }
        return prevY > lineY && currentY <= lineY;
    }
    getGateCenter(state) {
        const { left, right } = state.leewardGate;
        return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    }
    distanceToLine(boat, point) {
        return Math.abs(boat.pos.y - point.y);
    }
    updateStartLine(state) {
        const events = [];
        state.hostId = state.hostId ?? identity_1.identity.clientId;
        const { committee, pin } = state.startLine;
        const lineVec = {
            x: pin.x - committee.x,
            y: pin.y - committee.y,
        };
        if (!this.courseSideSign) {
            const windRad = (state.baselineWindDeg * Math.PI) / 180;
            const windVec = {
                x: Math.sin(windRad),
                y: -Math.cos(windRad),
            };
            const cross = lineVec.x * windVec.y - lineVec.y * windVec.x;
            this.courseSideSign = cross >= 0 ? 1 : -1;
        }
        const beforeStart = state.t < 0;
        if (state.boats) {
            Object.values(state.boats).forEach((boat) => {
                const rel = {
                    x: boat.pos.x - committee.x,
                    y: boat.pos.y - committee.y,
                };
                const cross = lineVec.x * rel.y - lineVec.y * rel.x;
                const onCourseSide = cross * (this.courseSideSign ?? 1) > 0;
                if (boat.overEarly && !onCourseSide) {
                    boat.overEarly = false;
                    this.ocsBoats.delete(boat.id);
                    events.push({
                        eventId: (0, ids_1.createId)('event'),
                        kind: 'rule_hint',
                        t: state.t,
                        message: `${boat.name} cleared OCS`,
                        boats: [boat.id],
                        ruleId: '29',
                    });
                }
                if (beforeStart && onCourseSide) {
                    if (!boat.overEarly) {
                        boat.overEarly = true;
                        this.ocsBoats.add(boat.id);
                        events.push({
                            eventId: (0, ids_1.createId)('event'),
                            kind: 'penalty',
                            t: state.t,
                            message: `${boat.name} OCS - return below the line`,
                            boats: [boat.id],
                            ruleId: '29',
                        });
                    }
                }
            });
        }
        if (!beforeStart && !this.startSignalSent) {
            this.startSignalSent = true;
            if (this.ocsBoats.size === 0) {
                events.push({
                    eventId: (0, ids_1.createId)('event'),
                    kind: 'start_signal',
                    t: state.t,
                    message: 'Start! All clear.',
                });
            }
            else {
                events.push({
                    eventId: (0, ids_1.createId)('event'),
                    kind: 'general_recall',
                    t: state.t,
                    message: `Start: ${this.ocsBoats.size} boat(s) OCS`,
                    boats: Array.from(this.ocsBoats),
                });
            }
            this.ocsBoats.clear();
        }
        return events;
    }
    filterPenalties(resolutions, currentTime) {
        return resolutions.filter((violation) => {
            const key = `${violation.offenderId}:${violation.ruleId}`;
            const last = this.penaltyHistory.get(key);
            if (last !== undefined && currentTime - last < 10) {
                return false;
            }
            this.penaltyHistory.set(key, currentTime);
            return true;
        });
    }
    checkRaceTimeout(state) {
        if (state.phase !== 'running')
            return;
        if (!this.raceStartWallClockMs)
            return;
        const elapsedMs = Date.now() - this.raceStartWallClockMs;
        const timeoutMs = env_1.appEnv.raceTimeoutMinutes * 60000;
        if (elapsedMs < timeoutMs)
            return;
        state.phase = 'finished';
        const event = {
            eventId: (0, ids_1.createId)('event'),
            t: state.t,
            kind: 'finish',
            message: 'Race ended: time limit reached',
        };
        this.options.onEvents?.([event]);
        this.timer && clearInterval(this.timer);
        this.timer = undefined;
    }
}
exports.HostLoop = HostLoop;
