import { Folder, path } from '@nativescript/core';
import { DB_VERSION, DocFolder, OCRDocument, OCRPage, getDocumentsService } from '~/models/OCRDocument';
import { FileStat, GetFileContentsOptions } from '~/webdav';
import { BaseSyncService, BaseSyncServiceOptions } from './BaseSyncService';
import { SilentError } from '@akylas/nativescript-app-utils/error';
import { lc } from '@nativescript-community/l';
import { basename } from '~/utils/path';
import { DELETED_DOCUMENTS_DATA_FILENAME, DOCUMENT_DATA_FILENAME, VALID_MARKER_FILENAME } from '~/utils/constants';
import { ResponseData, ResponseDataDetailed } from '~/services/sync/interfaces';
import { type DeletedDocumentEntry, mergeDeletedDocumentTombstones } from '~/services/sync/deletedDocuments';

export type BaseDataSyncServiceOptions = BaseSyncServiceOptions;
export type { DeletedDocumentEntry };

export abstract class BaseDataSyncService extends BaseSyncService {
    allowToRemoveOnRemote: boolean = true;

    remoteFolder = '';
    abstract ensureRemoteFolder(): Promise<void>;
    abstract getRemoteFolderDirectories(folderStr: string): Promise<FileStat[]>;
    abstract sendFolderToRemote(folder: Folder, remotePath: string): Promise<any>;

    abstract fileExists(filename: string): Promise<boolean>;
    abstract getFileFromRemote(filename: string, document?: OCRDocument): Promise<any>;
    abstract putFileContents(relativePath: string, localFilePath: string, options?): Promise<any>;
    abstract putFileContentsFromData(relativePath: string, data: string, options?): Promise<any>;
    abstract deleteFile(relativePath: string): Promise<any>;

    abstract getFileContents<V extends 'binary' | 'text' | 'file' = 'binary'>(filePath: string, options?: GetFileContentsOptions & { format?: V }): Promise<ResponseData<V>>;

    async getDeletedDocumentsManifest(): Promise<DeletedDocumentEntry[]> {
        try {
            const deletedDocuments = JSON.parse(await this.getFileFromRemote(DELETED_DOCUMENTS_DATA_FILENAME));
            return Array.isArray(deletedDocuments) ? deletedDocuments.filter((entry) => entry?.id && typeof entry.deletedDate === 'number') : [];
        } catch (error) {
            console.warn('invalid deleted documents manifest', error?.message || error);
            return [];
        }
    }

    async putDeletedDocumentsManifest(entries: DeletedDocumentEntry[]): Promise<void> {
        await this.putFileContentsFromData(DELETED_DOCUMENTS_DATA_FILENAME, JSON.stringify(entries), { overwrite: true });
    }

    async importFolderFromRemote(remoteRelativePath: string, folder: Folder, ignores?: string[]) {
        if (!folder?.path) {
            throw new Error('importFolderFromRemote missing folder');
        }
        DEV_LOG && console.log('importFolderFromRemote', remoteRelativePath, folder.path, ignores);
        const remoteDocuments = await this.getRemoteFolderDirectories(remoteRelativePath);
        for (let index = 0; index < remoteDocuments.length; index++) {
            const remoteDocument = remoteDocuments[index];
            if (ignores?.indexOf(remoteDocument.basename) >= 0) {
                continue;
            }
            if (remoteDocument.type === 'directory') {
                await this.importFolderFromRemote(path.join(remoteRelativePath, remoteDocument.basename), folder.getFolder(remoteDocument.basename));
            } else {
                await this.getFileContents(path.join(this.remoteFolder, remoteRelativePath, remoteDocument.basename), {
                    format: 'file',
                    destinationFilePath: path.join(folder.path, remoteDocument.basename)
                });
            }
        }
    }

