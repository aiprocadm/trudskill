import { Module } from '@nestjs/common';

import { CHAT_STATE } from './chat-state.token.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { InMemoryChatState } from './in-memory-chat.state.js';
import { InMemoryNotificationsState } from './in-memory-notifications.state.js';
import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { NOTIFICATIONS_STATE } from './notifications-state.token.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { WEBINARS_STATE } from './webinars-state.token.js';
import { WebinarsController } from './webinars.controller.js';
import { WebinarsService } from './webinars.service.js';

@Module({
  controllers: [NotificationsController, ChatController, WebinarsController],
  providers: [
    { provide: NOTIFICATIONS_STATE, useClass: InMemoryNotificationsState },
    { provide: WEBINARS_STATE, useClass: InMemoryWebinarsState },
    { provide: CHAT_STATE, useClass: InMemoryChatState },
    NotificationsService,
    WebinarsService,
    ChatService
  ],
  exports: [NotificationsService, ChatService, WebinarsService]
})
export class CommunicationModule {}
