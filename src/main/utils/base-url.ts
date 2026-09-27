/**
 * 接口域名已迁移到 apib.ai。
 * 抽成纯函数是为了能直接单测——历史配置里的旧域名必须一次性改写，
 * 否则老用户升级后还会打向已经不再维护的地址。
 */
const LEGACY_HOST = 'apimart.ai';
const CURRENT_HOST = 'apib.ai';

export const DEFAULT_BASE_URL = 'https://api.apib.ai';

/** 把配置里的旧域名替换成新域名；已经是新域名或自定义地址时原样返回 */
export function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) return DEFAULT_BASE_URL;
  return baseUrl.replace(LEGACY_HOST, CURRENT_HOST);
}

export function isLegacyBaseUrl(baseUrl: string): boolean {
  return !!baseUrl && baseUrl.includes(LEGACY_HOST);
}
