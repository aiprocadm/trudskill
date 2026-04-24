import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller.js';
import { CHAT_REPOSITORY } from './chat.repository.js';
import { ChatService } from './chat.service.js';
import { InMemoryChatState } from './in-memory-chat.state.js';
import { InMemoryNotificationsState } from './in-memory-notifications.state.js';
import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { NOTIFICATIONS_STATE } from './notifications-state.token.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PostgresChatRepository } from './postgres-chat.repository.js';
import { PostgresWebinarsRepository } from './postgres-webinars.repository.js';
import { WebinarsController } from './webinars.controller.js';
import { WEBINARS_REPOSITORY } from './webinars.repository.js';
import { WebinarsService } from './webinars.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [NotificationsController, ChatController, WebinarsController],
  providers: [
    { provide: NOTIFICATIONS_STATE, useClass: InMemoryNotificationsState },
    PostgresChatRepository,
    { provide: CHAT_REPOSITORY, useClass: PostgresChatRepository },
    PostgresWebinarsRepository,
    { provide: WEBINARS_REPOSITORY, useClass: PostgresWebinarsRepository },
    InMemoryChatState,
    InMemoryWebinarsState,
    NotificationsService,
    WebinarsService,
    ChatService
  ],
  exports: [NotificationsService, ChatService, WebinarsService]
})
export class CommunicationModule {}
