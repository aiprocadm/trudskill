import { describe, expect, it } from 'vitest';
describe('shared-types', () => {
    it('exposes HealthStatus type shape', () => {
        const value = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'backend'
        };
        expect(value.status).toBe('ok');
    });
});
//# sourceMappingURL=smoke.test.js.map