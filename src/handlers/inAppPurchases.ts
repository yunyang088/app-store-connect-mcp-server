import axios from 'axios';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { AppStoreConnectClient, API_V2_BASE } from '../services/index.js';
import {
  CompactPricePoint,
  InAppPurchaseAppStoreReviewScreenshotResponse,
  InAppPurchaseCreateRequest,
  InAppPurchaseInclude,
  InAppPurchaseLocalizationResponse,
  InAppPurchaseResponse,
  InAppPurchaseState,
  InAppPurchaseType,
  InAppPurchaseUpdateRequest,
  InAppPurchaseVersionResponse,
  JsonApiListResponse,
  JsonApiSingleResponse,
  ListInAppPurchaseLocalizationsResponse,
  ListInAppPurchasePricePointsResponse,
  ListInAppPurchasesResponse,
  ListInAppPurchaseVersionsResponse,
  UploadOperation
} from '../types/index.js';
import { validateRequired, sanitizeLimit } from '../utils/index.js';
import { fetchAllPages, resolveTerritoryIds } from './listing.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 审核截图提交后服务端异步处理，这两个状态表示还没出结果
const SCREENSHOT_PROCESSING_STATES = ['AWAITING_UPLOAD', 'UPLOAD_COMPLETE'];

// 内购（inAppPurchasesV2）：商品本身、版本化的本地化（4.4.1 起）、价格、销售范围、审核截图
export class InAppPurchaseHandlers {
  constructor(private client: AppStoreConnectClient) {}

  async listInAppPurchases(args: {
    appId: string;
    productId?: string;
    name?: string;
    state?: InAppPurchaseState;
    inAppPurchaseType?: InAppPurchaseType;
    include?: InAppPurchaseInclude[];
    limit?: number;
  }): Promise<ListInAppPurchasesResponse> {
    const { appId, productId, name, state, inAppPurchaseType, include, limit = 100 } = args;
    validateRequired(args, ['appId']);

    return this.client.get<ListInAppPurchasesResponse>(`/apps/${appId}/inAppPurchasesV2`, {
      limit: sanitizeLimit(limit),
      ...(productId && { 'filter[productId]': productId }),
      ...(name && { 'filter[name]': name }),
      ...(state && { 'filter[state]': state }),
      ...(inAppPurchaseType && { 'filter[inAppPurchaseType]': inAppPurchaseType }),
      // 不 include 时只取属性，省掉每条十几个关系链接
      ...(include?.length
        ? { include: include.join(',') }
        : { 'fields[inAppPurchases]': 'name,productId,inAppPurchaseType,state,reviewNote,familySharable' })
    });
  }

  async getInAppPurchase(args: {
    inAppPurchaseId: string;
    include?: InAppPurchaseInclude[];
  }): Promise<InAppPurchaseResponse> {
    const { inAppPurchaseId, include } = args;
    validateRequired(args, ['inAppPurchaseId']);

    return this.client.get<InAppPurchaseResponse>(
      `${API_V2_BASE}/inAppPurchases/${inAppPurchaseId}`,
      include?.length ? { include: include.join(',') } : undefined
    );
  }

  async createInAppPurchase(args: {
    appId: string;
    name: string;
    productId: string;
    inAppPurchaseType: InAppPurchaseType;
    reviewNote?: string;
    familySharable?: boolean;
  }): Promise<InAppPurchaseResponse> {
    const { appId, name, productId, inAppPurchaseType, reviewNote, familySharable } = args;
    validateRequired(args, ['appId', 'name', 'productId', 'inAppPurchaseType']);

    const requestData: InAppPurchaseCreateRequest = {
      data: {
        type: 'inAppPurchases',
        attributes: {
          name,
          productId,
          inAppPurchaseType,
          ...(reviewNote && { reviewNote }),
          ...(familySharable !== undefined && { familySharable })
        },
        relationships: {
          app: { data: { type: 'apps', id: appId } }
        }
      }
    };

    return this.client.post<InAppPurchaseResponse>(`${API_V2_BASE}/inAppPurchases`, requestData);
  }

