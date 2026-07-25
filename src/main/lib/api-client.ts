let BASE_URL = 'https://api.apimart.ai';
let API_KEY = '';

export function configureProvider(config: { apiKey: string; baseUrl: string }) {
  BASE_URL = config.baseUrl;
  API_KEY = config.apiKey;
}

interface ApiError {
  code: number;
  message: string;
  type: string;
}

export class ApiClientError extends Error {
  code: number;
  type: string;

  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
    this.type = err.type;
    this.name = 'ApiClientError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const errResponse = data as { error?: { code: number; message: string; type: string } };
    if (errResponse.error) {
      throw new ApiClientError(errResponse.error);
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return data as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};