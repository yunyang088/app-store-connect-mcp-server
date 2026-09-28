import { AppStoreConnectClient } from '../services/index.js';
import { 
  ListAppStoreVersionLocalizationsResponse, 
  AppStoreVersionLocalizationResponse,
  AppStoreVersionLocalizationUpdateRequest,
  AppStoreVersionLocalizationCreateRequest,
  AppStoreVersionLocalizationField,
  ListAppStoreVersionsResponse,
  AppStoreVersionCreateRequest,
  AppStoreVersionResponse,
  ListAppInfosResponse,
  ListAppInfoLocalizationsResponse,
  AppInfoLocalizationResponse,
  AppInfoLocalizationCreateRequest,
  AppInfoLocalizationUpdateRequest,
  AppInfoLocalizationField
} from '../types/index.js';
import { validateRequired, sanitizeLimit } from '../utils/index.js';

export class LocalizationHandlers {
  constructor(private client: AppStoreConnectClient) {}

  async listAppStoreVersions(args: {
    appId: string;
    limit?: number;
    filter?: {
      platform?: string;
      versionString?: string;
      appStoreState?: string;
    };
  }): Promise<ListAppStoreVersionsResponse> {
    const { appId, limit = 100, filter } = args;
    
    validateRequired(args, ['appId']);
    
    const params: Record<string, any> = {
      limit: sanitizeLimit(limit),
    };
    
    if (filter?.platform) {
      params['filter[platform]'] = filter.platform;
    }
    
    if (filter?.versionString) {
      params['filter[versionString]'] = filter.versionString;
    }
    
    if (filter?.appStoreState) {
      params['filter[appStoreState]'] = filter.appStoreState;
    }
    
    return this.client.get<ListAppStoreVersionsResponse>(
      `/apps/${appId}/appStoreVersions`,
      params
    );
  }

  async listAppStoreVersionLocalizations(args: {
    appStoreVersionId: string;
    limit?: number;
  }): Promise<ListAppStoreVersionLocalizationsResponse> {
    const { appStoreVersionId, limit = 100 } = args;
    
    validateRequired(args, ['appStoreVersionId']);
    
    const params: Record<string, any> = {
      limit: sanitizeLimit(limit),
    };
    
    return this.client.get<ListAppStoreVersionLocalizationsResponse>(
      `/appStoreVersions/${appStoreVersionId}/appStoreVersionLocalizations`,
      params
    );
  }

  async getAppStoreVersionLocalization(args: {
    localizationId: string;
  }): Promise<AppStoreVersionLocalizationResponse> {
    const { localizationId } = args;
    
    validateRequired(args, ['localizationId']);
    
    return this.client.get<AppStoreVersionLocalizationResponse>(
      `/appStoreVersionLocalizations/${localizationId}`
    );
  }

  async createAppStoreVersionLocalization(args: {
    appStoreVersionId: string;
    locale: string;
    description?: string;
    keywords?: string;
    promotionalText?: string;
    supportUrl?: string;
    marketingUrl?: string;
    whatsNew?: string;
  }): Promise<AppStoreVersionLocalizationResponse> {
    const { appStoreVersionId, locale, description, keywords, promotionalText, supportUrl, marketingUrl, whatsNew } = args;
    
    validateRequired(args, ['appStoreVersionId', 'locale']);
    
    const requestData: AppStoreVersionLocalizationCreateRequest = {
      data: {
        type: 'appStoreVersionLocalizations',
        attributes: {
          locale,
          ...(description && { description }),
          ...(keywords && { keywords }),
          ...(promotionalText && { promotionalText }),
          ...(supportUrl && { supportUrl }),
          ...(marketingUrl && { marketingUrl }),
          ...(whatsNew && { whatsNew })
        },
        relationships: {
          appStoreVersion: {
            data: {
              type: 'appStoreVersions',
              id: appStoreVersionId
            }
          }
        }
      }
    };
    
    return this.client.post<AppStoreVersionLocalizationResponse>(
      '/appStoreVersionLocalizations',
      requestData
    );
  }

  private async resolveCurrentAppInfoId(appId: string): Promise<string> {
    const infos = await this.client.get<ListAppInfosResponse>(
      `/apps/${appId}/appInfos`,
      { limit: sanitizeLimit(100) }
    );
    
    const info = infos.data.find(i => i.attributes.state !== 'REPLACED') || infos.data[0];
    if (!info) {
      throw new Error(`No app info found for app ${appId}`);
    }
    
    return info.id;
  }

  async listAppInfoLocalizations(args: {
    appId: string;
    limit?: number;
  }): Promise<ListAppInfoLocalizationsResponse> {
    const { appId, limit = 100 } = args;
    
    validateRequired(args, ['appId']);
    
    const appInfoId = await this.resolveCurrentAppInfoId(appId);
    
    return this.client.get<ListAppInfoLocalizationsResponse>(
      `/appInfos/${appInfoId}/appInfoLocalizations`,
      { limit: sanitizeLimit(limit) }
    );
  }