  async updateInAppPurchase(args: {
    inAppPurchaseId: string;
    name?: string;
    reviewNote?: string;
    familySharable?: boolean;
  }): Promise<InAppPurchaseResponse> {
    const { inAppPurchaseId, name, reviewNote, familySharable } = args;
    validateRequired(args, ['inAppPurchaseId']);
    if (name === undefined && reviewNote === undefined && familySharable === undefined) {
      throw new Error('At least one of name, reviewNote or familySharable is required');
    }

    const requestData: InAppPurchaseUpdateRequest = {
      data: {
        type: 'inAppPurchases',
        id: inAppPurchaseId,
        attributes: {
          ...(name !== undefined && { name }),
          ...(reviewNote !== undefined && { reviewNote }),
          ...(familySharable !== undefined && { familySharable })
        }
      }
    };

    return this.client.patch<InAppPurchaseResponse>(`${API_V2_BASE}/inAppPurchases/${inAppPurchaseId}`, requestData);
  }

  async deleteInAppPurchase(args: { inAppPurchaseId: string }): Promise<{ success: boolean; inAppPurchaseId: string }> {
    validateRequired(args, ['inAppPurchaseId']);
    await this.client.delete(`${API_V2_BASE}/inAppPurchases/${args.inAppPurchaseId}`);
    return { success: true, inAppPurchaseId: args.inAppPurchaseId };
  }

  // ---- 版本（4.4.1 起本地化和推广图挂在版本上） ----

  async listInAppPurchaseVersions(args: {
    inAppPurchaseId: string;
    state?: string;
    includeLocalizations?: boolean;
  }): Promise<ListInAppPurchaseVersionsResponse> {
    const { inAppPurchaseId, state, includeLocalizations = true } = args;
    validateRequired(args, ['inAppPurchaseId']);

    return this.client.get<ListInAppPurchaseVersionsResponse>(
      `${API_V2_BASE}/inAppPurchases/${inAppPurchaseId}/versions`,
      {
        ...(state && { 'filter[state]': state }),
        ...(includeLocalizations && { include: 'localizations' })
      }
    );
  }

  async createInAppPurchaseVersion(args: { inAppPurchaseId: string }): Promise<InAppPurchaseVersionResponse> {
    validateRequired(args, ['inAppPurchaseId']);

    return this.client.post<InAppPurchaseVersionResponse>('/inAppPurchaseVersions', {
      data: {
        type: 'inAppPurchaseVersions',
        relationships: {
          inAppPurchase: { data: { type: 'inAppPurchases', id: args.inAppPurchaseId } }
        }
      }
    });
  }

  // 只给了内购 id 时，找它可编辑的草稿版本；没有就返回 undefined，调用方退回旧的 v1 接口
  private async findDraftVersionId(inAppPurchaseId: string): Promise<string | undefined> {
    const res = await this.listInAppPurchaseVersions({
      inAppPurchaseId,
      state: 'PREPARE_FOR_SUBMISSION',
      includeLocalizations: false
    });
    return res.data[0]?.id;
  }

  // ---- 本地化 ----

  async listInAppPurchaseLocalizations(args: {
    inAppPurchaseVersionId?: string;
    inAppPurchaseId?: string;
    limit?: number;
  }): Promise<ListInAppPurchaseLocalizationsResponse> {
    const { inAppPurchaseVersionId, inAppPurchaseId, limit = 100 } = args;
    if (!inAppPurchaseVersionId === !inAppPurchaseId) {
      throw new Error('Exactly one of inAppPurchaseVersionId or inAppPurchaseId is required');
    }

    if (inAppPurchaseVersionId) {
      return this.client.get<ListInAppPurchaseLocalizationsResponse>(
        `/inAppPurchaseVersions/${inAppPurchaseVersionId}/localizations`,
        { limit: sanitizeLimit(limit) }
      );
    }
    // 4.4.1 起已标记废弃，但仍可读出直接挂在内购上的本地化
    return this.client.get<ListInAppPurchaseLocalizationsResponse>(
      `${API_V2_BASE}/inAppPurchases/${inAppPurchaseId}/inAppPurchaseLocalizations`,
      { limit: sanitizeLimit(limit) }
    );
  }

