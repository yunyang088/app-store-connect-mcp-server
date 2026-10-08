import axios from 'axios';
import { readFile } from 'fs/promises';
import path from 'path';
import { AppStoreConnectClient } from '../services/index.js';
import {
  AssetCategory,
  AssetLibraryImageResponse,
  AssetLibraryMediaListResponse,
  AssetLibraryPlacementResponse,
  AssetLibraryPlacementsResponse,
  AssetLibraryRefDataResponse,
  AssetLibraryVideoResponse,
  AssetPlacementType,
  UploadOperation
} from '../types/index.js';
import { validateRequired, sanitizeLimit } from '../utils/index.js';

const VIDEO_EXTENSIONS = ['.mov', '.m4v', '.mp4'];
// 上传后服务端异步处理（校验尺寸/格式），这些状态表示还没出结果；
// COMPLETE 是上传完成但尚未匹配规格（specId 为空），随后才变为 PREPARE_FOR_SUBMISSION 或 FAILED
const PROCESSING_STATES = ['AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'COMPLETE'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Asset Library（iOS 27 起的素材库）：截图、预览视频、产品页头图、搜索结果素材、In-App Event 素材
// 统一走「上传到素材库 → 创建 placement 挂到本地化」两步
export class AssetLibraryHandlers {
  constructor(private client: AppStoreConnectClient) {}

  // 素材库 id 与 app id 相同，这里仍按关系查一次，避免以后规则变化
  private async resolveAssetLibraryId(appId: string): Promise<string> {
    const res = await this.client.get<{ data: { id: string } }>(`/apps/${appId}/relationships/assetLibrary`);
    return res.data.id;
  }

  async getAssetLibraryRefData(args: {
    placementType?: AssetPlacementType;
    platform?: string;
  }): Promise<unknown> {
    const { placementType, platform } = args;
    const res = await this.client.get<AssetLibraryRefDataResponse>('/appAssetLibraryRefData');
    const attrs = res.data[0]?.attributes;
    if (!attrs) return res;

    // 原始数据约 60KB，按调用方关心的 placementType / platform 裁剪后返回
    const matchesType = (s: { compatiblePlacementTypes?: string[] }) =>
      !placementType || (s.compatiblePlacementTypes ?? []).includes(placementType);
    return {
      placementProfileGroups: attrs.placementProfileGroups.filter((g) => !platform || g.platform === platform || g.platform === 'ANY'),
      appStoreVersionPolicies: attrs.features
        .find((f) => f.featureId === 'APP_STORE_VERSIONS')
        ?.placementPolicies.filter((p) => !placementType || p.placementType === placementType),
      imageSpecs: attrs.imageSpecs.filter(matchesType),
      videoSpecs: (attrs.videoSpecs ?? []).filter(matchesType)
    };
  }

  async listAssetLibraryMedia(args: {
    appId: string;
    mediaType?: 'IMAGE' | 'VIDEO';
    category?: AssetCategory;
    state?: string;
    limit?: number;
  }): Promise<AssetLibraryMediaListResponse> {
    const { appId, mediaType = 'IMAGE', category, state, limit = 50 } = args;
    validateRequired(args, ['appId']);

    const libraryId = await this.resolveAssetLibraryId(appId);
    return this.client.get<AssetLibraryMediaListResponse>(
      `/appAssetLibraries/${libraryId}/${mediaType === 'VIDEO' ? 'videos' : 'images'}`,
      {
        limit: sanitizeLimit(limit),
        ...(category && { 'filter[category]': category }),
        ...(state && { 'filter[state]': state })
      }
    );
  }

  async uploadAssetLibraryMedia(args: {
    appId: string;
    filePath: string;
    category: AssetCategory;
    referenceName?: string;
    previewFrameTimeCode?: string;
    waitForProcessing?: boolean;
  }): Promise<AssetLibraryImageResponse | AssetLibraryVideoResponse> {
    const { appId, filePath, category, referenceName, previewFrameTimeCode, waitForProcessing = true } = args;
    validateRequired(args, ['appId', 'filePath', 'category']);

    const buf = await readFile(filePath);
    const fileName = path.basename(filePath);
    const isVideo = VIDEO_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
    const type = isVideo ? 'appAssetLibraryVideos' : 'appAssetLibraryImages';
    const libraryId = await this.resolveAssetLibraryId(appId);

    // 1. 预留素材，拿到分片上传地址
    const created = await this.client.post<AssetLibraryImageResponse>(`/${type}`, {
      data: {
        type,
        attributes: {
          category,
          fileName,
          fileSize: buf.length,
          ...(referenceName && { referenceName }),
          ...(isVideo && previewFrameTimeCode && { previewFrameTimeCode })
        },
        relationships: {
          assetLibrary: { data: { type: 'appAssetLibraries', id: libraryId } }
        }
      }
    });
    const id = created.data.id;

    // 2. 按 uploadOperations 分片上传
    await this.uploadChunks(created.data.attributes.uploadOperations ?? [], buf);

    // 3. 标记上传完成（素材库不需要 md5 校验和）
    let result = await this.client.patch<AssetLibraryImageResponse>(`/${type}/${id}`, {
      data: { type, id, attributes: { uploaded: true } }
    });

    // 4. 等服务端处理完，尺寸/格式不合规会在这里变成 FAILED 并给出 stateDetails
    if (waitForProcessing) {
      for (let i = 0; i < 30 && PROCESSING_STATES.includes(result.data.attributes.state); i++) {
        await sleep(2000);
        result = await this.client.get<AssetLibraryImageResponse>(`/${type}/${id}`);
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

  async createAssetPlacement(args: {
    placementType: AssetPlacementType;
    placementGroup?: string;
    imageId?: string;
    videoId?: string;
    appStoreVersionLocalizationId?: string;
    appCustomProductPageLocalizationId?: string;
    appEventLocalizationId?: string;
  }): Promise<AssetLibraryPlacementResponse> {
    const {
      placementType, placementGroup, imageId, videoId,
      appStoreVersionLocalizationId, appCustomProductPageLocalizationId, appEventLocalizationId
    } = args;
    validateRequired(args, ['placementType']);
    if (!imageId === !videoId) {
      throw new Error('Exactly one of imageId or videoId is required');
    }

    const targets = [
      appStoreVersionLocalizationId && { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: appStoreVersionLocalizationId } } },
      appCustomProductPageLocalizationId && { appCustomProductPageLocalization: { data: { type: 'appCustomProductPageLocalizations', id: appCustomProductPageLocalizationId } } },
      appEventLocalizationId && { appEventLocalization: { data: { type: 'appEventLocalizations', id: appEventLocalizationId } } }
    ].filter(Boolean);
    if (targets.length !== 1) {
      throw new Error('Exactly one of appStoreVersionLocalizationId, appCustomProductPageLocalizationId or appEventLocalizationId is required');
    }

    return this.client.post<AssetLibraryPlacementResponse>('/appAssetLibraryPlacements', {
      data: {
        type: 'appAssetLibraryPlacements',
        attributes: {
          placementType,
          // 头图 / 搜索结果素材只有 DEFAULT_PROFILE 一个分组
          placementGroup: placementGroup ?? 'DEFAULT_PROFILE'
        },
        relationships: {
          ...(imageId && { image: { data: { type: 'appAssetLibraryImages', id: imageId } } }),
          ...(videoId && { video: { data: { type: 'appAssetLibraryVideos', id: videoId } } }),
          ...targets[0]
        }
      }
    });
  }

  async listLocalizationPlacements(args: {
    appStoreVersionLocalizationId: string;
    placementType?: AssetPlacementType;
    placementGroup?: string;
    limit?: number;
  }): Promise<AssetLibraryPlacementsResponse> {
    const { appStoreVersionLocalizationId, placementType, placementGroup, limit = 100 } = args;
    validateRequired(args, ['appStoreVersionLocalizationId']);

    return this.client.get<AssetLibraryPlacementsResponse>(
      `/appStoreVersionLocalizations/${appStoreVersionLocalizationId}/placements`,
      {
        limit: sanitizeLimit(limit),
        include: 'image,video',
        'fields[appAssetLibraryImages]': 'fileName,state,referenceName,imageAsset',
        'fields[appAssetLibraryVideos]': 'fileName,state,referenceName',
        ...(placementType && { 'filter[placementType]': placementType }),
        ...(placementGroup && { 'filter[placementGroup]': placementGroup })
      }
    );
  }

  async deleteAssetPlacement(args: { placementId: string }): Promise<{ success: boolean; placementId: string }> {
    validateRequired(args, ['placementId']);
    await this.client.delete(`/appAssetLibraryPlacements/${args.placementId}`);
    return { success: true, placementId: args.placementId };
  }

  async reorderAssetPlacements(args: {
    appStoreVersionLocalizationId: string;
    placementGroup: string;
    placementIds: string[];
  }): Promise<unknown> {
    const { appStoreVersionLocalizationId, placementGroup, placementIds } = args;
    validateRequired(args, ['appStoreVersionLocalizationId', 'placementGroup', 'placementIds']);

    return this.client.post('/appAssetLibraryPlacementOrderingRequests', {
      data: {
        type: 'appAssetLibraryPlacementOrderingRequests',
        attributes: { placementGroup },
        relationships: {
          orderedPlacements: { data: placementIds.map((id) => ({ type: 'appAssetLibraryPlacements', id })) },
          appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: appStoreVersionLocalizationId } }
        }
      }
    });
  }

  async deleteAssetLibraryMedia(args: { imageId?: string; videoId?: string }): Promise<{ success: boolean; id: string }> {
    const { imageId, videoId } = args;
    if (!imageId === !videoId) {
      throw new Error('Exactly one of imageId or videoId is required');
    }
    const id = (imageId ?? videoId)!;
    await this.client.delete(imageId ? `/appAssetLibraryImages/${id}` : `/appAssetLibraryVideos/${id}`);
    return { success: true, id };
  }
}
