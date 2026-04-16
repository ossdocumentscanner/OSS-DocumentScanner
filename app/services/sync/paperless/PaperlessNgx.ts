import { HttpsRequestOptions } from '@nativescript-community/https';
import { File } from '@nativescript/core';
import { request } from '~/services/api';
import type { BufferLike } from '~/services/api';

export interface PaperlessServiceContext {
    serverUrl: string;
    token: string;
    username?: string;
    password?: string;
}

export interface PaperlessNgxSyncOptions {
    serverUrl: string;
    token?: string;
    username?: string;
    password?: string;
}

export interface PaperlessDocument {
    id: number;
    title: string;
    content?: string;
    created?: string;
    modified?: string;
    added?: string;
    original_file_name?: string;
    archived_file_name?: string;
}

export interface PaperlessDocumentListResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: PaperlessDocument[];
}

function getBaseUrl(serverUrl: string): string {
    return serverUrl.replace(/\/+$/, '');
}

function getAuthHeaders(token: string): Record<string, string> {
    if (token) {
        return {
            Authorization: `Token ${token}`
        };
    }
    return {};
}

export async function makeRequest<T = any>(service: PaperlessServiceContext, endpoint: string, options: Partial<HttpsRequestOptions> = {}) {
    const { headers = {}, ...others } = options;
    const baseUrl = getBaseUrl(service.serverUrl);

    const requestOptions = {
        url: `${baseUrl}${endpoint}`,
        headers: {
            ...getAuthHeaders(service.token),
            ...headers
        },
        responseOnMainThread: false,
        ...others
    } as HttpsRequestOptions;
    return request<T>(requestOptions);
}

/**
 * Acquire a token from Paperless-ngx using username/password credentials.
 * POST /api/token/
 */
export async function acquireToken(service: PaperlessServiceContext, username: string, password: string): Promise<string> {
    const response = await makeRequest<{ token: string }>(service, `/api/token/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: { username, password }
    });
    const data = await response.json();
    return data.token;
}

export async function ensureToken(service: PaperlessServiceContext) {
    if (!service.token && service.username && service.password) {
        service.token = await acquireToken(service, service.username, service.password);
    }
    return service.token;
}

/**
 * Test the connection to a Paperless-ngx server.
 * Returns true if successful, false otherwise.
 */
export async function testPaperlessConnection({ serverUrl, token, username, password }: PaperlessNgxSyncOptions): Promise<boolean> {
    try {
        let authToken = token;
        if (!authToken && username && password) {
            authToken = await acquireToken({ serverUrl, token: undefined }, username, password);
        }
        const baseUrl = getBaseUrl(serverUrl);
        const response = await request<PaperlessDocumentListResponse>({
            url: `${baseUrl}/api/documents/?page_size=1`,
            method: 'GET',
            headers: {
                ...getAuthHeaders(authToken),
                'Content-Type': 'application/json'
            }
        });
        await response.json();
        return true;
    } catch (error) {
        console.error('PaperlessNgx connection test failed', error, error?.stack);
        return false;
    }
}

/**
 * List documents from Paperless-ngx. Fetches all pages.
 */
export async function listDocuments(service: PaperlessServiceContext): Promise<PaperlessDocument[]> {
    await ensureToken(service);
    const baseUrl = getBaseUrl(service.serverUrl);
    const results: PaperlessDocument[] = [];
    let nextUrl: string | null = `${baseUrl}/api/documents/?page_size=100&fields=id,title,modified,added,original_file_name`;

    while (nextUrl) {
        const response = await makeRequest<PaperlessDocumentListResponse>(service, '', {
            url: nextUrl,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        results.push(...data.results);
        nextUrl = data.next;
    }
    return results;
}

/**
 * Upload a PDF document to Paperless-ngx via POST /api/documents/post_document/
 * Returns the task UUID.
 */
export async function uploadDocument(service: PaperlessServiceContext, title: string, fileData: File | BufferLike | string): Promise<string> {
    await ensureToken(service);
    const fileName = title.endsWith('.pdf') ? title : `${title}.pdf`;

    const response = await makeRequest<string>(service, '/api/documents/post_document/', {
        method: 'POST',
        headers: {
            'Content-Type': 'multipart/form-data'
        },
        body: [
            {
                parameterName: 'title',
                data: title.replace(/\.pdf$/i, ''),
                contentType: 'text/plain'
            },
            {
                parameterName: 'document',
                fileName,
                contentType: 'application/pdf',
                data: fileData
            }
        ]
    });
    return response.text();
}
