import { AppStoreConnectClient } from '../services/index.js';
import { 
  AnalyticsReportRequest,
  AnalyticsReportRequestResponse,
  ListAnalyticsReportsResponse,
  ListAnalyticsReportSegmentsResponse,
  AnalyticsAccessType,
  AnalyticsReportCategory,
  SalesReportResponse,
  FinanceReportResponse,
  SalesReportType,
  SalesReportSubType,
  SalesReportFrequency,
  SalesReportFilters,
  FinanceReportFilters
} from '../types/index.js';
import { validateRequired, sanitizeLimit, buildFilterParams } from '../utils/index.js';

export class AnalyticsHandlers {
  constructor(private client: AppStoreConnectClient, private config?: { vendorNumber?: string }) {}

  async createAnalyticsReportRequest(args: {
    appId: string;
    accessType?: AnalyticsAccessType;
  }): Promise<AnalyticsReportRequestResponse> {
    const { appId, accessType = "ONE_TIME_SNAPSHOT" } = args;
    
    validateRequired(args, ['appId']);

    const requestBody: AnalyticsReportRequest = {
      data: {
        type: "analyticsReportRequests",
        attributes: {
          accessType
        },
        relationships: {
          app: {
            data: {
              id: appId,
              type: "apps"
            }
          }
        }
      }
    };

    return this.client.post<AnalyticsReportRequestResponse>('/analyticsReportRequests', requestBody);
  }

  async listAnalyticsReports(args: {
    reportRequestId: string;
    limit?: number;
    filter?: {
      category?: AnalyticsReportCategory;
    };
  }): Promise<ListAnalyticsReportsResponse> {
    const { reportRequestId, limit = 100, filter } = args;
    
    validateRequired(args, ['reportRequestId']);

    const params: Record<string, any> = {
      limit: sanitizeLimit(limit)
    };

    Object.assign(params, buildFilterParams(filter));

    return this.client.get<ListAnalyticsReportsResponse>(`/analyticsReportRequests/${reportRequestId}/reports`, params);
  }

  // 一个 app 下已有的报表请求（ONGOING 每个 app 只能建一个，先查再建）
  async listAnalyticsReportRequests(args: {
    appId: string;
  }): Promise<any> {
    validateRequired(args, ['appId']);
    return this.client.get(`/apps/${args.appId}/analyticsReportRequests`);
  }

  // Apple 的层级是 请求 → 报表 → 实例（按天/周/月生成）→ 分片，分片挂在实例下面
  async listAnalyticsReportInstances(args: {
    reportId: string;
    granularity?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    processingDate?: string;
    limit?: number;
  }): Promise<any> {
    const { reportId, granularity, processingDate, limit = 100 } = args;

    validateRequired(args, ['reportId']);

    const params: Record<string, any> = { limit: sanitizeLimit(limit) };
    Object.assign(params, buildFilterParams({ granularity, processingDate }));

    return this.client.get(`/analyticsReports/${reportId}/instances`, params);
  }

  async listAnalyticsReportSegments(args: {
    instanceId: string;
    limit?: number;
  }): Promise<ListAnalyticsReportSegmentsResponse> {
    const { instanceId, limit = 100 } = args;

    validateRequired(args, ['instanceId']);

    return this.client.get<ListAnalyticsReportSegmentsResponse>(`/analyticsReportInstances/${instanceId}/segments`, {
      limit: sanitizeLimit(limit)
    });
  }

  async downloadAnalyticsReportSegment(args: {
    segmentUrl: string;
    maxChars?: number;
  }): Promise<{ data: string; contentType: string; size: string; truncated: boolean; totalChars: number }> {
    const { segmentUrl, maxChars = 50000 } = args;

    validateRequired(args, ['segmentUrl']);

    const res = await this.client.downloadFromUrl(segmentUrl);
    const totalChars = res.data.length;
    const truncated = totalChars > maxChars;
    return { ...res, data: truncated ? res.data.slice(0, maxChars) : res.data, truncated, totalChars };
  }

  async downloadSalesReport(args: {
    vendorNumber?: string;
    reportType?: SalesReportType;
    reportSubType?: SalesReportSubType;
    frequency?: SalesReportFrequency;
    reportDate: string;
  }): Promise<SalesReportResponse> {
    const { 
      vendorNumber = this.config?.vendorNumber, 
      reportType = "SALES", 
      reportSubType = "SUMMARY", 
      frequency = "MONTHLY", 
      reportDate 
    } = args;
    
    if (!vendorNumber) {
      throw new Error('Vendor number is required. Please provide it as an argument or set APP_STORE_CONNECT_VENDOR_NUMBER environment variable.');
    }
    
    validateRequired({ reportDate }, ['reportDate']);

    const filters: SalesReportFilters = {
      reportDate,
      reportType,
      reportSubType,
      frequency,
      vendorNumber
    };

    return this.client.get<SalesReportResponse>('/salesReports', buildFilterParams(filters));
  }

  async downloadFinanceReport(args: {
    vendorNumber?: string;
    reportDate: string;
    regionCode: string;
  }): Promise<FinanceReportResponse> {
    const { vendorNumber = this.config?.vendorNumber, reportDate, regionCode } = args;
    
    if (!vendorNumber) {
      throw new Error('Vendor number is required. Please provide it as an argument or set APP_STORE_CONNECT_VENDOR_NUMBER environment variable.');
    }
    
    validateRequired({ reportDate, regionCode }, ['reportDate', 'regionCode']);

    const filters: FinanceReportFilters = {
      reportDate,
      regionCode,
      vendorNumber
    };

    return this.client.get<FinanceReportResponse>('/financeReports', buildFilterParams(filters));
  }
}