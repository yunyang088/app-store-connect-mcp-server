import axios, { AxiosInstance } from 'axios';
import { gunzipSync } from 'zlib';
import { AuthService } from './auth.js';
import { AppStoreConnectConfig } from '../types/index.js';

export class AppStoreConnectClient {
  private axiosInstance: AxiosInstance;
  private authService: AuthService;

  constructor(config: AppStoreConnectConfig) {
    this.authService = new AuthService(config);
    this.authService.validateConfig();
    
    this.axiosInstance = axios.create({
      baseURL: 'https://api.appstoreconnect.apple.com/v1',
    });
  }

  async request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, data?: any, params?: Record<string, any>): Promise<T> {
    const token = await this.authService.generateToken();
    
    const response = await this.axiosInstance.request<T>({
      method,
      url,
      data,
      params,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  async get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
    return this.request<T>('GET', url, undefined, params);
  }

  async post<T = any>(url: string, data: any): Promise<T> {
    return this.request<T>('POST', url, data);
  }

  async put<T = any>(url: string, data: any): Promise<T> {
    return this.request<T>('PUT', url, data);
  }

  async delete<T = any>(url: string, data?: any): Promise<T> {
    return this.request<T>('DELETE', url, data);
  }

  async patch<T = any>(url: string, data: any): Promise<T> {
    return this.request<T>('PATCH', url, data);
  }

  async downloadFromUrl(url: string): Promise<{ data: string; contentType: string; size: string }> {
    // 分析报表分片的 url 是预签名的存储地址，再带 Authorization 头会被拒；只有 ASC API 自己的地址才带 token
    const headers: Record<string, string> = {};
    if (new URL(url).hostname === 'api.appstoreconnect.apple.com') {
      headers['Authorization'] = `Bearer ${await this.authService.generateToken()}`;
    }

    try {
      const response = await axios.get<ArrayBuffer>(url, { headers, responseType: 'arraybuffer' });
      return {
        data: AppStoreConnectClient.decodeBody(Buffer.from(response.data)),
        contentType: String(response.headers['content-type'] ?? ''),
        size: String(response.headers['content-length'] ?? '')
      };
    } catch (e: any) {
      // arraybuffer 模式下错误体也是二进制，转成文本方便看报错
      if (e?.response?.data && !(typeof e.response.data === 'string')) {
        e.response.data = Buffer.from(e.response.data).toString('utf8');
      }
      throw e;
    }
  }

  // 分片内容是 gzip 压缩的 TSV：是 gzip 就解压，否则按 utf8 原样返回
  private static decodeBody(buf: Buffer): string {
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      return gunzipSync(buf).toString('utf8');
    }
    return buf.toString('utf8');
  }
}