  async createInAppPurchaseLocalization(args: {
    inAppPurchaseVersionId?: string;
    inAppPurchaseId?: string;
    locale: string;
    name: string;
    description?: string;
  }): Promise<InAppPurchaseLocalizationResponse & { apiPath: string }> {
    const { inAppPurchaseId, locale, name, description } = args;
    validateRequired(args, ['locale', 'name']);
    if (!args.inAppPurchaseVersionId && !inAppPurchaseId) {
      throw new Error('Either inAppPurchaseVersionId or inAppPurchaseId is required');
    }

    const attributes = { locale, name, ...(description !== undefined && { description }) };
    const versionId = args.inAppPurchaseVersionId ?? (await this.findDraftVersionId(inAppPurchaseId!));

    if (versionId) {
      const res = await this.client.post<InAppPurchaseLocalizationResponse>(`${API_V2_BASE}/inAppPurchaseLocalizations`, {
        data: {
          type: 'inAppPurchaseLocalizations',
          attributes,
          relationships: {
            version: { data: { type: 'inAppPurchaseVersions', id: versionId } }
          }
        }
      });
      return { ...res, apiPath: `POST /v2/inAppPurchaseLocalizations (version ${versionId})` };
    }

    // 没有草稿版本：走 4.4.1 前的接口，直接挂在内购上
    const res = await this.client.post<InAppPurchaseLocalizationResponse>('/inAppPurchaseLocalizations', {
      data: {
        type: 'inAppPurchaseLocalizations',
        attributes,
        relationships: {
          inAppPurchaseV2: { data: { type: 'inAppPurchases', id: inAppPurchaseId! } }
        }
      }
    });
    return { ...res, apiPath: 'POST /v1/inAppPurchaseLocalizations (legacy, no draft version found)' };
  }

