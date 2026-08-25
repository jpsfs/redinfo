import {
  DataProvider,
  fetchUtils,
  HttpError,
  GetListParams,
  GetOneParams,
  GetManyParams,
  GetManyReferenceParams,
  CreateParams,
  UpdateParams,
  UpdateManyParams,
  DeleteParams,
  DeleteManyParams,
} from 'react-admin';
import { ApiErrorCode } from '@redinfo/shared';
import { getAccessToken } from './authProvider';
import { i18nProvider } from './i18n/i18nProvider';
import { apiErrorLabel } from './i18n/labels';

const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Translates a failed mutation's message by code before react-admin's own
 * notification ever shows it (#180 phase 4) — `i18nProvider` is a plain
 * object with a `translate` method, not a hook, so this works from a data
 * provider (outside any component) the same way `apiErrorLabel` works
 * inside one via `useT()`. `error.body` is `HttpError`'s third constructor
 * argument: the whole parsed JSON response, `code`/`params` included when
 * `ApiErrorFilter` put them there.
 */
const translateHttpError = (error: unknown): never => {
  if (error instanceof HttpError) {
    const body = error.body as { code?: ApiErrorCode; params?: Record<string, string | number> } | null;
    const translated = apiErrorLabel(i18nProvider.translate, {
      message: error.message,
      code: body?.code,
      params: body?.params,
    });
    throw new HttpError(translated, error.status, error.body);
  }
  throw error;
};

const httpClient = (url: string, options: fetchUtils.Options = {}) => {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetchUtils.fetchJson(url, { ...options, headers }).catch(translateHttpError);
};

export const dataProvider: DataProvider = {
  async getList(resource: string, params: GetListParams) {
    const { page = 1, perPage = 25 } = params.pagination ?? {};
    const filterParams = params.filter
      ? Object.entries(params.filter)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const url = `${API_URL}/${resource}?page=${page}&perPage=${perPage}${filterParams ? `&${filterParams}` : ''}`;
    const { json } = await httpClient(url);
    return {
      data: json.data,
      total: json.total,
    };
  },

  async getOne(resource: string, params: GetOneParams) {
    const { json } = await httpClient(`${API_URL}/${resource}/${params.id}`);
    return { data: json };
  },

  async getMany(resource: string, params: GetManyParams) {
    const ids = params.ids.join(',');
    const { json } = await httpClient(`${API_URL}/${resource}?ids=${ids}`);
    const data = Array.isArray(json) ? json : json.data;
    return { data };
  },

  async getManyReference(resource: string, params: GetManyReferenceParams) {
    const { page = 1, perPage = 25 } = params.pagination ?? {};
    const url = `${API_URL}/${resource}?${params.target}=${params.id}&page=${page}&perPage=${perPage}`;
    const { json } = await httpClient(url);
    return {
      data: json.data,
      total: json.total,
    };
  },

  async create(resource: string, params: CreateParams) {
    const { json } = await httpClient(`${API_URL}/${resource}`, {
      method: 'POST',
      body: JSON.stringify(params.data),
    });
    return { data: json };
  },

  async update(resource: string, params: UpdateParams) {
    const { json } = await httpClient(`${API_URL}/${resource}/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(params.data),
    });
    return { data: json };
  },

  async updateMany(resource: string, params: UpdateManyParams) {
    await Promise.all(
      params.ids.map((id) =>
        httpClient(`${API_URL}/${resource}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(params.data),
        }),
      ),
    );
    return { data: params.ids };
  },

  async delete(resource: string, params: DeleteParams) {
    const { json } = await httpClient(`${API_URL}/${resource}/${params.id}`, {
      method: 'DELETE',
    });
    return { data: json };
  },

  async deleteMany(resource: string, params: DeleteManyParams) {
    await Promise.all(
      params.ids.map((id) =>
        httpClient(`${API_URL}/${resource}/${id}`, { method: 'DELETE' }),
      ),
    );
    return { data: params.ids };
  },
};
