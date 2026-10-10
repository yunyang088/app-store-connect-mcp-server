import type { AppStoreConnectClient } from '../services/index.js';
import type { ListTerritoriesResponse } from '../types/index.js';
import { fetchAllPages } from './pagination.js';

export async function fetchAllTerritoryIds(client: AppStoreConnectClient): Promise<string[]> {
  const res = await fetchAllPages<ListTerritoriesResponse>(client, '/territories', { limit: 200 });
  return res.data.map((t) => t.id);
}

// 显式给出地区列表就用它，否则取全部地区；两种情况都再去掉 excludeTerritoryIds（如 CHN）
// 两个列表都要校验：排除列表里写错的代码（如 CN）不会匹配任何地区，不校验就会静默上架到本想排除的地区
// 调用方已经取过全部地区时传 allTerritoryIds，省一次请求
export async function resolveTerritoryIds(
  client: AppStoreConnectClient,
  territoryIds?: string[],
  excludeTerritoryIds?: string[],
  allTerritoryIds?: string[]
): Promise<string[]> {
  if (!territoryIds?.length && excludeTerritoryIds === undefined) {
    throw new Error('Provide territoryIds, or excludeTerritoryIds (pass [] to select all territories)');
  }
  const all = allTerritoryIds ?? (await fetchAllTerritoryIds(client));
  const known = new Set(all);
  const unknown = [...new Set([...(territoryIds ?? []), ...(excludeTerritoryIds ?? [])])].filter((id) => !known.has(id));
  if (unknown.length) {
    throw new Error(`Unknown territory IDs: ${unknown.join(', ')}. Use the 3-letter IDs from list_territories, e.g. USA, CHN`);
  }
  const base = territoryIds?.length ? territoryIds : all;
  const excluded = new Set(excludeTerritoryIds ?? []);
  return base.filter((id) => !excluded.has(id));
}
