"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apparentWindAngleSigned = exports.computeVmgAngles = exports.degreesBetween = exports.computeRelativeBearing = exports.stepRaceState = exports.headingFromAwa = exports.angleDiff = exports.quantizeHeading = exports.normalizeDeg = exports.radToDeg = exports.degToRad = exports.clamp = void 0;
const constants_1 = require("./constants");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
exports.clamp = clamp;
const degToRad = (deg) => (deg * Math.PI) / 180;
exports.degToRad = degToRad;
const radToDeg = (rad) => (rad * 180) / Math.PI;
exports.radToDeg = radToDeg;
const normalizeDeg = (deg) => {
    const wrapped = deg % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
};
exports.normalizeDeg = normalizeDeg;
const quantizeHeading = (deg) => {
    const rounded = Math.round((0, exports.normalizeDeg)(deg));
    const wrapped = rounded % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
};
exports.quantizeHeading = quantizeHeading;
const angleDiff = (targetDeg, currentDeg) => {
    let diff = targetDeg - currentDeg;
    diff = ((diff + 180) % 360 + 360) % 360 - 180;
    return diff;
};
exports.angleDiff = angleDiff;
const headingFromAwa = (windDirDeg, awaDeg) => (0, exports.normalizeDeg)(windDirDeg + awaDeg);
exports.headingFromAwa = headingFromAwa;
const apparentWindAngle = (boatHeadingDeg, windDirDeg) => (0, exports.angleDiff)(boatHeadingDeg, windDirDeg);
const polarTable = [
    { awa: 0, ratio: 0 },
    { awa: 30, ratio: 0.45 },
    { awa: 45, ratio: 0.65 },
    { awa: 60, ratio: 0.8 },
    { awa: 75, ratio: 0.9 },
    { awa: 90, ratio: 0.95 },
    { awa: 110, ratio: 1.05 },
    { awa: 135, ratio: 1.15 },
    { awa: 150, ratio: 1.05 },
    { awa: 170, ratio: 0.95 },
    { awa: 180, ratio: 0.9 },
];
const lookupPolarRatio = (awa) => {
    const absAwa = (0, exports.clamp)(Math.abs(awa), 0, 180);
    for (let i = 0; i < polarTable.length - 1; i += 1) {
        const current = polarTable[i];
        const next = polarTable[i + 1];
        if (absAwa >= current.awa && absAwa <= next.awa) {
            const span = next.awa - current.awa || 1;
            const t = (absAwa - current.awa) / span;
            return current.ratio + (next.ratio - current.ratio) * t;
        }
    }
    return polarTable[polarTable.length - 1].ratio;
};
const polarTargetSpeed = (awaDeg, windSpeed, sheet) => {
    const ratio = lookupPolarRatio(awaDeg);
    const sheetEffect = 0.6 + 0.4 * (0, exports.clamp)(sheet, 0, 1);
    const target = windSpeed * ratio * sheetEffect;
    return (0, exports.clamp)(target, 0, constants_1.MAX_SPEED_KTS);
};
const smoothSpeed = (current, target, dt) => {
    const rate = target > current ? constants_1.ACCELERATION_RATE : constants_1.DECELERATION_RATE;
    const mix = (0, exports.clamp)(rate * dt, 0, 1);
    return current + (target - current) * mix;
};
const clampDesiredHeading = (boat, desiredHeadingDeg, windDirDeg) => {
    const diff = (0, exports.angleDiff)(desiredHeadingDeg, windDirDeg);
    const absDiff = Math.abs(diff);
    if (absDiff < constants_1.NO_GO_ANGLE_DEG) {
        boat.stallTimer = constants_1.STALL_DURATION_S;
        const sign = diff >= 0 ? 1 : -1;
        const clamped = (0, exports.headingFromAwa)(windDirDeg, sign * constants_1.NO_GO_ANGLE_DEG);
        boat.desiredHeadingDeg = clamped;
        return clamped;
    }
    if (absDiff > constants_1.MAX_DOWNWIND_ANGLE_DEG) {
        const sign = diff >= 0 ? 1 : -1;
        const clamped = (0, exports.headingFromAwa)(windDirDeg, sign * constants_1.MAX_DOWNWIND_ANGLE_DEG);
        boat.desiredHeadingDeg = clamped;
        return clamped;
    }
    boat.desiredHeadingDeg = (0, exports.normalizeDeg)(desiredHeadingDeg);
    return boat.desiredHeadingDeg;
};
const steerTowardsDesired = (boat, dt) => {
    const error = (0, exports.angleDiff)(boat.desiredHeadingDeg, boat.headingDeg);
    if (Math.abs(error) <= constants_1.HEADING_STEP_DEG + 0.2) {
        boat.headingDeg = (0, exports.normalizeDeg)(boat.desiredHeadingDeg);
        return;
    }
    const maxTurn = constants_1.TURN_RATE_DEG * dt;
    const applied = (0, exports.clamp)(error, -maxTurn, maxTurn);
    boat.headingDeg = (0, exports.normalizeDeg)(boat.headingDeg + applied);
};
const applyStallDecay = (boat, dt) => {
    if (boat.stallTimer <= 0)
        return;
    boat.stallTimer = Math.max(0, boat.stallTimer - dt);
};
const stepRaceState = (state, inputs, dt) => {
    state.t += dt;
    if (state.phase === 'prestart' && state.t >= 0) {
        state.phase = 'running';
    }
    Object.values(state.boats).forEach((boat) => {
        const input = inputs[boat.id];
        const desiredHeading = input?.desiredHeadingDeg ?? boat.desiredHeadingDeg ?? boat.headingDeg;
        clampDesiredHeading(boat, desiredHeading, state.wind.directionDeg);
        steerTowardsDesired(boat, dt);
        applyStallDecay(boat, dt);
        const awa = apparentWindAngle(boat.headingDeg, state.wind.directionDeg);
        let targetSpeed = polarTargetSpeed(awa, state.wind.speed, constants_1.DEFAULT_SHEET);
        if (boat.stallTimer > 0) {
            targetSpeed *= constants_1.STALL_SPEED_FACTOR;
        }
        boat.speed = smoothSpeed(boat.speed, targetSpeed, dt);
        const courseRad = (0, exports.degToRad)(boat.headingDeg);
        const speedMs = boat.speed * constants_1.KNOTS_TO_MS;
        boat.pos.x += Math.sin(courseRad) * speedMs * dt;
        boat.pos.y -= Math.cos(courseRad) * speedMs * dt;
    });
};
exports.stepRaceState = stepRaceState;
const computeRelativeBearing = (headingDeg, otherHeadingDeg) => {
    return (0, exports.angleDiff)(otherHeadingDeg, headingDeg);
};
exports.computeRelativeBearing = computeRelativeBearing;
const degreesBetween = (a, b) => Math.abs((0, exports.radToDeg)(Math.atan2(Math.sin((0, exports.degToRad)(a - b)), Math.cos((0, exports.degToRad)(a - b)))));
exports.degreesBetween = degreesBetween;
const computeVmgAngles = (windSpeed) => {
    let bestUpAngle = constants_1.NO_GO_ANGLE_DEG;
    let bestUpValue = -Infinity;
    let bestDownAngle = constants_1.MAX_DOWNWIND_ANGLE_DEG;
    let bestDownValue = -Infinity;
    for (let angle = constants_1.NO_GO_ANGLE_DEG; angle <= constants_1.MAX_DOWNWIND_ANGLE_DEG; angle += 1) {
        const speed = polarTargetSpeed(angle, windSpeed, constants_1.DEFAULT_SHEET);
        const rad = (0, exports.degToRad)(angle);
        const upwindVmg = speed * Math.cos(rad);
        if (angle <= 90 && upwindVmg > bestUpValue) {
            bestUpValue = upwindVmg;
            bestUpAngle = angle;
        }
        const downwindVmg = speed * Math.cos(Math.PI - rad);
        if (angle >= 60 && downwindVmg > bestDownValue) {
            bestDownValue = downwindVmg;
            bestDownAngle = angle;
        }
    }
    return {
        upwindAwa: bestUpAngle,
        downwindAwa: bestDownAngle,
    };
};
exports.computeVmgAngles = computeVmgAngles;
exports.apparentWindAngleSigned = apparentWindAngle;
