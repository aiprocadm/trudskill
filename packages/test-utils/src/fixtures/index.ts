import { tenantFactory, userFactory } from '../factories/index';

export const authFixture = () => ({ user: userFactory(), token: 'Bearer test-token' });
export const tenantFixture = () => tenantFactory();
export const seedReferenceDataFixture = () => ({ roles: ['admin', 'manager', 'teacher'], statuses: ['active', 'inactive'] });