    async importDocumentFromRemote(data: FileStat) {
        const hasValid = await this.hasValidMarker(data.basename);
        // for now we ignore hasValidMarker or otherwise we would not "import" legacy documents

        let remoteData: string;
        try {
            remoteData = await this.getFileContents(path.join(data.filename, DOCUMENT_DATA_FILENAME), {
                format: 'text'
            });
        } catch (error) {
            // Has .valid but no data.json - corrupt, skip it
            DEV_LOG && console.warn('importDocumentFromRemote: corrupt remote document (has .valid but no data.json)', data.basename, error.message, error.stack);
            return;
        }

        const dataJSON: OCRDocument & { pages: OCRPage[]; db_version?: number } = JSON.parse(remoteData);
        const { db_version, folders, pages, ...docProps } = dataJSON;
        if (db_version > DB_VERSION) {
            throw new SilentError(lc('document_need_updated_app', docProps.name));
        }
        let docId = docProps.id;
        let pageIds = [];
        let docDataFolder: Folder;
        try {
            DEV_LOG && console.log('importDocumentFromRemote creating document', JSON.stringify(docProps), JSON.stringify(folders));
            await getDocumentsService().documentRepository.delete({ id: docId } as any);
            const doc = await getDocumentsService().documentRepository.createDocument({ ...docProps, folders, _synced: 0 });
            docId = doc.id;
            docDataFolder = getDocumentsService().dataFolder.getFolder(docId);
            pages.forEach((page) => {
                const pageDataFolder = docDataFolder.getFolder(page.id);
                // the original image can be missing: it is not kept for every page
                if (page.sourceImagePath) {
                    page.sourceImagePath = path.join(pageDataFolder.path, basename(page.sourceImagePath));
                }
                page.imagePath = path.join(pageDataFolder.path, basename(page.imagePath));
            });
            pageIds = pages.map((p) => p.id);
            await this.importFolderFromRemote(data.basename, docDataFolder, [DOCUMENT_DATA_FILENAME, VALID_MARKER_FILENAME]);
            await doc.addPages(pages, true, true);

            let folder: DocFolder;
            if (folders) {
                const actualFolders = await Promise.all(folders.map((folderId) => getDocumentsService().folderRepository.get(folderId)));
                // in this case we only add folders which actually already exists in db. Means they have to be synced before
                for (let index = 0; index < actualFolders.length; index++) {
                    folder = actualFolders[index];
                    doc.setFolder({ folderId: folder.id });
                }
            }
            if (!hasValid) {
                await this.createValidMarker(doc.id);
            }

            return { doc, folder };
        } catch (error) {
            console.error('error while adding remote doc, let s remove it', docId, pageIds, error, error.stack);
            // there was an error while creating the doc. remove it so that we can try again later
            try {
                // await timeout(1000);
                if (docId) {
                    await getDocumentsService().documentRepository.delete({ id: docId } as any);
                    await Promise.all(pageIds.map((p) => getDocumentsService().pageRepository.delete({ id: p.id } as any)));
                }
                if (docDataFolder && Folder.exists(docDataFolder.path)) {
                    await docDataFolder.remove();
                }
            } catch (error2) {
                console.error('error while removing failed sync documennt', error2, error2.stack);
            }
            throw error;
        }
    }

    async addDocumentToRemote(document: OCRDocument) {
        DEV_LOG && console.log('addDocumentToWebdav', this.remoteFolder, document.id, document.pages);
        const docFolder = getDocumentsService().dataFolder.getFolder(document.id);

        // Remove existing .valid marker if it exists (to mark as invalid during sync)
        try {
            await this.removeValidMarker(document.id);
        } catch (error) {
            // Ignore errors - folder might not exist yet
        }

        await this.sendFolderToRemote(docFolder, document.id);
        await this.putFileContentsFromData(path.join(this.remoteFolder, document.id, DOCUMENT_DATA_FILENAME), document.toString());

        // Create .valid marker after successful sync
        await this.createValidMarker(document.id);

        // mark the document as synced
        // DEV_LOG && console.log('addDocumentToWebdav done saving synced state', document.id, document.pages);
    }

    // .valid marker file methods for safer sync
    async createValidMarker(documentId: string): Promise<void> {
        const validPath = path.join(this.remoteFolder, documentId, VALID_MARKER_FILENAME);
        await this.putFileContentsFromData(validPath, `${__APP_ID__}.${__APP_VERSION__}.${__APP_BUILD_NUMBER__}`, { overwrite: true });
    }

    async hasValidMarker(documentId: string): Promise<boolean> {
        const validPath = path.join(documentId, VALID_MARKER_FILENAME);
        return this.fileExists(validPath);
    }

    async removeValidMarker(documentId: string): Promise<void> {
        const validPath = path.join(this.remoteFolder, documentId, VALID_MARKER_FILENAME);
        try {
            await this.deleteFile(validPath);
        } catch (error) {
            // Ignore if .valid doesn't exist
            if (error.statusCode !== 404) {
                throw error;
            }
        }
    }
    async removeDocumentFromRemote(remoteRelativePath: string) {
        const remoteDocPath = path.join(this.remoteFolder, remoteRelativePath);
        DEV_LOG && console.log('removeDocumentFromRemote', remoteDocPath);
        return this.deleteFile(remoteDocPath);
        // const remoteDocuments = (await this.getRemoteFolderDirectories(remotePath)) as FileStat[];
        // for (let index = 0; index < remoteDocuments.length; index++) {
        //     const remoteDocument = remoteDocuments[index];
        //     if (ignores?.indexOf(remoteDocument.basename) >= 0) {
        //         continue;
        //     }
        //     if (remoteDocument.type === 'directory') {
        //         await this.importFolderFromWebdav(path.join(remotePath, remoteDocument.basename), folder.getFolder(remoteDocument.basename));
        //     } else {
        //         await this.client.getFileContents(path.join(remotePath, remoteDocument.basename), {
        //             format: 'file',
        //             destinationFilePath: path.join(folder.path, remoteDocument.basename)
        //         });
        //     }
        // }
    }
}
