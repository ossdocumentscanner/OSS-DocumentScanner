import { PKBarcodeFormat, PKPassData, PKPassStyle, PKPassTransitType } from '~/models/PKPass';

/**
 * Utility module for parsing Google Wallet "Save to Wallet" links.
 *
 * A Google Wallet URL has the form:
 *   https://pay.google.com/gp/v/save/<JWT>
 *
 * The JWT payload follows the Google Wallet JWT specification and may contain
 * one or more of the following payload keys, each holding an array of object
 * references (or full embedded objects):
 *   - transitObjects
 *   - flightObjects
 *   - eventTicketObjects
 *   - loyaltyObjects
 *   - giftCardObjects
 *   - genericObjects
 *
 * When the JWT only holds object *references* (classId + id) the full pass
 * data is stored on Google's servers and would require authenticated API calls
 * to retrieve.  In that case this module creates a minimal PKPassData whose
 * barcode message is the original Google Wallet URL so that users can still
 * open the pass in any Google Wallet compatible reader.
 *
 * When the JWT holds *full* embedded objects (as sometimes issued by transit
 * operators) the available fields are mapped to the PKPassData structure.
 */

/** Google Wallet URL prefix */
export const GOOGLE_WALLET_URL_PREFIX = 'https://pay.google.com/gp/v/save/';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleWalletObjectRef {
    classId: string;
    id: string;
}

/** Recognised Google Wallet payload types and their PKPass style mapping */
export type GoogleWalletPassKind = 'transitObjects' | 'flightObjects' | 'eventTicketObjects' | 'loyaltyObjects' | 'giftCardObjects' | 'genericObjects';

export interface GoogleWalletJWTPayload {
    iss?: string;
    aud?: string;
    typ?: string;
    iat?: string | number;
    origins?: string[];
    payload?: {
        transitObjects?: (GoogleWalletObjectRef | any)[];
        flightObjects?: (GoogleWalletObjectRef | any)[];
        eventTicketObjects?: (GoogleWalletObjectRef | any)[];
        loyaltyObjects?: (GoogleWalletObjectRef | any)[];
        giftCardObjects?: (GoogleWalletObjectRef | any)[];
        genericObjects?: (GoogleWalletObjectRef | any)[];
    };
}

