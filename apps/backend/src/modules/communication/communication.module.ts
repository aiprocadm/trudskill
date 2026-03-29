import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { WebinarsController } from './webinars.controller.js';
import { WebinarsService } from './webinars.service.js';

@Module({
  controllers: [NotificationsController, ChatController, WebinarsController],
  providers: [NotificationsService, ChatService, WebinarsService],
  exports: [NotificationsService, ChatService, WebinarsService]
})
export class CommunicationModule {}
