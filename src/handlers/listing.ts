import { AppStoreConnectClient, API_V2_BASE } from '../services/index.js';
import {
  AppCategoryRelationships,
  AppStoreReleaseType,
  AppStoreReviewDetailAttributes,
  JsonApiListResponse,
  JsonApiSingleResponse,
  ListTerritoriesResponse,
  TerritoryAvailabilityAttributes
} from '../types/index.js';
import { validateRequired } from '../utils/index.js';
import { resolveEditableAppInfoId } from './localizations.js';

const CATEGORY_RELATIONSHIPS: (keyof AppCategoryRelationships)[] = [
  'primaryCategory',
  'primarySubcategoryOne',
  'primarySubcategoryTwo',
  'secondaryCategory',
  'secondarySubcategoryOne',
  'secondarySubcategoryTwo'
];

const REVIEW_DETAIL_FIELDS: (keyof AppStoreReviewDetailAttributes)[] = [
  'contactFirstName',
  'contactLastName',
  'contactPhone',
  'contactEmail',
  'demoAccountName',
  'demoAccountPassword',
  'demoAccountRequired',
  'notes'
];

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

export async function fetchAllTerritoryIds(client: AppStoreConnectClient): Promise<string[]> {
  const res = await fetchAllPages<ListTerritoriesResponse>(client, '/territories', { limit: 200 });
  return res.data.map((t) => t.id);
}

// 显式给出地区列表就用它，否则取全部地区；两种情况都再去掉 excludeTerritoryIds（如 CHN）
export async function resolveTerritoryIds(
  client: AppStoreConnectClient,
  territoryIds?: string[],
  excludeTerritoryIds?: string[]
): Promise<string[]> {
  if (!territoryIds?.length && excludeTerritoryIds === undefined) {
    throw new Error('Provide territoryIds, or excludeTerritoryIds (pass [] to select all territories)');
  }
  const base = territoryIds?.length ? territoryIds : await fetchAllTerritoryIds(client);
  const excluded = new Set(excludeTerritoryIds ?? []);
  return base.filter((id) => !excluded.has(id));
}

const pick = <T extends object>(source: T, keys: (keyof T)[]): Partial<T> =>
  Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]])) as Partial<T>;

// 商店上架要填的其他信息：年龄分级、分类、审核联系人、版本属性和构建版本、App 价格、销售范围
export class ListingHandlers {
  constructor(private client: AppStoreConnectClient) {}

  private async resolveAppInfoId(args: { appInfoId?: string; appId?: string }): Promise<string> {
    if (args.appInfoId) return args.appInfoId;
    if (!args.appId) {
      throw new Error('Either appInfoId or appId is required');
    }
    return resolveEditableAppInfoId(this.client, args.appId);
  }

  // ---- 地区 ----

  async listTerritories(_args: Record<string, unknown> = {}): Promise<{ count: number; territories: { id: string; currency?: string }[] }> {
    const res = await fetchAllPages<ListTerritoriesResponse>(this.client, '/territories', {
      limit: 200,
      'fields[territories]': 'currency'
    });
    return {
      count: res.data.length,
      territories: res.data.map((t) => ({ id: t.id, currency: t.attributes?.currency }))
    };
  }

  // ---- 年龄分级 ----

  async getAgeRatingDeclaration(args: { appInfoId?: string; appId?: string }): Promise<JsonApiSingleResponse & { appInfoId: string }> {
    const appInfoId = await this.resolveAppInfoId(args);
    const res = await this.client.get<JsonApiSingleResponse>(`/appInfos/${appInfoId}/ageRatingDeclaration`);
    return { appInfoId, ...res };
  }

  async updateAgeRatingDeclaration(args: {
    ageRatingDeclarationId?: string;
    appInfoId?: string;
    appId?: string;
    attributes: Record<string, unknown>;
  }): Promise<JsonApiSingleResponse> {
    const { attributes } = args;
    validateRequired(args, ['attributes']);
    if (typeof attributes !== 'object' || !Object.keys(attributes).length) {
      throw new Error('attributes must be a non-empty object');
    }

    const id = args.ageRatingDeclarationId ?? (await this.getAgeRatingDeclaration(args)).data.id;
    return this.client.patch<JsonApiSingleResponse>(`/ageRatingDeclarations/${id}`, {
      data: { type: 'ageRatingDeclarations', id, attributes }
    });
  }

  // ---- 分类 ----

