import type { AppStoreConnectClient } from '../services/index.js';

// 顺着 links.next 把分页取完（next 是绝对地址，已带上原来的查询参数）
export async function fetchAllPages<T extends { data: any[]; included?: any[]; links?: { next?: string } }>(
  client: AppStoreConnectClient,
  url: string,
  params?: Record<string, any>,
  maxPages = 20
): Promise<T> {
  const first = await client.get<T>(url, params);
  let next = first.links?.next;
  for (let page = 1; next && page < maxPages; page++) {
    const res = await client.get<T>(next);
    first.data.push(...res.data);
    if (res.included?.length) {
      first.included = [...(first.included ?? []), ...res.included];
    }
    next = res.links?.next;
  }
  return first;
}
