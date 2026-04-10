import { Injectable } from '@nestjs/common';

import type { NotificationEntity } from './notifications.service.js';

@Injectable()
export class InMemoryNotificationsState {
  notifications: NotificationEntity[] = [];
}
