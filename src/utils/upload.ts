import axios from 'axios';
import type { UploadOperation } from '../types/index.js';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 按预留接口返回的 uploadOperations 把文件分片上传（截图、素材库、内购审核截图共用）
export async function uploadChunks(operations: UploadOperation[], buf: Buffer): Promise<void> {
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