  async createAppInfoLocalization(args: {
    appInfoId?: string;
    appId?: string;
    locale: string;
    name?: string;
    subtitle?: string;
    privacyPolicyUrl?: string;
    privacyChoicesUrl?: string;
    privacyPolicyText?: string;
  }): Promise<AppInfoLocalizationResponse> {
    const { locale, name, subtitle, privacyPolicyUrl, privacyChoicesUrl, privacyPolicyText } = args;
    
    validateRequired(args, ['locale']);
    
    let appInfoId = args.appInfoId;
    if (!appInfoId) {
      if (!args.appId) {
        throw new Error('Either appInfoId or appId is required');
      }
      appInfoId = await this.resolveCurrentAppInfoId(args.appId);
    }
    
    const requestData: AppInfoLocalizationCreateRequest = {
      data: {
        type: 'appInfoLocalizations',
        attributes: {
          locale,
          ...(name && { name }),
          ...(subtitle && { subtitle }),
          ...(privacyPolicyUrl && { privacyPolicyUrl }),
          ...(privacyChoicesUrl && { privacyChoicesUrl }),
          ...(privacyPolicyText && { privacyPolicyText })
        },
        relationships: {
          appInfo: {
            data: {
              type: 'appInfos',
              id: appInfoId
            }
          }
        }
      }
    };
    
    return this.client.post<AppInfoLocalizationResponse>(
      '/appInfoLocalizations',
      requestData
    );
  }

  async updateAppInfoLocalization(args: {
    appInfoLocalizationId: string;
    field: AppInfoLocalizationField;
    value: string;
  }): Promise<AppInfoLocalizationResponse> {
    const { appInfoLocalizationId, field, value } = args;
    
    validateRequired(args, ['appInfoLocalizationId', 'field', 'value']);
    
    // Validate field
    const validFields: AppInfoLocalizationField[] = [
      'name', 'subtitle', 'privacyPolicyUrl', 
      'privacyChoicesUrl', 'privacyPolicyText'
    ];
    
    if (!validFields.includes(field)) {
      throw new Error(`Invalid field: ${field}. Must be one of: ${validFields.join(', ')}`);
    }
    
    const requestData: AppInfoLocalizationUpdateRequest = {
      data: {
        type: 'appInfoLocalizations',
        id: appInfoLocalizationId,
        attributes: {
          [field]: value
        }
      }
    };
    
    return this.client.patch<AppInfoLocalizationResponse>(
      `/appInfoLocalizations/${appInfoLocalizationId}`,
      requestData
    );
  }

  async updateAppStoreVersionLocalization(args: {
    localizationId: string;
    field: AppStoreVersionLocalizationField;
    value: string;
  }): Promise<AppStoreVersionLocalizationResponse> {
    const { localizationId, field, value } = args;
    
    validateRequired(args, ['localizationId', 'field', 'value']);
    
    // Validate field
    const validFields: AppStoreVersionLocalizationField[] = [
      'description', 'keywords', 'marketingUrl', 
      'promotionalText', 'supportUrl', 'whatsNew'
    ];
    
    if (!validFields.includes(field)) {
      throw new Error(`Invalid field: ${field}. Must be one of: ${validFields.join(', ')}`);
    }
    
    const requestData: AppStoreVersionLocalizationUpdateRequest = {
      data: {
        type: 'appStoreVersionLocalizations',
        id: localizationId,
        attributes: {
          [field]: value
        }
      }
    };
    
    return this.client.patch<AppStoreVersionLocalizationResponse>(
      `/appStoreVersionLocalizations/${localizationId}`,
      requestData
    );
  }

  async createAppStoreVersion(args: {
    appId: string;
    platform: 'IOS' | 'MAC_OS' | 'TV_OS' | 'VISION_OS';
    versionString: string;
    copyright?: string;
    releaseType?: 'MANUAL' | 'AFTER_APPROVAL' | 'SCHEDULED';
    earliestReleaseDate?: string;
    buildId?: string;
  }): Promise<AppStoreVersionResponse> {
    const { 
      appId, 
      platform, 
      versionString, 
      copyright, 
      releaseType, 
      earliestReleaseDate,
      buildId 
    } = args;
    
    validateRequired(args, ['appId', 'platform', 'versionString']);
    
    // Validate version string format
    const versionRegex = /^\d+\.\d+(\.\d+)?$/;
    if (!versionRegex.test(versionString)) {
      throw new Error('Version string must be in format X.Y or X.Y.Z (e.g., 1.0 or 1.0.0)');
    }
    
    // Validate release date if provided
    if (earliestReleaseDate) {
      const date = new Date(earliestReleaseDate);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid release date format. Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)');
      }
      if (releaseType !== 'SCHEDULED') {
        throw new Error('earliestReleaseDate can only be set when releaseType is SCHEDULED');
      }
    }
    
    const requestData: AppStoreVersionCreateRequest = {
      data: {
        type: 'appStoreVersions',
        attributes: {
          platform,
          versionString,
          ...(copyright && { copyright }),
          ...(releaseType && { releaseType }),
          ...(earliestReleaseDate && { earliestReleaseDate })
        },
        relationships: {
          app: {
            data: {
              type: 'apps',
              id: appId
            }
          },
          ...(buildId && {
            build: {
              data: {
                type: 'builds',
                id: buildId
              }
            }
          })
        }
      }
    };
    
    return this.client.post<AppStoreVersionResponse>(
      '/appStoreVersions',
      requestData
    );
  }
}