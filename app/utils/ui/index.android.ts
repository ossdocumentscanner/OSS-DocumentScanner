import { lc } from '@nativescript-community/l';
import { AndroidActivityNewIntentEventData, Application, Color, Frame, Utils, View } from '@nativescript/core';
import { throttle } from '@nativescript/core/utils';
import { showError } from '@shared/utils/showError';
import { Dayjs } from 'dayjs';
import { documentsService } from '~/services/documents';
import { ocrService } from '~/services/ocr';
import { securityService } from '~/services/security';
import { isGoogleWalletUrl } from '~/utils/google-wallet';
import { copyOCRToClipboard, getOCRFromCamera, goToDocumentView, importAndScanImageOrPdfFromUris, importFromGoogleWalletLink, importPKPassFromUris, onStartCam, requestStoragePermission } from './index.common';

export * from './index.common';

export { onBackButton } from '@shared/utils/ui';

export function showToast(text: string) {
    android.widget.Toast.makeText(Utils.android.getApplicationContext(), text, android.widget.Toast.LENGTH_SHORT).show();
}

export function showToolTip(tooltip: string, view?: View) {
    android.widget.Toast.makeText(Utils.android.getApplicationContext(), tooltip, android.widget.Toast.LENGTH_SHORT).show();
}

async function innerOnAndroidIntent(event: AndroidActivityNewIntentEventData) {
    if (__ANDROID__) {
        // DEV_LOG && console.log('innerOnAndroidIntent', Application.servicesStarted, securityService.validating);
        if (Application.servicesStarted !== true) {
            return Application.once('servicesStarted', () => innerOnAndroidIntent(event));
        }
        if (securityService.validating) {
            return securityService.once('validated', () => innerOnAndroidIntent(event));
        }
        try {
            const intent = event.intent as android.content.Intent;
            const action = intent.getAction();
            let uris: string[] = [];
            const pkpassUris: string[] = [];
            const googleWalletUrls: string[] = [];
            switch (action) {
                case 'android.intent.action.SEND':
                    const imageUri = intent.getParcelableExtra('android.intent.extra.STREAM') as android.net.Uri;
                    if (imageUri) {
                        const uri = imageUri.toString();
                        if (CARD_APP && isPKPassUri(intent, uri)) {
                            pkpassUris.push(uri);
                        } else {
                            uris.push(uri);
                        }
                    }
                    break;
                case 'android.intent.action.VIEW':
                    const uri = intent.getData();
                    DEV_LOG && console.log('uris', uri);
                    if (uri) {
                        const uriStr = uri.toString();
                        if (CARD_APP && isGoogleWalletUrl(uriStr)) {
                            googleWalletUrls.push(uriStr);
                        } else if (CARD_APP && isPKPassUri(intent, uriStr)) {
                            pkpassUris.push(uriStr);
                        } else {
                            uris.push(uriStr);
                        }
                    }
                    break;
                case 'android.intent.action.SEND_MULTIPLE':
                    const imageUris = intent.getParcelableArrayListExtra('android.intent.extra.STREAM') as java.util.ArrayList<android.net.Uri>;
                    if (imageUris) {
                        for (let index = 0; index < imageUris.size(); index++) {
                            const uri = imageUris.get(index).toString();
                            if (CARD_APP && isPKPassUri(intent, uri)) {
                                pkpassUris.push(uri);
                            } else {
                                uris.push(uri);
                            }
                        }
                    }
                    break;
                case 'com.akylas.documentscanner.OPEN_CAMERA':
                    setTimeout(() => {
                        onStartCam();
                    }, 0);
                    break;
                case 'com.akylas.documentscanner.OCR_CAMERA_CLIPBOARD':
                    setTimeout(async () => {
                        if (ocrService.downloadedLanguages.length === 0) {
                            showToast(lc('ocr_missing_languages'));
                            return;
                        }
                        const result = await getOCRFromCamera();
                        DEV_LOG && console.log('result', result);
                        if (result) {
                            copyOCRToClipboard(result.text);
                            showToast(lc('copied'));
                        } else {
                            showToast(lc('no_document_found'));
                        }
                    }, 0);
                    break;
                case 'android.intent.action.MAIN':
                    const extras = intent.getExtras();
                    const bundleAction = extras?.getString('action');
                    switch (bundleAction) {
                        case 'view':
                            const id = extras?.getString('id');
                            DEV_LOG && console.log('intent android.intent.action.MAIN view', id);
                            if (id) {
                                const document = await documentsService.documentRepository.get(id);
                                if (document) {
                                    goToDocumentView(document);
                                }
                            }
                            break;
                    }
                    break;
            }
            if (__ANDROID__ && uris.length) {
                DEV_LOG && console.log('innerOnAndroidIntent uris', action, uris);
                const needsStoragePermission = uris.find((d) => d.startsWith('file://'));
                if (needsStoragePermission) {
                    await requestStoragePermission();
                    uris = uris.map((u) => {
                        if (u.startsWith('file://')) {
                            const newUri = androidx.core.content.FileProvider.getUriForFile(
                                Utils.android.getApplicationContext(),
                                __APP_ID__ + '.provider',
                                new java.io.File(u.replace('file://', ''))
                            );
                            return newUri?.toString() || u;
                        } else {
                            return u;
                        }
                    });
                }
            }
            if (CARD_APP && googleWalletUrls.length) {
                for (const url of googleWalletUrls) {
                    await importFromGoogleWalletLink({ url });
                }
            }
            if (CARD_APP && pkpassUris.length) {
                await importPKPassFromUris({ uris: pkpassUris });
            }
            if (uris.length) {
                await importAndScanImageOrPdfFromUris({ uris });
            }
        } catch (error) {
            showError(error);
        }
    }
}

