import { ApplicationSettings, File, Folder, knownFolders, path } from '@nativescript/core';
import type { DocFolder, OCRDocument, PageData } from '~/models/OCRDocument';
import { PKPass, PKPassType } from '~/models/PKPass';
import { DocumentAddedEventData, documentsService } from '~/services/documents';
import { DOCUMENT_NAME_FORMAT, EVENT_DOCUMENT_ADDED, SETTINGS_DOCUMENT_NAME_FORMAT } from '~/utils/constants';
import { convertGoogleWalletObjectToPKPassData, parseGoogleWalletUrl } from '~/utils/google-wallet';
import { getPKPassDisplayName } from '~/utils/pkpass';
import { getFormatedDateForFilename } from '~/utils/utils.common';

/**
 * Import a Google Wallet "Save to Wallet" URL and create one card document
 * whose pages correspond to the individual pass objects embedded in the JWT.
 *
 * Because the Google Wallet JWT in most real-world links only contains pass
 * *references* (classId + id) rather than full embedded pass objects, the
 * importer stores the original URL as a QR-code barcode on each page.  This
 * lets users tap the barcode to display a scannable QR code that opens the
 * pass in any Google Wallet-compatible app.
 *
 * When the JWT contains fully embedded pass objects (e.g. from transit
 * operators that include all fields) the available data is mapped to the
 * corresponding PKPass fields.
 *
 * @param googleWalletUrl  The full pay.google.com/gp/v/save/… URL
 * @param folder           Optional folder to add the resulting document to
 * @returns                The created OCRDocument
 */
export async function importGoogleWalletUrl(googleWalletUrl: string, folder?: DocFolder): Promise<OCRDocument> {
    // Parse the URL / JWT — wrap in a try-catch to provide a user-friendly message
    let parseResult;
    try {
        parseResult = parseGoogleWalletUrl(googleWalletUrl);
    } catch (error) {
        throw new Error(`Failed to import Google Wallet link: ${error?.message || error}`);
    }
    const { passKind, objects, organizationName } = parseResult;

    const date = Date.now();
    const docId = date.toString();

    // Derive a document name from the organisation and, if there's only one
    // object, from that object's id.
    const docName =
        organizationName ||
        getFormatedDateForFilename(date, ApplicationSettings.getString(SETTINGS_DOCUMENT_NAME_FORMAT, DOCUMENT_NAME_FORMAT), false);

    // Create the parent document
    const doc = await documentsService.documentRepository.createDocument({
        id: docId,
        name: docName,
        ...(folder ? { folders: [folder.id] } : {})
    } as any);

    const pagesData: PageData[] = [];

    for (let index = 0; index < objects.length; index++) {
        const obj = objects[index];

        // Convert the Google Wallet object to a PKPassData structure
        const passData = convertGoogleWalletObjectToPKPassData(obj, passKind, googleWalletUrl, organizationName, index);

        // Create a PKPass instance
        const pageId = `${date}_${index}`;
        const pass = new PKPass(pageId + '_pkpass', pageId, PKPassType.PKPass);
        pass.passData = passData;
        pass.images = {};
        pass.createdDate = date;

        // Persist the PKPass folder structure so that the rendering pipeline
        // (which looks for pass.json inside <pageId>/pkpass/) can work.
        const docFolder = doc.folderPath;
        const pageFolder = docFolder.getFolder(pageId);
        const pkpassFolderPath = pageFolder.getFolder('pkpass').path;
        const passJsonPath = path.join(pkpassFolderPath, 'pass.json');

        // Write the minimal pass.json
        const passJsonFile = File.fromPath(passJsonPath);
        await passJsonFile.writeText(JSON.stringify(passData, null, 2));

        // Save the PKPass record to the database
        const pkPassObj = await documentsService.pkpassRepository.createPKPass(pass);

        pagesData.push({
            id: pageId,
            pkpass_id: pkPassObj.id,
            extra: {
                color: passData.backgroundColor
            }
        } as PageData);
    }

    // Add all pages to the document in one call
    await doc.addPages(pagesData, false, true);

    // Attach the in-memory PKPass objects to the pages so that the view is
    // immediately populated without a DB round-trip.
    for (let i = 0; i < doc.pages.length; i++) {
        const page = doc.pages[i];
        const pkPassObj = await documentsService.pkpassRepository.get(pagesData[i].pkpass_id);
        if (pkPassObj) {
            page.pkpass = pkPassObj;
        }
    }

    // Update the document name from the first pass display name when available
    const firstPage = doc.pages[0];
    if (firstPage?.pkpass) {
        const displayName = getPKPassDisplayName(firstPage.pkpass);
        if (displayName && displayName !== docName) {
            await doc.save({ name: displayName }, false, false);
        } else {
            await doc.save({}, false, false);
        }
    } else {
        await doc.save({}, false, false);
    }

    DEV_LOG && console.log('Google Wallet imported successfully', doc.id, 'pages', doc.pages.length);

    documentsService.notify({ eventName: EVENT_DOCUMENT_ADDED, doc, folder } as DocumentAddedEventData);

    return doc;
}
