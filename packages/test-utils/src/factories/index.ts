import { EntityStatus, UserStatus, type TenantId } from '../../../shared-types/src/index.ts';

const randomId = (): string => crypto.randomUUID();

export const tenantFactory = () => ({ id: randomId() as TenantId, name: 'Test Tenant' });
export const userFactory = () => ({ id: randomId(), status: UserStatus.Active, email: 'user@example.com' });
export const roleFactory = () => ({ id: randomId(), code: 'admin', name: 'Administrator' });
export const learnerFactory = () => ({ id: randomId(), status: EntityStatus.Active, fullName: 'Test Learner' });
export const courseFactory = () => ({ id: randomId(), title: 'Course', status: EntityStatus.Active });
export const groupFactory = () => ({ id: randomId(), title: 'Group A' });
export const enrollmentFactory = () => ({ id: randomId(), learnerId: randomId(), courseId: randomId() });
export const asyncTaskFactory = () => ({ id: randomId(), status: 'queued' as const });
export const documentTemplateFactory = () => ({ id: randomId(), name: 'Template 1', version: 1 });
