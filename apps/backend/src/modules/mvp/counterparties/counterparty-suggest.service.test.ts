import { describe, expect, it, vi } from 'vitest';

import { CounterpartySuggestService } from './counterparty-suggest.service.js';
import {
  DADATA_PARTY_URL,
  DaDataInnSuggestProvider,
  type InnSuggestProvider,
  InnSuggestUnavailableError,
  type InnSuggestion,
  NoopInnSuggestProvider
} from './inn-suggest.provider.js';

/** Обезличенная карточка в форме ответа DaData `findById/party`. */
const DADATA_BODY = {
  suggestions: [
    {
      value: 'ООО "РОМАШКА"',
      data: {
        inn: '7707083893',
        kpp: '773601001',
        ogrn: '1027700132195',
        okpo: '00032537',
        okato: '45293554000',
        oktmo: '45397000000',
        okogu: '4100501',
        okved: '64.19',
        opf: { code: '12267' },
        name: {
          full_with_opf: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "РОМАШКА"',
          short_with_opf: 'ООО "РОМАШКА"'
        },
        management: { name: 'Иванов Иван Иванович', post: 'ГЕНЕРАЛЬНЫЙ ДИРЕКТОР' },
        address: {
          value: 'г Москва, ул Вавилова, д 19',
          unrestricted_value: '117312, г Москва, ул Вавилова, д 19',
          data: { postal_code: '117312', city_with_type: 'г Москва', region_with_type: 'г Москва' }
        },
        state: { status: 'ACTIVE' }
      }
    }
  ]
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const fakeProvider = (find: InnSuggestProvider['find']): InnSuggestProvider => ({
  code: 'dadata',
  find
});

describe('подстановка реквизитов по ИНН (МГ-D1.2, срез 13.1)', () => {
  it('DaData: запрос головной организации с ключом и сроком, ответ — поля сущности', async () => {
    const fetchImpl = vi.fn(async () => json(DADATA_BODY));
    const provider = new DaDataInnSuggestProvider('secret-key', fetchImpl as typeof fetch);

    const found = await provider.find('7707083893');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DADATA_PARTY_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Token secret-key');
    expect(JSON.parse(String(init.body))).toEqual({ query: '7707083893', branch_type: 'MAIN' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(found).toEqual<InnSuggestion>({
      inn: '7707083893',
      name: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "РОМАШКА"',
      shortName: 'ООО "РОМАШКА"',
      kpp: '773601001',
      ogrn: '1027700132195',
      okpo: '00032537',
      okato: '45293554000',
      oktmo: '45397000000',
      okogu: '4100501',
      okopf: '12267',
      okved: '64.19',
      legalAddress: '117312, г Москва, ул Вавилова, д 19',
      postalCode: '117312',
      city: 'г Москва',
      region: 'г Москва',
      directorName: 'Иванов Иван Иванович',
      directorPosition: 'ГЕНЕРАЛЬНЫЙ ДИРЕКТОР',
      liquidated: false
    });
  });

  it('DaData: пустой список — «не найдено», ошибка сервера и обрыв — «недоступно»', async () => {
    const empty = new DaDataInnSuggestProvider('k', (async () =>
      json({ suggestions: [] })) as typeof fetch);
    await expect(empty.find('7707083893')).resolves.toBeNull();

    const failing = new DaDataInnSuggestProvider('k', (async () =>
      json({ message: 'Forbidden' }, 403)) as typeof fetch);
    await expect(failing.find('7707083893')).rejects.toBeInstanceOf(InnSuggestUnavailableError);

    const timeout = new DaDataInnSuggestProvider('k', (async () => {
      throw new DOMException('timeout', 'TimeoutError');
    }) as typeof fetch);
    await expect(timeout.find('7707083893')).rejects.toBeInstanceOf(InnSuggestUnavailableError);
  });

  it('служба: кривой ИНН — 400 до вызова провайдера; не найдено — 404; нет ключа — 503', async () => {
    const find = vi.fn(async () => null);
    const service = new CounterpartySuggestService(fakeProvider(find));

    await expect(service.suggest('12-34')).rejects.toMatchObject({
      response: { code: 'validation_error' }
    });
    expect(find).not.toHaveBeenCalled();

    await expect(service.suggest('7707 083 893')).rejects.toMatchObject({
      status: 404,
      response: { code: 'inn_not_found' }
    });
    expect(find).toHaveBeenCalledWith('7707083893');

    const noKey = new CounterpartySuggestService(new NoopInnSuggestProvider());
    await expect(noKey.suggest('7707083893')).rejects.toMatchObject({
      status: 503,
      response: { code: 'inn_suggest_unavailable' }
    });
  });

  it('служба: найденные реквизиты отдаются как есть, ликвидация помечена', async () => {
    const liquidated: InnSuggestion = { inn: '500100732259', name: 'ИП Петров', liquidated: true };
    const service = new CounterpartySuggestService(fakeProvider(async () => liquidated));
    await expect(service.suggest('500100732259')).resolves.toEqual(liquidated);
  });
});
