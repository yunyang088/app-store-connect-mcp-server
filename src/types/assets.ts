// App Store Connect API Asset Library Types（API 4.x，iOS 27 素材库）

import { AppScreenshotUploadOperation } from './screenshots.js';

export type UploadOperation = AppScreenshotUploadOperation;

export type AssetCategory = 'CREATIVE_ASSETS' | 'APP_SCREENSHOTS_AND_PREVIEWS';

export type AssetPlacementType =
  | 'APP_SCREENSHOT'
  | 'IMESSAGE_APP_SCREENSHOT'
  | 'APP_PREVIEW'
  | 'PRODUCT_PAGE_HEADER_ASSET'
  | 'APP_STORE_SEARCH_RESULTS_ASSET'
  | 'SEARCH_RESULTS_ADS_ASSET'
  | 'TODAY_TAB_ADS_ASSET'
  | 'EVENT_CARD_ASSET'
  | 'EVENT_DETAILS_PAGE_ASSET'
  | 'RETENTION_MESSAGE_ASSET';

export interface StateDetail {
  code?: string;
  message?: string;
}

export interface AssetLibraryMedia {
  id: string;
  type: 'appAssetLibraryImages' | 'appAssetLibraryVideos';
  attributes: {
    category?: AssetCategory;
    fileName?: string;
    fileSize?: number;
    referenceName?: string;
    specId?: string;
    state: string;
    stateDetails?: StateDetail[];
    uploadOperations?: UploadOperation[];
  };
}

export interface AssetLibraryImageResponse {
  data: AssetLibraryMedia;
}

export type AssetLibraryVideoResponse = AssetLibraryImageResponse;

export interface AssetLibraryMediaListResponse {
  data: AssetLibraryMedia[];
  links?: { self: string; next?: string };
  meta?: { paging: { total: number; limit: number } };
}

export interface AssetLibraryPlacement {
  id: string;
  type: 'appAssetLibraryPlacements';
  attributes: {
    mediaType?: 'IMAGE' | 'VIDEO';
    placementType?: AssetPlacementType;
    placementGroup?: string;
    state?: string;
    stateDetails?: StateDetail[];
  };
}

export interface AssetLibraryPlacementResponse {
  data: AssetLibraryPlacement;
}

export interface AssetLibraryPlacementsResponse {
  data: AssetLibraryPlacement[];
  included?: AssetLibraryMedia[];
}

interface MediaSpec {
  specId: string;
  shortName: string;
  dimensions: { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number };
  aspectRatio: string;
  compatiblePlacementTypes?: AssetPlacementType[];
  fileExtensions?: string[];
  maxFileSize?: number;
}

export interface AssetLibraryRefDataResponse {
  data: Array<{
    id: string;
    attributes: {
      features: Array<{
        featureId: string;
        placementPolicies: Array<{
          placementType: AssetPlacementType;
          groupLimits: Array<{ groupIds: string[]; maxCount: number }>;
        }>;
      }>;
      placementProfileGroups: Array<{ placementProfileGroupId: string; platform: string; displayClassId: string }>;
      imageSpecs: MediaSpec[];
      videoSpecs?: MediaSpec[];
    };
  }>;
}