function isPKPassUri(intent: android.content.Intent, uri: string): boolean {
    const mimeType = intent.getType();
    if (mimeType) {
        const mimeTypeLower = mimeType.toLowerCase();
        if (mimeTypeLower.includes('pkpass') || mimeTypeLower.includes('espass')) {
            return true;
        }
    }
    // Check file extension as fallback
    const uriLower = uri.toLowerCase();
    return uriLower.endsWith('.pkpass') || uriLower.endsWith('.espass');
}
export const onAndroidNewItent = throttle(async function onAndroidNewItent(event: AndroidActivityNewIntentEventData) {
    DEV_LOG && console.log('onAndroidNewItent', Application.servicesStarted, securityService.validating);
    innerOnAndroidIntent(event);
}, 500);

// TODO: move to a plugin
export async function pickColor(color: Color | string, options: { alpha?: boolean; anchor?: View } = {}) {
    return new Promise<Color>((resolve) => {
        const activity = Application.android.startActivity;

        const builder = new com.skydoves.colorpickerview.ColorPickerDialog.Builder(activity)
            .setTitle(lc('pick_color'))
            .attachAlphaSlideBar(options.alpha !== false)
            .setPositiveButton(
                lc('choose'),
                new com.skydoves.colorpickerview.listeners.ColorListener({
                    onColorSelected(color: number) {
                        resolve(new Color(color));
                    }
                })
            )
            .setNegativeButton(
                lc('cancel'),
                new android.content.DialogInterface.OnClickListener({
                    onClick(dialogInterface) {
                        dialogInterface.dismiss();
                        resolve(null);
                    }
                })
            )
            .setBottomSpace(12); // set a bottom space between the last slidebar and buttons.

        if (color && !(color instanceof Color)) {
            color = new Color(color as any);
        }
        if (color) {
            builder.getColorPickerView().setInitialColor((color as Color).android);
        }
        const popup = builder.create();
        popup.show();
    });
}

export async function pickDate(currentDate: Dayjs) {
    return new Promise<number>((resolve, reject) => {
        const datePicker = com.google.android.material.datepicker.MaterialDatePicker.Builder.datePicker().setTitleText(lc('pick_date')).setSelection(new java.lang.Long(currentDate.valueOf())).build();
        datePicker.addOnDismissListener(
            new android.content.DialogInterface.OnDismissListener({
                onDismiss: () => {
                    resolve(datePicker.getSelection().longValue());
                }
            })
        );
        const parentView = Frame.topmost() || Application.getRootView();
        datePicker.show(parentView._getRootFragmentManager(), 'datepicker');
    });
}
