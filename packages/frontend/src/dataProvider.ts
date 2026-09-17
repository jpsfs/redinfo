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
import { refreshAccessToken } from './authRefresh';
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

/**
 * Retries once with a refreshed access token on a 401 — see `authRefresh`'s
 * doc comment for why: a short-lived access token can go stale mid-session
 * without anything having checked, and the refresh token underneath it may
 * still be perfectly valid.
 */
const httpClient = async (url: string, options: fetchUtils.Options = {}) => {
  const attempt = (token: string | null) => {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetchUtils.fetchJson(url, { ...options, headers });
  };

  try {
    return await attempt(getAccessToken());
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) return translateHttpError(error);
    const refreshed = await refreshAccessToken();
    if (!refreshed) return translateHttpError(error);
    try {
      return await attempt(refreshed);
    } catch (retryError) {
      return translateHttpError(retryError);
    }
  }
};

/**
 * Structural equality for the JSON-shaped values a record holds: primitives,
 * arrays, and plain objects. Good enough for diffing a submitted form value
 * against the stored record — nothing here carries functions or class
 * instances; dates travel as ISO strings, which `===` already handles.
 */
function isEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => isEqualValue(item, b[i]))
    );
  }
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  return aKeys.length === bKeys.length && aKeys.every((key) => isEqualValue(aRec[key], bRec[key]));
}

/**
 * Only the fields that actually changed. `id` is always dropped — it
 * identifies the URL, not a field to PATCH, and no update DTO declares it.
 *
 * Why this exists: react-admin's `<Edit>` form seeds its `defaultValues` from
 * the *whole* fetched record (`getFormInitialValues` merges `record` in) and
 * submits every field, not only the ones an `<Input>` renders — including
 * server-computed fields no DTO declares (`createdAt`, `certifications`,
 * `isDriver`, …). The backend's `ValidationPipe({ forbidNonWhitelisted: true
 * })` 400s on any of those, so an unfiltered `update()` fails on every save
 * from every `<Edit>` screen, not just the fields a user actually touched.
 * Diffing against `previousData` (which react-admin always supplies for a
 * regular, non-optimistic update) is the fix, and it is strictly safer than
 * sending everything: several update services (e.g. `MaterialItemsService`)
 * treat "field present" as "replace the whole related collection", so
 * resending an unchanged array-valued field can churn rows for no reason.
 * Without `previousData` (some custom callers build an `UpdateParams` by
 * hand) there is nothing to diff against, so everything except `id` goes.
 */
function changedFields(
  data: Record<string, unknown>,
  previousData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id') continue;
    if (previousData && isEqualValue(value, previousData[key])) continue;
    changed[key] = value;
  }
  return changed;
}

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
    const changed = changedFields(
      params.data as Record<string, unknown>,
      params.previousData as Record<string, unknown> | undefined,
    );
    if (Object.keys(changed).length === 0) {
      // Nothing to save — most often a coordinator resaving a form they
      // didn't actually edit. Skip the round trip rather than PATCH `{}`.
      return { data: params.data };
    }
    const { json } = await httpClient(`${API_URL}/${resource}/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(changed),
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
