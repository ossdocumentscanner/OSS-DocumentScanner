import { File, Folder, knownFolders, path } from '@nativescript/core';
import dayjs from 'dayjs';
import { DOCUMENT_DATA_FILENAME, EVENT_DOCUMENT_ADDED, FOLDERS_DATA_FILENAME } from '~/utils/constants';
import { basename } from '~/utils/path';
import { unzip, zip } from 'plugin-zip';
import { DocumentsService } from './documents';
import { copyFolderContent } from '~/utils/file';
import type { DocFolder } from '~/models/OCRDocument';

const BACKUP_FILENAME_PREFIX = `${__APP_ID__}_backup_`;

export class BackupService {
    static async createBackup(documentsService: DocumentsService, zipPath: string): Promise<boolean> {
        const tempBackupDir = knownFolders.temp().getFolder(`backup_${Date.now()}`, true);

        try {
            const dataFolder = documentsService.dataFolder;
            const localDocuments = await documentsService.documentRepository.findDocuments();
            const backupDataFolder = tempBackupDir.getFolder('data', true);
            for (let index = 0; index < localDocuments.length; index++) {
                const document = localDocuments[index];
                const docFolder = dataFolder.getFolder(document.id);
                const backupDocFolder = Folder.fromPath(path.join(backupDataFolder.path, document.id), true);
                await this.copyFolderRecursive(docFolder.path, backupDocFolder.path);
                await File.fromPath(path.join(backupDocFolder.path, DOCUMENT_DATA_FILENAME)).writeText(document.toString());
            }

            const folders = await documentsService.folderRepository.search();
            const foldersData = JSON.stringify(folders.map((f) => f.toJSON()));
            await File.fromPath(path.join(tempBackupDir.path, FOLDERS_DATA_FILENAME)).writeText(foldersData);

            const zipFileName = `${BACKUP_FILENAME_PREFIX}${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.zip`;
            const outputZipPath = Folder.fromPath(zipPath).getFile(zipFileName, true).path;

            let nURL: NSURL;

            // on IOS we need to use startAccessingSecurityScopedResource if we write in non local app sandbox paths (like NSDocumentsDirectory, NSCachesDirectory)
            if (__IOS__) {
                nURL = NSURL.fileURLWithPathIsDirectory(outputZipPath, true);
                nURL.startAccessingSecurityScopedResource();
            }
            await zip({ directory: tempBackupDir.path, archive: outputZipPath, keepParent: false });
            if (__IOS__) {
                nURL?.stopAccessingSecurityScopedResource();
            }

            await tempBackupDir.remove();

            return true;
        } catch (error) {
            if (Folder.exists(tempBackupDir.path)) {
                await tempBackupDir.remove();
            }
            throw error;
        }
    }

    static async restoreBackup(documentsService: DocumentsService, zipPath: string): Promise<void> {
        const tempRestoreDir = knownFolders.temp().getFolder(`restore_${Date.now()}`);

        try {
            await unzip({ archive: zipPath, directory: tempRestoreDir.path });

            const foldersFile = tempRestoreDir.getFile(FOLDERS_DATA_FILENAME);
            if (File.exists(foldersFile.path)) {
                const foldersData = JSON.parse(foldersFile.readTextSync());
                for (const folderData of foldersData) {
                    try {
                        const existing = await documentsService.folderRepository.existsById(folderData.id);
                        DEV_LOG && console.log('existing', existing);
                        if (existing) {
                            continue;
                        }
                        await documentsService.folderRepository.create(folderData);
                    } catch (error) {
                        DEV_LOG && console.error('Error creating folder:', error);
                    }
                }
            }

            const backupDataFolder = tempRestoreDir.getFolder('data');
            if (Folder.exists(backupDataFolder.path)) {
                const docDirs = await backupDataFolder.getEntities();
                for (const docDir of docDirs) {
                    if (docDir instanceof Folder) {
                        await this.restoreDocument(documentsService, docDir);
                    }
                }
            }

            await tempRestoreDir.remove();
        } catch (error) {
            if (Folder.exists(tempRestoreDir.path)) {
                await tempRestoreDir.remove();
            }
            throw error;
        }
    }

    private static async restoreDocument(documentsService: DocumentsService, docFolder: Folder): Promise<void> {
        const dataFile = docFolder.getFile(DOCUMENT_DATA_FILENAME);
        if (!File.exists(dataFile.path)) {
            return;
        }

        const docData = JSON.parse(dataFile.readTextSync());
        const { db_version, folders, pages, ...docProps } = docData;
        const existing = await documentsService.documentRepository.existsById(docProps.id);
        DEV_LOG && console.log('existing', existing);
        if (existing) {
            return;
        }
        try {
            const doc = await documentsService.documentRepository.createDocument({
                ...docProps,
                folders,
                _synced: 0
            });

            const targetDocFolder = documentsService.dataFolder.getFolder(doc.id);
            await this.copyFolderRecursive(docFolder.path, targetDocFolder.path);

            if (pages && pages.length > 0) {
                pages.forEach((page) => {
                    const pageDataFolder = targetDocFolder.getFolder(page.id);
                    // the original image can be missing: it is not kept for every page
                    if (page.sourceImagePath) {
                        page.sourceImagePath = path.join(pageDataFolder.path, basename(page.sourceImagePath));
                    }
                    page.imagePath = path.join(pageDataFolder.path, basename(page.imagePath));
                });
                await doc.addPages(pages, true, true);
            }
            let folder: DocFolder;
            if (folders) {
                folder = await documentsService.folderRepository.get(folders[0]);
            }
            documentsService.notify({ eventName: EVENT_DOCUMENT_ADDED, doc, folder });
        } catch (error) {
            DEV_LOG && console.error('Error restoring document:', docProps.id, error);
            throw error;
        }
    }

    private static async copyFolderRecursive(srcPath: string, dstPath: string): Promise<void> {
        return copyFolderContent(srcPath, dstPath);
    }
}
