import { describe, expect, it } from 'vitest';

import { VideoPlaybackController } from './video-playback.controller.js';
import { REQUIRED_PERMISSIONS } from '../../iam/permission.decorator.js';

/**
 * Журнал учебных часов группы — под правом на группы, а не на прогресс (журнал 341).
 *
 * `progress.read` есть у роли `learner` — оно разрешает видеть СВОЙ прогресс, и списки
 * под ним сервис режет по актору. Журнал группы — не список, а реестр: имена, статусы
 * зачисления и часы всех слушателей группы, резать там нечего. Под `progress.read` его
 * читал любой слушатель центра по идентификатору группы из собственного зачисления.
 * Право реестра — `groups.read`: то же, что у карточки группы (`GET /groups/:id`) и её
 * сводки (`GET /groups/:id/progress-summary`), и у экрана `/groups/:id`, где журнал живёт.
 */
describe('VideoPlaybackController — журнал часов группы закрыт правом на группы', () => {
  it.each(['learningJournal', 'learningJournalCsv', 'learningJournalXlsx'] as const)(
    '%s требует groups.read',
    (method) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS, VideoPlaybackController.prototype[method])
      ).toEqual(['groups.read']);
    }
  );
});