  async listAppCategories(args: { platform?: string } = {}): Promise<{ id: string; platforms?: string[]; subcategories: string[] }[]> {
    const { platform = 'IOS' } = args;
    const res = await this.client.get<JsonApiListResponse>('/appCategories', {
      'filter[platforms]': platform,
      'exists[parent]': false,
      include: 'subcategories',
      'limit[subcategories]': 50,
      limit: 200
    });
    return res.data.map((c) => ({
      id: c.id,
      platforms: c.attributes?.platforms,
      subcategories: (c.relationships?.subcategories?.data ?? []).map((s: { id: string }) => s.id)
    }));
  }

  async getAppInfoCategories(args: { appInfoId?: string; appId?: string }): Promise<Record<string, string | null>> {
    const appInfoId = await this.resolveAppInfoId(args);
    const res = await this.client.get<JsonApiSingleResponse>(`/appInfos/${appInfoId}`, {
      include: CATEGORY_RELATIONSHIPS.join(','),
      'fields[appInfos]': ['state', ...CATEGORY_RELATIONSHIPS].join(',')
    });
    return {
      appInfoId,
      state: res.data.attributes?.state ?? null,
      ...Object.fromEntries(CATEGORY_RELATIONSHIPS.map((r) => [r, res.data.relationships?.[r]?.data?.id ?? null]))
    };
  }

  async updateAppInfoCategories(args: { appInfoId?: string; appId?: string } & {
    [K in keyof AppCategoryRelationships]?: string | null;
  }): Promise<Record<string, string | null>> {
    const appInfoId = await this.resolveAppInfoId(args);

    // 传 null 表示清空该分类
    const relationships = Object.fromEntries(
      CATEGORY_RELATIONSHIPS.filter((r) => args[r] !== undefined).map((r) => [
        r,
        { data: args[r] ? { type: 'appCategories', id: args[r] } : null }
      ])
    );
    if (!Object.keys(relationships).length) {
      throw new Error(`At least one of ${CATEGORY_RELATIONSHIPS.join(', ')} is required`);
    }

    await this.client.patch(`/appInfos/${appInfoId}`, {
      data: { type: 'appInfos', id: appInfoId, relationships }
    });
    return this.getAppInfoCategories({ appInfoId });
  }

  // ---- 审核信息 ----

  async getAppStoreReviewDetail(args: { appStoreVersionId: string }): Promise<JsonApiSingleResponse> {
    validateRequired(args, ['appStoreVersionId']);
    return this.client.get<JsonApiSingleResponse>(`/appStoreVersions/${args.appStoreVersionId}/appStoreReviewDetail`);
  }

  async createAppStoreReviewDetail(args: { appStoreVersionId: string } & AppStoreReviewDetailAttributes): Promise<JsonApiSingleResponse> {
    validateRequired(args, ['appStoreVersionId']);
    return this.client.post<JsonApiSingleResponse>('/appStoreReviewDetails', {
      data: {
        type: 'appStoreReviewDetails',
        attributes: pick(args, REVIEW_DETAIL_FIELDS),
        relationships: {
          appStoreVersion: { data: { type: 'appStoreVersions', id: args.appStoreVersionId } }
        }
      }
    });
  }

  async updateAppStoreReviewDetail(args: { appStoreReviewDetailId: string } & AppStoreReviewDetailAttributes): Promise<JsonApiSingleResponse> {
    validateRequired(args, ['appStoreReviewDetailId']);
    const attributes = pick(args, REVIEW_DETAIL_FIELDS);
    if (!Object.keys(attributes).length) {
      throw new Error(`At least one of ${REVIEW_DETAIL_FIELDS.join(', ')} is required`);
    }
    return this.client.patch<JsonApiSingleResponse>(`/appStoreReviewDetails/${args.appStoreReviewDetailId}`, {
      data: { type: 'appStoreReviewDetails', id: args.appStoreReviewDetailId, attributes }
    });
  }

  // ---- 版本属性 / 构建版本 ----

  async updateAppStoreVersion(args: {
    appStoreVersionId: string;
    versionString?: string;
    copyright?: string;
    releaseType?: AppStoreReleaseType;
    earliestReleaseDate?: string | null;
    downloadable?: boolean;
  }): Promise<JsonApiSingleResponse> {
    const { appStoreVersionId, releaseType, earliestReleaseDate } = args;
    validateRequired(args, ['appStoreVersionId']);

    if (earliestReleaseDate) {
      if (isNaN(new Date(earliestReleaseDate).getTime())) {
        throw new Error('Invalid earliestReleaseDate. Use ISO 8601 format (e.g., 2026-10-31T00:00:00Z)');
      }
      if (releaseType && releaseType !== 'SCHEDULED') {
        throw new Error('earliestReleaseDate can only be set when releaseType is SCHEDULED');
      }
    }

    const attributes = pick(args, ['versionString', 'copyright', 'releaseType', 'earliestReleaseDate', 'downloadable']);
    if (!Object.keys(attributes).length) {
      throw new Error('At least one of versionString, copyright, releaseType, earliestReleaseDate or downloadable is required');
    }
    return this.client.patch<JsonApiSingleResponse>(`/appStoreVersions/${appStoreVersionId}`, {
      data: { type: 'appStoreVersions', id: appStoreVersionId, attributes }
    });
  }

