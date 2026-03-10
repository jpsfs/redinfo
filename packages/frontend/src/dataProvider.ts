import {
  DataProvider,
  fetchUtils,
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
import { getAccessToken } from './authProvider';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const httpClient = (url: string, options: fetchUtils.Options = {}) => {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetchUtils.fetchJson(url, { ...options, headers });
};

export const dataProvider: DataProvider = {
  async getList(resource: string, params: GetListParams) {
    const { page, perPage } = params.pagination;
    const url = `${API_URL}/${resource}?page=${page}&perPage=${perPage}`;
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
    const { page, perPage } = params.pagination;
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
