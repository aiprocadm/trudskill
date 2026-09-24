import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';

import {
  INN_SUGGEST_PROVIDER,
  type InnSuggestProvider,
  InnSuggestUnavailableError,
  type InnSuggestion
} from './inn-suggest.provider.js';

const INN_FORMAT = /^(\d{10}|\d{12})$/;

/**
 * МГ-D1.2 (срез 13.1): «Заполнить по ИНН» на форме контрагента.
 *
 * Три честных исхода вместо одного «не получилось»: ИНН с опечаткой (400 — поправьте цифры),
 * ИНН не найден (404 `inn_not_found` — проверьте номер или введите реквизиты вручную),
 * подстановка не подключена или провайдер молчит (503 `inn_suggest_unavailable` — введите
 * вручную, это не мешает сохранить карточку).
 */
@Injectable()
export class CounterpartySuggestService {
  constructor(@Inject(INN_SUGGEST_PROVIDER) private readonly provider: InnSuggestProvider) {}

  async suggest(rawInn: string | undefined): Promise<InnSuggestion> {
    const inn = (rawInn ?? '').replace(/\s+/g, '');
    if (!INN_FORMAT.test(inn)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'ИНН — 10 цифр у организации или 12 у предпринимателя.'
      });
    }
    let found: InnSuggestion | null;
    try {
      found = await this.provider.find(inn);
    } catch (error) {
      if (error instanceof InnSuggestUnavailableError) {
        throw new ServiceUnavailableException({
          code: 'inn_suggest_unavailable',
          message: 'Подстановка реквизитов по ИНН сейчас недоступна.'
        });
      }
      throw error;
    }
    if (!found) {
      throw new NotFoundException({
        code: 'inn_not_found',
        message: `Организация с ИНН ${inn} не найдена.`
      });
    }
    return found;
  }
}
