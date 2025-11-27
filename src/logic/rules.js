"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesEngine = void 0;
const constants_1 = require("./constants");
const ids_1 = require("@/utils/ids");
const clampAngle180 = (deg) => {
    let d = deg % 360;
    if (d > 180)
        d -= 360;
    if (d <= -180)
        d += 360;
    return d;
};
const degToRad = (deg) => (deg * Math.PI) / 180;
const distance = (a, b) => {
    const dx = a.pos.x - b.pos.x;
    const dy = a.pos.y - b.pos.y;
    return Math.hypot(dx, dy);
};
const getTack = (boat, windDir) => {
    const relative = clampAngle180(windDir - boat.headingDeg);
    return relative >= 0 ? 'starboard' : 'port';
};
const boatPairKey = (rule, a, b) => `${rule}:${[a, b].sort().join(':')}`;
const isRightsSuspended = (boat) => Boolean(boat.rightsSuspended);
class RulesEngine {
    constructor(cooldownSeconds = 5) {
        this.cooldownSeconds = cooldownSeconds;
        this.pairCooldowns = new Map();
        this.offenderCooldowns = new Map();
    }
    evaluate(state) {
        const boats = Object.values(state.boats);
        const results = [];
        const phase = state.phase;
        for (let i = 0; i < boats.length; i += 1) {
            for (let j = i + 1; j < boats.length; j += 1) {
                const a = boats[i];
                const b = boats[j];
                const pairs = [
                    ...this.checkRule10(state, a, b),
                    ...this.checkRule11(state, a, b),
                ];
                if (pairs.length && state.t < 0) {
                    console.debug('[rules] prestart violation', {
                        phase,
                        t: state.t,
                        rules: pairs.map((p) => p.ruleId),
                        boats: pairs.map((p) => p.boats),
                    });
                }
                results.push(...pairs);
            }
        }
        return results;
    }
    toEvents(state, resolutions) {
        if (!resolutions.length)
            return [];
        return resolutions.map((violation) => ({
            eventId: (0, ids_1.createId)('event'),
            t: state.t,
            kind: 'penalty',
            ruleId: violation.ruleId,
            boats: violation.boats,
            message: violation.message,
        }));
    }
    checkRule10(state, a, b) {
        const distanceApart = distance(a, b);
        if (distanceApart > constants_1.PORT_STARBOARD_DISTANCE)
            return [];
        const tackA = getTack(a, state.wind.directionDeg);
        const tackB = getTack(b, state.wind.directionDeg);
        if (tackA === tackB)
            return [];
        const offender = tackA === 'port' ? a : b;
        const standOn = offender === a ? b : a;
        if (isRightsSuspended(standOn) && !isRightsSuspended(offender)) {
            return [];
        }
        return this.recordOnce(state, '10', offender.id, standOn.id, {
            ruleId: '10',
            offenderId: offender.id,
            boats: [offender.id, standOn.id],
            message: `${offender.name} on port tack must keep clear of ${standOn.name}`,
        });
    }
    checkRule11(state, a, b) {
        const distanceApart = distance(a, b);
        if (distanceApart > 20)
            return [];
        const tackA = getTack(a, state.wind.directionDeg);
        const tackB = getTack(b, state.wind.directionDeg);
        if (tackA !== tackB)
            return [];
        const perpAngle = degToRad(state.wind.directionDeg + 90);
        const lineNormal = {
            x: Math.cos(perpAngle),
            y: Math.sin(perpAngle),
        };
        const project = (boat) => boat.pos.x * lineNormal.x + boat.pos.y * lineNormal.y;
        const aScore = project(a);
        const bScore = project(b);
        const windward = aScore < bScore ? a : b;
        const leeward = windward === a ? b : a;
        if (isRightsSuspended(leeward) && !isRightsSuspended(windward)) {
            return [];
        }
        return this.recordOnce(state, '11', windward.id, leeward.id, {
            ruleId: '11',
            offenderId: windward.id,
            boats: [windward.id, leeward.id],
            message: `${windward.name} (windward) must keep clear of ${leeward.name}`,
        });
    }
    recordOnce(state, ruleId, offenderId, otherBoatId, resolution) {
        const pairKey = boatPairKey(ruleId, offenderId, otherBoatId);
        const offenderKey = `${ruleId}:${offenderId}`;
        const pairExpiry = this.pairCooldowns.get(pairKey);
        if (pairExpiry !== undefined && pairExpiry > state.t)
            return [];
        const offenderExpiry = this.offenderCooldowns.get(offenderKey);
        if (offenderExpiry !== undefined && offenderExpiry > state.t)
            return [];
        this.pairCooldowns.set(pairKey, state.t + this.cooldownSeconds);
        this.offenderCooldowns.set(offenderKey, state.t + this.cooldownSeconds);
        return [resolution];
    }
}
exports.RulesEngine = RulesEngine;