  // v2 和 v1 本地化共用 inAppPurchaseLocalizations 类型；先按 v2 改，404 再退回 v1
  private async withLegacyFallback<T>(v2: () => Promise<T>, v1: () => Promise<T>): Promise<T> {
    try {
      return await v2();
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        return v1();
      }
      throw e;
    }
  }

  async updateInAppPurchaseLocalization(args: {
    localizationId: string;
    name?: string;
    description?: string;
  }): Promise<InAppPurchaseLocalizationResponse> {
    const { localizationId, name, description } = args;
    validateRequired(args, ['localizationId']);
    if (name === undefined && description === undefined) {
      throw new Error('At least one of name or description is required');
    }

    const body = {
      data: {
        type: 'inAppPurchaseLocalizations',
        id: localizationId,
        attributes: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description })
        }
      }
    };
    return this.withLegacyFallback(
      () => this.client.patch<InAppPurchaseLocalizationResponse>(`${API_V2_BASE}/inAppPurchaseLocalizations/${localizationId}`, body),
      () => this.client.patch<InAppPurchaseLocalizationResponse>(`/inAppPurchaseLocalizations/${localizationId}`, body)
    );
  }

  async deleteInAppPurchaseLocalization(args: { localizationId: string }): Promise<{ success: boolean; localizationId: string }> {
    const { localizationId } = args;
    validateRequired(args, ['localizationId']);

    await this.withLegacyFallback(
      () => this.client.delete(`${API_V2_BASE}/inAppPurchaseLocalizations/${localizationId}`),
      () => this.client.delete(`/inAppPurchaseLocalizations/${localizationId}`)
    );
    return { success: true, localizationId };
  }

  // ---- 价格 ----

  async listInAppPurchasePricePoints(args: {
    inAppPurchaseId: string;
    territory?: string;
    customerPrice?: string;
    limit?: number;
  }): Promise<{ inAppPurchaseId: string; territory: string; count: number; pricePoints: CompactPricePoint[] }> {
    const { inAppPurchaseId, territory = 'USA', customerPrice, limit = 8000 } = args;
    validateRequired(args, ['inAppPurchaseId']);

    const res = await fetchAllPages<ListInAppPurchasePricePointsResponse>(
      this.client,
      `${API_V2_BASE}/inAppPurchases/${inAppPurchaseId}/pricePoints`,
      {
        'filter[territory]': territory,
        include: 'territory',
        'fields[inAppPurchasePricePoints]': 'customerPrice,proceeds,territory',
        'fields[territories]': 'currency',
        limit: sanitizeLimit(limit, 8000)
      }
    );

    const currencies = new Map((res.included ?? []).map((t) => [t.id, t.attributes?.currency]));
    let pricePoints: CompactPricePoint[] = res.data.map((p) => {
      const t = p.relationships?.territory?.data?.id;
      return {
        id: p.id,
        customerPrice: p.attributes.customerPrice,
        proceeds: p.attributes.proceeds,
        territory: t,
        currency: t ? currencies.get(t) : undefined
      };
    });
    if (customerPrice !== undefined) {
      // 数值比较，"0.99" 和 "0.990" 都能匹配
      pricePoints = pricePoints.filter((p) => Number(p.customerPrice) === Number(customerPrice));
    }
    return { inAppPurchaseId, territory, count: pricePoints.length, pricePoints };
  }

  async setInAppPurchasePrice(args: {
    inAppPurchaseId: string;
    pricePointId: string;
    baseTerritory?: string;
    startDate?: string;
  }): Promise<JsonApiSingleResponse> {
    const { inAppPurchaseId, pricePointId, baseTerritory = 'USA', startDate } = args;
    validateRequired(args, ['inAppPurchaseId', 'pricePointId']);

    // manualPrices 引用的价格要以内联资源放在 included 里，id 用 ${local-id} 占位
    const localId = '${price1}';
    return this.client.post<JsonApiSingleResponse>('/inAppPurchasePriceSchedules', {
      data: {
        type: 'inAppPurchasePriceSchedules',
        relationships: {
          inAppPurchase: { data: { type: 'inAppPurchases', id: inAppPurchaseId } },
          baseTerritory: { data: { type: 'territories', id: baseTerritory } },
          manualPrices: { data: [{ type: 'inAppPurchasePrices', id: localId }] }
        }
      },
      included: [
        {
          type: 'inAppPurchasePrices',
          id: localId,
          attributes: { startDate: startDate ?? null },
          relationships: {
            inAppPurchaseV2: { data: { type: 'inAppPurchases', id: inAppPurchaseId } },
            inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: pricePointId } }
          }
        }
      ]
    });
  }

  async getInAppPurchasePriceSchedule(args: {
    inAppPurchaseId: string;
    territory?: string;
  }): Promise<unknown> {
    const { inAppPurchaseId, territory } = args;
    validateRequired(args, ['inAppPurchaseId']);

    const schedule = await this.client.get<JsonApiSingleResponse>(
      `${API_V2_BASE}/inAppPurchases/${inAppPurchaseId}/iapPriceSchedule`,
      { include: 'baseTerritory' }
    );
    const scheduleId = schedule.data.id;

    const compactPrices = (res: JsonApiListResponse) => {
      const points = new Map((res.included ?? []).filter((r) => r.type === 'inAppPurchasePricePoints').map((r) => [r.id, r.attributes]));
      return res.data.map((p) => {
        const pointId = p.relationships?.inAppPurchasePricePoint?.data?.id;
        return {
          id: p.id,
          startDate: p.attributes?.startDate ?? null,
          endDate: p.attributes?.endDate ?? null,
          territory: p.relationships?.territory?.data?.id,
          pricePointId: pointId,
          customerPrice: pointId ? points.get(pointId)?.customerPrice : undefined,
          proceeds: pointId ? points.get(pointId)?.proceeds : undefined
        };
      });
    };
    const priceParams = {
      include: 'inAppPurchasePricePoint,territory',
      'fields[inAppPurchasePricePoints]': 'customerPrice,proceeds',
      limit: 200,
      ...(territory && { 'filter[territory]': territory })
    };

    const manual = await this.client.get<JsonApiListResponse>(`/inAppPurchasePriceSchedules/${scheduleId}/manualPrices`, priceParams);
    // 自动价格是按基准地区换算出的其他地区价格，有 175 个地区，只在指定 territory 时才查
    const automatic = territory
      ? await this.client.get<JsonApiListResponse>(`/inAppPurchasePriceSchedules/${scheduleId}/automaticPrices`, priceParams)
      : undefined;

    return {
      scheduleId,
      baseTerritory: schedule.data.relationships?.baseTerritory?.data?.id,
      manualPrices: compactPrices(manual),
      ...(automatic && { automaticPrices: compactPrices(automatic) })
    };
  }

  // ---- 销售范围 ----

  async getInAppPurchaseAvailability(args: { inAppPurchaseId: string }): Promise<unknown> {
    validateRequired(args, ['inAppPurchaseId']);

    const availability = await this.client.get<JsonApiSingleResponse>(
      `${API_V2_BASE}/inAppPurchases/${args.inAppPurchaseId}/inAppPurchaseAvailability`
    );
    const territories = await fetchAllPages<JsonApiListResponse>(
      this.client,
      `/inAppPurchaseAvailabilities/${availability.data.id}/availableTerritories`,
      { limit: 200 }
    );
    return {
      id: availability.data.id,
      availableInNewTerritories: availability.data.attributes?.availableInNewTerritories,
      territoryCount: territories.data.length,
      territories: territories.data.map((t) => t.id)
    };
  }

  async setInAppPurchaseAvailability(args: {
    inAppPurchaseId: string;
    availableInNewTerritories: boolean;
    territoryIds?: string[];
    excludeTerritoryIds?: string[];
  }): Promise<JsonApiSingleResponse> {
    const { inAppPurchaseId, availableInNewTerritories, territoryIds, excludeTerritoryIds } = args;
    validateRequired(args, ['inAppPurchaseId']);
    if (typeof availableInNewTerritories !== 'boolean') {
      throw new Error('availableInNewTerritories (boolean) is required');
    }

    const ids = await resolveTerritoryIds(this.client, territoryIds, excludeTerritoryIds);
    return this.client.post<JsonApiSingleResponse>('/inAppPurchaseAvailabilities', {
      data: {
        type: 'inAppPurchaseAvailabilities',
        attributes: { availableInNewTerritories },
        relationships: {
          inAppPurchase: { data: { type: 'inAppPurchases', id: inAppPurchaseId } },
          availableTerritories: { data: ids.map((id) => ({ type: 'territories', id })) }
        }
      }
    });
  }

  // ---- 审核截图 ----

  async uploadInAppPurchaseReviewScreenshot(args: {
    inAppPurchaseId: string;
    filePath: string;
    replaceExisting?: boolean;
    waitForProcessing?: boolean;
  }): Promise<InAppPurchaseAppStoreReviewScreenshotResponse> {
    const { inAppPurchaseId, filePath, replaceExisting = false, waitForProcessing = true } = args;
    validateRequired(args, ['inAppPurchaseId', 'filePath']);

    const buf = await readFile(filePath);
    const fileName = path.basename(filePath);

    // 每个内购只能有一张审核截图；已有时按需先删掉旧的
    if (replaceExisting) {
      const existing = await this.client
        .get<{ data: { id: string } | null }>(`${API_V2_BASE}/inAppPurchases/${inAppPurchaseId}/appStoreReviewScreenshot`)
        .catch((e) => {
          if (axios.isAxiosError(e) && e.response?.status === 404) return { data: null };
          throw e;
        });
      if (existing.data?.id) {
        await this.client.delete(`/inAppPurchaseAppStoreReviewScreenshots/${existing.data.id}`);
      }
    }

    // 1. 预留截图，拿到分片上传地址
    const created = await this.client.post<InAppPurchaseAppStoreReviewScreenshotResponse>('/inAppPurchaseAppStoreReviewScreenshots', {
      data: {
        type: 'inAppPurchaseAppStoreReviewScreenshots',
        attributes: { fileName, fileSize: buf.length },
        relationships: {
          inAppPurchaseV2: { data: { type: 'inAppPurchases', id: inAppPurchaseId } }
        }
      }
    });
    const id = created.data.id;

    // 2. 按 uploadOperations 分片上传
    await this.uploadChunks(created.data.attributes.uploadOperations ?? [], buf);

    // 3. 提交：标记已上传并带上 md5
    let result = await this.client.patch<InAppPurchaseAppStoreReviewScreenshotResponse>(`/inAppPurchaseAppStoreReviewScreenshots/${id}`, {
      data: {
        type: 'inAppPurchaseAppStoreReviewScreenshots',
        id,
        attributes: {
          uploaded: true,
          sourceFileChecksum: createHash('md5').update(buf).digest('hex')
        }
      }
    });

    // 4. 等服务端处理完，图片不合规会变成 FAILED 并带 errors
    if (waitForProcessing) {
      for (let i = 0; i < 15 && SCREENSHOT_PROCESSING_STATES.includes(result.data.attributes.assetDeliveryState?.state ?? ''); i++) {
        await sleep(2000);
        result = await this.client.get<InAppPurchaseAppStoreReviewScreenshotResponse>(`/inAppPurchaseAppStoreReviewScreenshots/${id}`);
      }
    }
    return result;
  }

  private async uploadChunks(operations: UploadOperation[], buf: Buffer): Promise<void> {
    for (const op of operations) {
      const headers: Record<string, string> = {};
      for (const h of op.requestHeaders ?? []) {
        headers[h.name] = h.value;
      }
      await axios.request({
        method: op.method,
        url: op.url,
        headers,
        data: buf.subarray(op.offset, op.offset + op.length),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
    }
  }
}
