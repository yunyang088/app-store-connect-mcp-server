import axios from 'axios';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { AppStoreConnectClient } from '../services/index.js';
import {
  ListAppScreenshotSetsResponse,
  AppScreenshotSetResponse,
  AppScreenshotSetCreateRequest,
  ListAppScreenshotsResponse,
  AppScreenshotResponse,
  AppScreenshotCreateRequest,
  AppScreenshotUpdateRequest
} from '../types/index.js';
import { validateRequired, sanitizeLimit } from '../utils/index.js';

export class ScreenshotHandlers {
  constructor(private client: AppStoreConnectClient) {}

  async listAppScreenshotSets(args: {
    appStoreVersionLocalizationId: string;
    limit?: number;
  }): Promise<ListAppScreenshotSetsResponse> {
    const { appStoreVersionLocalizationId, limit = 100 } = args;

    validateRequired(args, ['appStoreVersionLocalizationId']);

    return this.client.get<ListAppScreenshotSetsResponse>(
      `/appStoreVersionLocalizations/${appStoreVersionLocalizationId}/appScreenshotSets`,
      { limit: sanitizeLimit(limit) }
    );
  }

  async createAppScreenshotSet(args: {
    appStoreVersionLocalizationId: string;
    screenshotDisplayType: string;
  }): Promise<AppScreenshotSetResponse> {
    const { appStoreVersionLocalizationId, screenshotDisplayType } = args;

    validateRequired(args, ['appStoreVersionLocalizationId', 'screenshotDisplayType']);

    const requestData: AppScreenshotSetCreateRequest = {
      data: {
        type: 'appScreenshotSets',
        attributes: {
          screenshotDisplayType
        },
        relationships: {
          appStoreVersionLocalization: {
            data: {
              type: 'appStoreVersionLocalizations',
              id: appStoreVersionLocalizationId
            }
          }
        }
      }
    };

    return this.client.post<AppScreenshotSetResponse>(
      '/appScreenshotSets',
      requestData
    );
  }

  async listAppScreenshots(args: {
    appScreenshotSetId: string;
    limit?: number;
  }): Promise<ListAppScreenshotsResponse> {
    const { appScreenshotSetId, limit = 100 } = args;

    validateRequired(args, ['appScreenshotSetId']);

    return this.client.get<ListAppScreenshotsResponse>(
      `/appScreenshotSets/${appScreenshotSetId}/appScreenshots`,
      { limit: sanitizeLimit(limit) }
    );
  }

  async deleteAppScreenshot(args: {
    appScreenshotId: string;
  }): Promise<{ success: boolean; appScreenshotId: string }> {
    const { appScreenshotId } = args;

    validateRequired(args, ['appScreenshotId']);

    await this.client.delete(`/appScreenshots/${appScreenshotId}`);

    return { success: true, appScreenshotId };
  }

  async uploadAppScreenshot(args: {
    appScreenshotSetId: string;
    filePath: string;
  }): Promise<AppScreenshotResponse> {
    const { appScreenshotSetId, filePath } = args;

    validateRequired(args, ['appScreenshotSetId', 'filePath']);

    const buf = await readFile(filePath);
    const fileName = path.basename(filePath);

    // Step 1: reserve the screenshot resource
    const createRequest: AppScreenshotCreateRequest = {
      data: {
        type: 'appScreenshots',
        attributes: {
          fileName,
          fileSize: buf.length
        },
        relationships: {
          appScreenshotSet: {
            data: {
              type: 'appScreenshotSets',
              id: appScreenshotSetId
            }
          }
        }
      }
    };

    const created = await this.client.post<AppScreenshotResponse>('/appScreenshots', createRequest);
    const shot = created.data;

    // Step 2: upload each chunk using the returned upload operations
    const uploadOperations = shot.attributes.uploadOperations ?? [];
    for (const op of uploadOperations) {
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

    // Step 3: mark the screenshot as uploaded with its md5 checksum
    const updateRequest: AppScreenshotUpdateRequest = {
      data: {
        type: 'appScreenshots',
        id: shot.id,
        attributes: {
          uploaded: true,
          sourceFileChecksum: createHash('md5').update(buf).digest('hex')
        }
      }
    };

    return this.client.patch<AppScreenshotResponse>(
      `/appScreenshots/${shot.id}`,
      updateRequest
    );
  }
}
