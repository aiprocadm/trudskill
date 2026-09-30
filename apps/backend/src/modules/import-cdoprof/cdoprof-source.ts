import { CdoprofApiClient } from './sources/cdoprof-api-client.js';
import { HttpCdoprofTransport } from './sources/http-cdoprof-transport.js';

/** Откуда брать API CDOPROF для центра; `null` — источник центру не подключён. */
export interface CdoprofSourceFactory {
  clientFor(tenantId: string): CdoprofApiClient | null;
}

export const CDOPROF_SOURCE = Symbol('CDOPROF_SOURCE');

/**
 * РМ134: до переноса ключа в `integration.credentials` он лежит в окружении стенда, как у
 * скрипта Фазы 0 (РМ16). Ключ принадлежит ОДНОМУ учебному центру, поэтому он привязан к
 * центру явно (`CDOPROF_IMPORT_TENANT_ID`): без привязки администратор любого другого центра
 * того же стенда мог бы затянуть к себе чужих слушателей. Нет любого из трёх — не подключено.
 */
export const envCdoprofSource = (env: {
  CDOPROF_API_BASE_URL: string;
  CDOPROF_API_KEY: string;
  CDOPROF_IMPORT_TENANT_ID: string;
}): CdoprofSourceFactory => ({
  clientFor: (tenantId) => {
    if (!env.CDOPROF_API_BASE_URL || !env.CDOPROF_API_KEY || !env.CDOPROF_IMPORT_TENANT_ID) {
      return null;
    }
    if (env.CDOPROF_IMPORT_TENANT_ID !== tenantId) return null;
    return new CdoprofApiClient(
      new HttpCdoprofTransport({ baseUrl: env.CDOPROF_API_BASE_URL, apiKey: env.CDOPROF_API_KEY })
    );
  }
});
