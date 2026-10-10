// App Store Connect API In-App Purchase Types（inAppPurchasesV2，API 4.4.1 起的版本化元数据）

import { AppScreenshotUploadOperation } from './screenshots.js';

export type InAppPurchaseType = 'CONSUMABLE' | 'NON_CONSUMABLE' | 'NON_RENEWING_SUBSCRIPTION';

export type InAppPurchaseState =
  | 'MISSING_METADATA'
  | 'WAITING_FOR_UPLOAD'
  | 'PROCESSING_CONTENT'
  | 'READY_TO_SUBMIT'
  | 'WAITING_FOR_REVIEW'
  | 'IN_REVIEW'
  | 'DEVELOPER_ACTION_NEEDED'
  | 'PENDING_BINARY_APPROVAL'
  | 'APPROVED'
  | 'DEVELOPER_REMOVED_FROM_SALE'
  | 'REMOVED_FROM_SALE'
  | 'REJECTED';

export type InAppPurchaseInclude =
  | 'inAppPurchaseLocalizations'
  | 'pricePoints'
  | 'content'
  | 'appStoreReviewScreenshot'
  | 'promotedPurchase'
  | 'iapPriceSchedule'
  | 'inAppPurchaseAvailability'
  | 'images'
  | 'offerCodes'
  | 'versions';

export interface ResourceRef<T extends string = string> {
  type: T;
  id: string;
}

export interface InAppPurchase {
  id: string;
  type: 'inAppPurchases';
  attributes: {
    name?: string;
    productId?: string;
    inAppPurchaseType?: InAppPurchaseType;
    state?: InAppPurchaseState;
    reviewNote?: string | null;
    familySharable?: boolean;
    contentHosting?: boolean | null;
  };
  relationships?: Record<string, unknown>;
}

export interface InAppPurchaseResponse {
  data: InAppPurchase;
  included?: any[];
}

export interface ListInAppPurchasesResponse {
  data: InAppPurchase[];
  included?: any[];
  links?: { self: string; next?: string };
  meta?: { paging: { total: number; limit: number } };
}

export interface InAppPurchaseCreateRequest {
  data: {
    type: 'inAppPurchases';
    attributes: {
      name: string;
      productId: string;
      inAppPurchaseType: InAppPurchaseType;
      reviewNote?: string;
      familySharable?: boolean;
    };
    relationships: {
      app: { data: ResourceRef<'apps'> };
    };
  };
}

export interface InAppPurchaseUpdateRequest {
  data: {
    type: 'inAppPurchases';
    id: string;
    attributes: {
      name?: string;
      reviewNote?: string;
      familySharable?: boolean;
    };
  };
}

export interface InAppPurchaseVersion {
  id: string;
  type: 'inAppPurchaseVersions';
  attributes: {
    version?: number;
    state?: string;
  };
}

export interface InAppPurchaseVersionResponse {
  data: InAppPurchaseVersion;
  included?: any[];
}

export interface ListInAppPurchaseVersionsResponse {
  data: InAppPurchaseVersion[];
  included?: any[];
}

export interface InAppPurchaseLocalization {
  id: string;
  type: 'inAppPurchaseLocalizations';
  attributes: {
    name?: string;
    locale?: string;
    description?: string | null;
    state?: string;
  };
}

export interface InAppPurchaseLocalizationResponse {
  data: InAppPurchaseLocalization;
}

export interface ListInAppPurchaseLocalizationsResponse {
  data: InAppPurchaseLocalization[];
  links?: { self: string; next?: string };
}

export interface InAppPurchasePricePoint {
  id: string;
  type: 'inAppPurchasePricePoints';
  attributes: {
    customerPrice?: string;
    proceeds?: string;
  };
  relationships?: {
    territory?: { data?: ResourceRef<'territories'> };
  };
}

export interface ListInAppPurchasePricePointsResponse {
  data: InAppPurchasePricePoint[];
  included?: Territory[];
  links?: { self: string; next?: string };
  meta?: { paging: { total: number; limit: number } };
}

export interface CompactPricePoint {
  id: string;
  customerPrice?: string;
  proceeds?: string;
  territory?: string;
  currency?: string;
}

export interface InAppPurchaseAppStoreReviewScreenshot {
  id: string;
  type: 'inAppPurchaseAppStoreReviewScreenshots';
  attributes: {
    fileName?: string;
    fileSize?: number;
    sourceFileChecksum?: string | null;
    assetDeliveryState?: { state?: string; errors?: unknown[]; warnings?: unknown[] };
    uploadOperations?: AppScreenshotUploadOperation[];
  };
}

export interface InAppPurchaseAppStoreReviewScreenshotResponse {
  data: InAppPurchaseAppStoreReviewScreenshot;
}

export interface Territory {
  id: string;
  type: 'territories';
  attributes?: { currency?: string };
}

export interface ListTerritoriesResponse {
  data: Territory[];
  links?: { self: string; next?: string };
  meta?: { paging: { total: number; limit: number } };
}
