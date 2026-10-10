// App Store Connect API Listing Types：年龄分级、分类、审核信息、版本属性、价格、销售范围

export type AppStoreReleaseType = 'MANUAL' | 'AFTER_APPROVAL' | 'SCHEDULED';

export interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, any>;
  relationships?: Record<string, any>;
}

export interface JsonApiSingleResponse {
  data: JsonApiResource;
  included?: JsonApiResource[];
}

export interface JsonApiListResponse {
  data: JsonApiResource[];
  included?: JsonApiResource[];
  links?: { self: string; next?: string };
  meta?: { paging: { total: number; limit: number } };
}

export interface AppStoreReviewDetailAttributes {
  contactFirstName?: string;
  contactLastName?: string;
  contactPhone?: string;
  contactEmail?: string;
  demoAccountName?: string;
  demoAccountPassword?: string;
  demoAccountRequired?: boolean;
  notes?: string;
}

export interface AppCategoryRelationships {
  primaryCategory?: string;
  primarySubcategoryOne?: string;
  primarySubcategoryTwo?: string;
  secondaryCategory?: string;
  secondarySubcategoryOne?: string;
  secondarySubcategoryTwo?: string;
}

export interface TerritoryAvailabilityAttributes {
  available?: boolean;
  releaseDate?: string | null;
  preOrderEnabled?: boolean;
}
