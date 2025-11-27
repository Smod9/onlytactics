"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const env_1 = require("../src/lib/env");
const baseUrl = process.env.COLYSEUS_BASE_URL ??
    `http://${env_1.env.hostname === '0.0.0.0' ? '127.0.0.1' : env_1.env.hostname}:${env_1.env.port}`;
const target = new URL('/health', baseUrl);
const run = () => new Promise((resolve, reject) => {
    const request = node_http_1.default.get(target, (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
            raw += chunk;
        });
        response.on('end', () => {
            try {
                const payload = JSON.parse(raw);
                console.info('[smoke] Health response:', payload);
                if (payload.status === 'ok') {
                    console.info('[smoke] ✅ Server responded successfully');
                    resolve();
                }
                else {
                    reject(new Error(`Unexpected payload: ${raw}`));
                }
            }
            catch (error) {
                reject(error);
            }
        });
    });
    request.on('error', (error) => reject(error));
    request.setTimeout(5000, () => {
        request.destroy(new Error('Timed out waiting for response'));
    });
});
run()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error('[smoke] ❌ Server health check failed:', error);
    process.exit(1);
});
