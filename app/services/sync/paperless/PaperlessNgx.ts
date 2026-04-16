import { File } from '@nativescript/core';
import { request } from '~/services/api';
import type { BufferLike } from '~/services/api';

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
    return {
        Authorization: `Token ${token}`
    };
}

/**
 * Acquire a token from Paperless-ngx using username/password credentials.
 * POST /api/token/
 */
export async function acquireToken(serverUrl: string, username: string, password: string): Promise<string> {
    const baseUrl = getBaseUrl(serverUrl);
    const response = await request<{ token: string }>({
        url: `${baseUrl}/api/token/`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    return data.token;
}

/**
 * Test the connection to a Paperless-ngx server.
 * Returns true if successful, false otherwise.
 */
export async function testPaperlessConnection({ serverUrl, token, username, password }: PaperlessNgxSyncOptions): Promise<boolean> {
    try {
        let authToken = token;
        if (!authToken && username && password) {
            authToken = await acquireToken(serverUrl, username, password);
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
export async function listDocuments(options: PaperlessNgxSyncOptions): Promise<PaperlessDocument[]> {
    const baseUrl = getBaseUrl(options.serverUrl);
    const results: PaperlessDocument[] = [];
    let url: string | null = `${baseUrl}/api/documents/?page_size=100&fields=id,title,modified,added,original_file_name`;

    while (url) {
        const response = await request<PaperlessDocumentListResponse>({
            url,
            method: 'GET',
            headers: {
                ...getAuthHeaders(options.token),
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        results.push(...data.results);
        url = data.next;
    }
    return results;
}

/**
 * Upload a PDF document to Paperless-ngx via POST /api/documents/post_document/
 * Returns the task UUID.
 */
export async function uploadDocument(options: PaperlessNgxSyncOptions, title: string, fileData: File | BufferLike | string): Promise<string> {
    const baseUrl = getBaseUrl(options.serverUrl);
    const fileName = title.endsWith('.pdf') ? title : `${title}.pdf`;

    const response = await request<string>({
        url: `${baseUrl}/api/documents/post_document/`,
        method: 'POST',
        headers: {
            ...getAuthHeaders(options.token),
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