  async setAppStoreVersionBuild(args: { appStoreVersionId: string; buildId: string }): Promise<{ success: boolean; appStoreVersionId: string; buildId: string }> {
    const { appStoreVersionId, buildId } = args;
    validateRequired(args, ['appStoreVersionId', 'buildId']);
    await this.client.patch(`/appStoreVersions/${appStoreVersionId}/relationships/build`, {
      data: { type: 'builds', id: buildId }
    });
    return { success: true, appStoreVersionId, buildId };
  }

  // ---- App 价格 ----

  async listAppPricePoints(args: {
    appId: string;
    territory?: string;
    customerPrice?: string;
  }): Promise<{ appId: string; territory: string; count: number; pricePoints: { id: string; customerPrice?: string; proceeds?: string; territory?: string }[] }> {
    const { appId, territory = 'USA', customerPrice } = args;
    validateRequired(args, ['appId']);

    // 每个地区约 800 个价格点，单页上限 200，需要翻页
    const res = await fetchAllPages<JsonApiListResponse>(this.client, `/apps/${appId}/appPricePoints`, {
      'filter[territory]': territory,
      'fields[appPricePoints]': 'customerPrice,proceeds,territory',
      include: 'territory',
      limit: 200
    });
    let pricePoints = res.data.map((p) => ({
      id: p.id,
      customerPrice: p.attributes?.customerPrice as string | undefined,
      proceeds: p.attributes?.proceeds as string | undefined,
      territory: p.relationships?.territory?.data?.id as string | undefined
    }));
    if (customerPrice !== undefined) {
      pricePoints = pricePoints.filter((p) => Number(p.customerPrice) === Number(customerPrice));
    }
    return { appId, territory, count: pricePoints.length, pricePoints };
  }

  async getAppPriceSchedule(args: { appId: string; territory?: string }): Promise<unknown> {
    const { appId, territory } = args;
    validateRequired(args, ['appId']);

    const schedule = await this.client.get<JsonApiSingleResponse>(`/apps/${appId}/appPriceSchedule`, { include: 'baseTerritory' });
    const manual = await this.client.get<JsonApiListResponse>(`/appPriceSchedules/${schedule.data.id}/manualPrices`, {
      include: 'appPricePoint,territory',
      'fields[appPricePoints]': 'customerPrice,proceeds',
      limit: 200,
      ...(territory && { 'filter[territory]': territory })
    });
    const points = new Map((manual.included ?? []).filter((r) => r.type === 'appPricePoints').map((r) => [r.id, r.attributes]));
    return {
      scheduleId: schedule.data.id,
      baseTerritory: schedule.data.relationships?.baseTerritory?.data?.id,
      manualPrices: manual.data.map((p) => {
        const pointId = p.relationships?.appPricePoint?.data?.id;
        return {
          id: p.id,
          startDate: p.attributes?.startDate ?? null,
          endDate: p.attributes?.endDate ?? null,
          territory: p.relationships?.territory?.data?.id,
          pricePointId: pointId,
          customerPrice: pointId ? points.get(pointId)?.customerPrice : undefined
        };
      })
    };
  }

