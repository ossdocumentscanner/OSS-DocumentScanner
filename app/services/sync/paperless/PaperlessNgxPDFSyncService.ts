import { File, Screen, knownFolders, path } from '@nativescript/core';
import { wrapNativeException } from '@nativescript/core/utils';
import { generatePDFASync } from 'plugin-nativeprocessor';
import type { DocFolder, OCRDocument } from '~/models/OCRDocument';
import { networkService } from '~/services/api';
import { DocumentEvents } from '~/services/documents';
import PDFExportCanvas from '~/services/pdf/PDFExportCanvas';
import { BasePDFSyncService, BasePDFSyncServiceOptions } from '~/services/sync/BasePDFSyncService';
import { PaperlessNgxSyncOptions, acquireToken, listDocuments, uploadDocument } from '~/services/sync/paperless/PaperlessNgx';
import { SERVICES_SYNC_MASK } from '~/services/sync/types';
import { PDF_EXT } from '~/utils/constants';
import { getPageColorMatrix } from '~/utils/matrix';
import type { FileStat } from '~/webdav';

export interface PaperlessNgxPDFSyncServiceOptions extends BasePDFSyncServiceOptions, PaperlessNgxSyncOptions {}

export class PaperlessNgxPDFSyncService extends BasePDFSyncService {
    shouldSync(force?: boolean, event?: DocumentEvents) {
        return (force || (event && this.autoSync)) && networkService.connected;
    }
    static type = 'paperless_pdf';
    type = PaperlessNgxPDFSyncService.type;
    syncMask = SERVICES_SYNC_MASK[PaperlessNgxPDFSyncService.type];
    serverUrl: string;
    token: string;
    username?: string;
    password?: string;

    static start(config?: { id: number; [k: string]: any }) {
        if (config) {
            const service = PaperlessNgxPDFSyncService.getOrCreateInstance();
            Object.assign(service, config);
            DEV_LOG && console.log('PaperlessNgxPDFSyncService', 'start', JSON.stringify({ ...config, token: config.token ? '[redacted]' : undefined }), service.autoSync);
            return service;
        }
    }

    override stop() {}

    /**
     * Paperless-ngx manages its own storage — no remote folder to create.
     */
    override async ensureRemoteFolder(): Promise<void> {
        // Ensure we have a valid token (acquire one if only username/password configured)
        if (!this.token && this.username && this.password) {
            this.token = await acquireToken(this.serverUrl, this.username, this.password);
        }
    }

    override async getRemoteFolderFiles(_relativePath: string): Promise<FileStat[]> {
        const documents = await listDocuments({ serverUrl: this.serverUrl, token: this.token });
        return documents.map((doc) => {
            const baseName = doc.original_file_name || `${doc.title}.pdf`;
            const displayName = baseName.endsWith(PDF_EXT) ? baseName : `${baseName}${PDF_EXT}`;
            return {
                filename: displayName,
                basename: displayName,
                lastmod: doc.modified || doc.added || new Date().toISOString(),
                size: 0,
                type: 'file' as const,
                mime: 'application/pdf'
            };
        });
    }

    override async writePDF(document: OCRDocument, fileName: string, _docFolder?: DocFolder) {
        const pages = document.pages;
        if (!pages || pages.length === 0) {
            return;
        }
        if (!fileName.endsWith(PDF_EXT)) {
            fileName += PDF_EXT;
        }
        const temp = knownFolders.temp().path;

        if (__ANDROID__) {
            const exportOptions = this.exportOptions;
            const black_white = exportOptions.color === 'black_white';
            const options = JSON.stringify({
                overwrite: true,
                text_scale: Screen.mainScreen.scale * 1.4,
                pages: pages.map((p) => ({ ...p, colorMatrix: getPageColorMatrix(p, black_white ? 'grayscale' : undefined) })),
                ...exportOptions
            });
            await generatePDFASync(temp, fileName, options, wrapNativeException);
        } else {
            const exporter = new PDFExportCanvas();
            await exporter.export({ pages: pages.map((page) => ({ page, document })), folder: temp, filename: fileName, compress: true, options: this.exportOptions });
        }
        const localFilePath = path.join(temp, fileName);
        await uploadDocument({ serverUrl: this.serverUrl, token: this.token }, fileName, File.fromPath(localFilePath));
    }
}