export interface GoogleWalletParseResult {
    jwtPayload: GoogleWalletJWTPayload;
    /** Original Google Wallet URL (used as barcode) */
    originalUrl: string;
    /** Extracted pass kind (first kind found in the payload) */
    passKind: GoogleWalletPassKind;
    /** All pass objects (references or embedded) from the primary kind */
    objects: (GoogleWalletObjectRef | any)[];
    /** Human-readable organisation name derived from origins or iss */
    organizationName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the given string looks like a Google Wallet "Save to Wallet" URL.
 */
export function isGoogleWalletUrl(url: string): boolean {
    if (!url) {
        return false;
    }
    return url.startsWith(GOOGLE_WALLET_URL_PREFIX);
}

/**
 * Base-64 URL decode a JWT segment (no padding required).
 * Works in both NativeScript (Node-like) and browser environments.
 */
function base64UrlDecode(segment: string): string {
    // Convert base64url to base64
    let base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    // Decode - atob is available in NativeScript, node Buffer otherwise
    try {
        if (typeof atob !== 'undefined') {
            return atob(base64);
        }
        // Fallback: NativeScript Android / iOS provide global Buffer
        return (global as any).Buffer.from(base64, 'base64').toString('utf-8');
    } catch {
        return '';
    }
}

/**
 * Decode the JWT payload segment without validating the signature.
 * We intentionally skip signature verification here because:
 * 1. We don't have Google's public keys readily available
 * 2. The URL itself was obtained from a trusted source (scanned QR / opened link)
 * 3. We only extract metadata for display, no security-critical operations are performed
 *
 * Some Google Wallet JWTs (notably SNCF Connect) set `"iat":\"\"` with raw
 * backslash-escaped quotes that produce invalid JSON.  We sanitise this before
 * parsing by replacing the problematic value with null.
 */
function decodeJWTPayload(jwt: string): GoogleWalletJWTPayload | null {
    try {
        const parts = jwt.split('.');
        if (parts.length < 2) {
            return null;
        }
        const decoded = base64UrlDecode(parts[1]);
        if (!decoded) {
            return null;
        }

        // First attempt: parse as-is
        try {
            return JSON.parse(decoded) as GoogleWalletJWTPayload;
        } catch {
            // Fall through to sanitised parse
        }

        // Sanitise known invalid patterns before retrying.
        //
        // Some issuers (observed in SNCF Connect JWTs) set the `iat` claim to a
        // raw backslash-escaped empty string that looks like:
        //   "iat":\"\"
        // rather than the valid:
        //   "iat":""
        // The backslash character (0x5C) placed before each double-quote makes
        // the value invalid JSON.  We replace such patterns with `null` so the
        // rest of the well-formed payload can be parsed successfully.
        const sanitised = decoded.replace(/"iat"\s*:\s*\\"[^"]*\\"/g, '"iat":null');
        try {
            return JSON.parse(sanitised) as GoogleWalletJWTPayload;
        } catch {
            return null;
        }
    } catch {
        return null;
    }
}

/**
 * Extract a human-readable organisation name from the JWT payload.
 *
 * Priority:
 *   1. Hostname of the first origin (e.g. "www.sncf-connect.com" → "sncf-connect.com")
 *   2. Service-account project name from the `iss` field
 *   3. Fallback: "Google Wallet"
 */
function extractOrganizationName(payload: GoogleWalletJWTPayload): string {
    // From origins array
    if (payload.origins && payload.origins.length > 0) {
        try {
            const origin = payload.origins[0];
            // Remove protocol
            let host = origin.replace(/^https?:\/\//, '');
            // Remove path
            host = host.split('/')[0];
            // Remove leading "www."
            if (host.startsWith('www.')) {
                host = host.slice(4);
            }
            if (host) {
                return host;
            }
        } catch {
            // fall through
        }
    }

    // From service account email (iss) – e.g. "client-google-wallet@my-project-id.iam.gserviceaccount.com"
    if (payload.iss) {
        try {
            const atIndex = payload.iss.indexOf('@');
            if (atIndex !== -1) {
                const domain = payload.iss.slice(atIndex + 1); // "my-project-id.iam.gserviceaccount.com"
                const parts = domain.split('.');
                // "my-project-id" is the first part
                if (parts.length > 0 && parts[0]) {
                    return parts[0];
                }
            }
        } catch {
            // fall through
        }
    }

    return 'Google Wallet';
}

/**
 * Determine the first Google Wallet pass kind present in the payload.
 */
function detectPassKind(payload: GoogleWalletJWTPayload): { kind: GoogleWalletPassKind; objects: any[] } | null {
    const walletPayload = payload.payload;
    if (!walletPayload) {
        return null;
    }

    const kinds: GoogleWalletPassKind[] = ['transitObjects', 'flightObjects', 'eventTicketObjects', 'loyaltyObjects', 'giftCardObjects', 'genericObjects'];
    for (const kind of kinds) {
        const objs = walletPayload[kind];
        if (Array.isArray(objs) && objs.length > 0) {
            return { kind, objects: objs };
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a Google Wallet URL and return structured data ready for import.
 *
 * @throws Error if the URL is not a valid Google Wallet URL or if the JWT
 *         cannot be decoded.
 */
export function parseGoogleWalletUrl(url: string): GoogleWalletParseResult {
    if (!isGoogleWalletUrl(url)) {
        throw new Error(`Not a Google Wallet URL: ${url}`);
    }

    const jwt = url.slice(GOOGLE_WALLET_URL_PREFIX.length);
    if (!jwt) {
        throw new Error('Google Wallet URL is missing the JWT token');
    }

    const payload = decodeJWTPayload(jwt);
    if (!payload) {
        throw new Error('Failed to decode the Google Wallet JWT token');
    }

    const kindResult = detectPassKind(payload);
    if (!kindResult) {
        // Tolerate empty / unknown payloads: create a single generic entry for the URL.
        // Use a simple hash of the JWT as the fallback id to avoid duplicates.
        let fallbackId = Date.now().toString(36);
        try {
            // djb2 hash — fast, no crypto dependency
            let h = 5381;
            for (let i = 0; i < jwt.length; i++) {
                h = ((h << 5) + h) ^ jwt.charCodeAt(i);
            }
            fallbackId = (h >>> 0).toString(16);
        } catch {
            // keep the timestamp-based fallback
        }
        return {
            jwtPayload: payload,
            originalUrl: url,
            passKind: 'genericObjects',
            objects: [{ id: fallbackId }],
            organizationName: extractOrganizationName(payload)
        };
    }

    return {
        jwtPayload: payload,
        originalUrl: url,
        passKind: kindResult.kind,
        objects: kindResult.objects,
        organizationName: extractOrganizationName(payload)
    };
}

// ---------------------------------------------------------------------------
// PKPass conversion
// ---------------------------------------------------------------------------

/** Map a Google Wallet pass kind to a PKPass style */
function kindToPassStyle(kind: GoogleWalletPassKind): PKPassStyle {
    switch (kind) {
        case 'transitObjects':
            return PKPassStyle.EventTicket;
        case 'flightObjects':
            return PKPassStyle.BoardingPass;
        case 'eventTicketObjects':
            return PKPassStyle.EventTicket;
        case 'loyaltyObjects':
            return PKPassStyle.StoreCard;
        case 'giftCardObjects':
            return PKPassStyle.StoreCard;
        case 'genericObjects':
        default:
            return PKPassStyle.Generic;
    }
}

/** Extract a field value from a Google Wallet localised string wrapper */
function gwLocalString(val: any): string | undefined {
    if (!val) return undefined;
    if (typeof val === 'string') return val;
    // Google Wallet uses { defaultValue: { language: 'en', value: '...' } }
    if (val.defaultValue?.value) return val.defaultValue.value;
    // Or { translatedValues: [...], defaultValue: ... }
    if (Array.isArray(val.translatedValues) && val.translatedValues.length > 0) {
        return val.translatedValues[0].value;
    }
    return undefined;
}

/** Extract a colour string from a Google Wallet color object or rgb(...) string */
function gwColor(val: any): string | undefined {
    if (!val) return undefined;
    if (typeof val === 'string') {
        // Already a colour string (e.g. "rgb(255,0,0)")
        return val;
    }
    // { red, green, blue } object
    if (typeof val.red === 'number' || typeof val.green === 'number' || typeof val.blue === 'number') {
        const r = Math.round(val.red ?? 0);
        const g = Math.round(val.green ?? 0);
        const b = Math.round(val.blue ?? 0);
        return `rgb(${r},${g},${b})`;
    }
    return undefined;
}

/**
 * Convert a single Google Wallet object (reference or embedded) to a PKPassData.
 *
 * When the object is just a reference (only classId + id), a minimal pass is
 * created whose barcode encodes the original Google Wallet URL so the user can
 * later open it in any wallet app.
 *
 * When the object is fully embedded (contains `cardTitle`, `header`, etc.)
 * the available fields are mapped to the corresponding PKPass sections.
 *
 * @param obj           The Google Wallet object (reference or full)
 * @param kind          The payload key that contained this object
 * @param originalUrl   The original Google Wallet URL (used as barcode fallback)
 * @param orgName       The human-readable organisation name
 * @param index         Index of this object within the batch (used for serial numbers)
 */
export function convertGoogleWalletObjectToPKPassData(obj: any, kind: GoogleWalletPassKind, originalUrl: string, orgName: string, index: number): PKPassData {
    const style = kindToPassStyle(kind);
    const isReference = !obj.cardTitle && !obj.header && !obj.linksModuleData && !obj.imageModulesData && !obj.textModulesData;

    // ----- Barcode --------------------------------------------------------
    // Use the barcode from the embedded object if available; otherwise the URL.
    let barcodeMessage = originalUrl;
    let barcodeFormat = PKBarcodeFormat.QR;
    const gwBarcode = obj.barcode || obj.barcodeDetails;
    if (gwBarcode?.value) {
        barcodeMessage = gwBarcode.value;
        switch ((gwBarcode.type || gwBarcode.alternateText || '').toUpperCase()) {
            case 'PDF_417':
            case 'PDF417':
                barcodeFormat = PKBarcodeFormat.PDF417;
                break;
            case 'AZTEC':
                barcodeFormat = PKBarcodeFormat.Aztec;
                break;
            case 'CODE_128':
            case 'CODE128':
                barcodeFormat = PKBarcodeFormat.Code128;
                break;
            default:
                barcodeFormat = PKBarcodeFormat.QR;
        }
    }

    // ----- Colors ---------------------------------------------------------
    const backgroundColor = gwColor(obj.hexBackgroundColor || obj.backgroundColor);
    const foregroundColor = gwColor(obj.foregroundColor);
    const labelColor = gwColor(obj.labelColor);

    // ----- Description / organisation -------------------------------------
    const cardTitleStr = gwLocalString(obj.cardTitle);
    const headerStr = gwLocalString(obj.header);
    const description = cardTitleStr || headerStr || orgName;
    const logoText = cardTitleStr || orgName;
    const organizationName = orgName;

    // ----- Expiration / validity ------------------------------------------
    let expirationDate: string | undefined;
    if (obj.validTimeInterval?.end?.date) {
        expirationDate = obj.validTimeInterval.end.date;
    } else if (obj.expirationDate) {
        expirationDate = obj.expirationDate;
    }

    // ----- Fields ---------------------------------------------------------
    // For reference-only objects we create one field showing the object id.
    // For embedded objects we map textModulesData / linksModuleData to back fields.
    type FieldObj = { key: string; label?: string; value: string };
    const primaryFields: FieldObj[] = [];
    const secondaryFields: FieldObj[] = [];
    const auxiliaryFields: FieldObj[] = [];
    const backFields: FieldObj[] = [];

    if (isReference) {
        // Reference-only: show the object id as primary field
        const displayId = obj.id || obj.classId || '';
        if (displayId) {
            primaryFields.push({ key: 'id', label: 'ID', value: displayId });
        }
    } else {
        // Embedded: map text modules to back fields
        if (Array.isArray(obj.textModulesData)) {
            obj.textModulesData.forEach((m: any, i: number) => {
                const label = gwLocalString(m.header) || '';
                const value = gwLocalString(m.body) || '';
                if (value) {
                    backFields.push({ key: `text_${i}`, label, value });
                }
            });
        }
        // Header / body as primary / secondary
        if (headerStr) {
            primaryFields.push({ key: 'header', label: undefined, value: headerStr });
        }
        if (obj.id) {
            auxiliaryFields.push({ key: 'pass_id', label: 'ID', value: obj.id });
        }
    }

    // Transit type for boarding passes
    let transitType: PKPassTransitType | undefined;
    if (kind === 'flightObjects') {
        transitType = PKPassTransitType.Air;
    } else if (kind === 'transitObjects') {
        // Google Wallet doesn't always specify the vehicle type; default to generic
        transitType = PKPassTransitType.Generic;
    }

    // ----- Assemble PKPassData --------------------------------------------
    const passTypeIdentifier = obj.classId || `googlewallet.${kind}`;
    const serialNumber = obj.id || `googlewallet_${index}_${Date.now()}`;

    const structure: any = {
        primaryFields: primaryFields.length ? primaryFields : undefined,
        secondaryFields: secondaryFields.length ? secondaryFields : undefined,
        auxiliaryFields: auxiliaryFields.length ? auxiliaryFields : undefined,
        backFields: backFields.length ? backFields : undefined,
        ...(transitType ? { transitType } : {})
    };

    const passData: PKPassData = {
        formatVersion: 1,
        passTypeIdentifier,
        serialNumber,
        teamIdentifier: 'google',
        organizationName,
        description,
        logoText,
        backgroundColor,
        foregroundColor,
        labelColor,
        expirationDate,
        barcodes: [
            {
                format: barcodeFormat,
                message: barcodeMessage,
                messageEncoding: 'iso-8859-1',
                altText: isReference ? 'Google Wallet' : undefined
            }
        ]
    };

    // Attach structure under the matching key
    switch (style) {
        case PKPassStyle.BoardingPass:
            passData.boardingPass = structure;
            break;
        case PKPassStyle.Coupon:
            passData.coupon = structure;
            break;
        case PKPassStyle.EventTicket:
            passData.eventTicket = structure;
            break;
        case PKPassStyle.StoreCard:
            passData.storeCard = structure;
            break;
        default:
            passData.generic = structure;
    }

    return passData;
}