  async setAppPriceSchedule(args: {
    appId: string;
    pricePointId?: string;
    free?: boolean;
    baseTerritory?: string;
    startDate?: string;
  }): Promise<JsonApiSingleResponse> {
    const { appId, free, baseTerritory = 'USA', startDate } = args;
    validateRequired(args, ['appId']);
    if (!args.pricePointId === !free) {
      throw new Error('Exactly one of pricePointId or free: true is required');
    }

    let pricePointId = args.pricePointId;
    if (free) {
      const res = await this.listAppPricePoints({ appId, territory: baseTerritory, customerPrice: '0' });
      pricePointId = res.pricePoints[0]?.id;
      if (!pricePointId) {
        throw new Error(`No free (0.00) price point found for territory ${baseTerritory}`);
      }
    }

    // manualPrices 引用的价格要以内联资源放在 included 里，id 用 ${local-id} 占位
    const localId = '${price1}';
    return this.client.post<JsonApiSingleResponse>('/appPriceSchedules', {
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: appId } },
          baseTerritory: { data: { type: 'territories', id: baseTerritory } },
          manualPrices: { data: [{ type: 'appPrices', id: localId }] }
        }
      },
      included: [
        {
          type: 'appPrices',
          id: localId,
          attributes: { startDate: startDate ?? null },
          relationships: {
            appPricePoint: { data: { type: 'appPricePoints', id: pricePointId } }
          }
        }
      ]
    });
  }

  // ---- App 销售范围 ----

  async getAppAvailability(args: { appId: string; territories?: string[] }): Promise<unknown> {
    const { appId, territories } = args;
    validateRequired(args, ['appId']);

    const availability = await this.client.get<JsonApiSingleResponse>(`/apps/${appId}/appAvailabilityV2`);
    const res = await fetchAllPages<JsonApiListResponse>(
      this.client,
      `${API_V2_BASE}/appAvailabilities/${availability.data.id}/territoryAvailabilities`,
      {
        include: 'territory',
        'fields[territoryAvailabilities]': 'available,releaseDate,preOrderEnabled,contentStatuses,territory',
        limit: 200
      }
    );
    const all = res.data.map((t) => ({
      id: t.id,
      territory: t.relationships?.territory?.data?.id as string | undefined,
      available: t.attributes?.available as boolean | undefined,
      releaseDate: t.attributes?.releaseDate ?? null,
      preOrderEnabled: t.attributes?.preOrderEnabled,
      contentStatuses: (t.attributes?.contentStatuses ?? []) as string[]
    }));

    // 175 个地区全列出来约 50KB：默认只给汇总和不可售地区的明细，指定 territories 时给这些地区的明细
    const statusCounts: Record<string, number> = {};
    for (const t of all) {
      for (const st of t.contentStatuses) statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    }
    const wanted = territories?.length ? new Set(territories) : undefined;
    return {
      id: availability.data.id,
      availableInNewTerritories: availability.data.attributes?.availableInNewTerritories,
      territoryCount: all.length,
      availableCount: all.filter((t) => t.available).length,
      unavailableTerritories: all.filter((t) => !t.available).map((t) => t.territory),
      contentStatusCounts: statusCounts,
      territoryAvailabilities: all.filter((t) => (wanted ? wanted.has(t.territory ?? '') : !t.available))
    };
  }

  async setAppAvailability(args: {
    appId: string;
    availableInNewTerritories: boolean;
    territoryIds?: string[];
    excludeTerritoryIds?: string[];
  }): Promise<JsonApiSingleResponse> {
    const { appId, availableInNewTerritories, territoryIds, excludeTerritoryIds } = args;
    validateRequired(args, ['appId']);
    if (typeof availableInNewTerritories !== 'boolean') {
      throw new Error('availableInNewTerritories (boolean) is required');
    }

    // 每个地区都显式给出 available，未选中的地区（如 CHN）标为 false
    const allIds = await fetchAllTerritoryIds(this.client);
    const available = new Set(await resolveTerritoryIds(this.client, territoryIds, excludeTerritoryIds));
    const unknown = [...available].filter((id) => !allIds.includes(id));
    if (unknown.length) {
      throw new Error(`Unknown territory IDs: ${unknown.join(', ')}`);
    }

    const localId = (territory: string) => `\${territory-${territory}}`;
    return this.client.post<JsonApiSingleResponse>(`${API_V2_BASE}/appAvailabilities`, {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories },
        relationships: {
          app: { data: { type: 'apps', id: appId } },
          territoryAvailabilities: {
            data: allIds.map((t) => ({ type: 'territoryAvailabilities', id: localId(t) }))
          }
        }
      },
      included: allIds.map((t) => ({
        type: 'territoryAvailabilities',
        id: localId(t),
        attributes: { available: available.has(t) },
        relationships: {
          territory: { data: { type: 'territories', id: t } }
        }
      }))
    });
  }

  async updateTerritoryAvailability(args: { territoryAvailabilityId: string } & TerritoryAvailabilityAttributes): Promise<JsonApiSingleResponse> {
    const { territoryAvailabilityId } = args;
    validateRequired(args, ['territoryAvailabilityId']);
    const attributes = pick(args, ['available', 'releaseDate', 'preOrderEnabled']);
    if (!Object.keys(attributes).length) {
      throw new Error('At least one of available, releaseDate or preOrderEnabled is required');
    }
    return this.client.patch<JsonApiSingleResponse>(`/territoryAvailabilities/${territoryAvailabilityId}`, {
      data: { type: 'territoryAvailabilities', id: territoryAvailabilityId, attributes }
    });
  }
}
