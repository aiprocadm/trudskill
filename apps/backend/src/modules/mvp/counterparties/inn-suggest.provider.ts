/**
 * МГ-D1.2 (срез 13.1): подстановка реквизитов контрагента по ИНН.
 *
 * Провайдер выбирается наличием ключа `DADATA_API_KEY` (РМ113): пусто — `noop`, и ручка честно
 * говорит «подстановка не подключена — введите вручную»; ключ есть — запрос в DaData
 * (`findById/party`). Ответ плоский, с именами полей сущности `Counterparty`, чтобы форма
 * подставляла его без перевода.
 */

export interface InnSuggestion {
  inn: string;
  /** Полное наименование с формой собственности — «ООО "РОМАШКА"». */
  name: string;
  shortName?: string;
  kpp?: string;
  ogrn?: string;
  okpo?: string;
  okato?: string;
  oktmo?: string;
  okogu?: string;
  okopf?: string;
  okved?: string;
  legalAddress?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  directorName?: string;
  directorPosition?: string;
  /** Организация ликвидирована или ликвидируется — форма предупреждает. */
  liquidated: boolean;
}

export interface InnSuggestProvider {
  readonly code: 'noop' | 'dadata';
  /** Реквизиты по ИНН; `null` — провайдер такого ИНН не знает. */
  find(inn: string): Promise<InnSuggestion | null>;
}

export const INN_SUGGEST_PROVIDER = Symbol('INN_SUGGEST_PROVIDER');

/** Провайдер не подключён, не ответил вовремя или ответил ошибкой. */
export class InnSuggestUnavailableError extends Error {}

export class NoopInnSuggestProvider implements InnSuggestProvider {
  readonly code = 'noop' as const;

  async find(): Promise<InnSuggestion | null> {
    throw new InnSuggestUnavailableError('Подстановка по ИНН не подключена');
  }
}

export const DADATA_TIMEOUT_MS = 8_000;
export const DADATA_PARTY_URL =
  'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';

interface DaDataParty {
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  okpo?: string | null;
  okato?: string | null;
  oktmo?: string | null;
  okogu?: string | null;
  okved?: string | null;
  opf?: { code?: string | null } | null;
  name?: { full_with_opf?: string | null; short_with_opf?: string | null } | null;
  management?: { name?: string | null; post?: string | null } | null;
  address?: {
    value?: string | null;
    unrestricted_value?: string | null;
    data?: {
      postal_code?: string | null;
      city_with_type?: string | null;
      city?: string | null;
      region_with_type?: string | null;
    } | null;
  } | null;
  state?: { status?: string | null } | null;
}

const text = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Карточка DaData → подсказка: пустые поля не попадают в ответ. */
export function mapDaDataParty(inn: string, value: string, data: DaDataParty): InnSuggestion {
  const suggestion: InnSuggestion = {
    inn: text(data.inn) ?? inn,
    name: text(data.name?.full_with_opf) ?? value,
    liquidated: data.state?.status === 'LIQUIDATED' || data.state?.status === 'LIQUIDATING'
  };
  const optional: Omit<InnSuggestion, 'inn' | 'name' | 'liquidated'> = {
    shortName: text(data.name?.short_with_opf),
    kpp: text(data.kpp),
    ogrn: text(data.ogrn),
    okpo: text(data.okpo),
    okato: text(data.okato),
    oktmo: text(data.oktmo),
    okogu: text(data.okogu),
    okopf: text(data.opf?.code),
    okved: text(data.okved),
    legalAddress: text(data.address?.unrestricted_value) ?? text(data.address?.value),
    postalCode: text(data.address?.data?.postal_code),
    city: text(data.address?.data?.city_with_type) ?? text(data.address?.data?.city),
    region: text(data.address?.data?.region_with_type),
    directorName: text(data.management?.name),
    directorPosition: text(data.management?.post)
  };
  for (const [key, field] of Object.entries(optional)) {
    if (field !== undefined) (suggestion as unknown as Record<string, string>)[key] = field;
  }
  return suggestion;
}

export class DaDataInnSuggestProvider implements InnSuggestProvider {
  readonly code = 'dadata' as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly endpoint = DADATA_PARTY_URL
  ) {}

  async find(inn: string): Promise<InnSuggestion | null> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${this.apiKey}`
        },
        // Головная организация: у филиалов тот же ИНН, но свой КПП и адрес.
        body: JSON.stringify({ query: inn, branch_type: 'MAIN' }),
        signal: AbortSignal.timeout(DADATA_TIMEOUT_MS)
      });
    } catch {
      throw new InnSuggestUnavailableError('DaData не ответила');
    }
    if (!response.ok) {
      throw new InnSuggestUnavailableError(`DaData ответила ${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as {
      suggestions?: Array<{ value?: string; data?: DaDataParty }>;
    } | null;
    if (!body || !Array.isArray(body.suggestions)) {
      throw new InnSuggestUnavailableError('DaData прислала ответ не того вида');
    }
    const first = body.suggestions[0];
    if (!first?.data) return null;
    return mapDaDataParty(inn, first.value ?? '', first.data);
  }
}
