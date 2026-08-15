/**
 * Original (pre-crop) image availability.
 *
 * A page keeps a copy of the image it was created from (`sourceImagePath`) so
 * that the crop and the transforms can be recomputed later. That copy can be
 * missing: either it was never kept (`SETTINGS_KEEP_ORIGINAL_IMAGES` off) or the
 * user deleted it to free storage.
 *
 * These helpers stay free of any NativeScript dependency so they can be unit-tested.
 */

/** Minimal shape needed to know whether a page can still be re-cropped/transformed. */
export interface PageWithOriginal {
    sourceImagePath?: string;
}

/** Minimal shape needed to compute what a page uses on disk. */
export interface PageWithSizes {
    /** size of the processed image */
    size?: number;
    /** size of the original image, 0 when it is not kept */
    sourceSize?: number;
}

export interface StorageSizes {
    /** size of the processed images */
    size: number;
    /** size of the original images */
    sourceSize: number;
    /** what the pages actually use on disk */
    total: number;
}

/** What a set of pages uses on disk, split between processed and original images. */
export function computeStorageSizes(pages?: PageWithSizes[]): StorageSizes {
    let size = 0;
    let sourceSize = 0;
    (pages ?? []).forEach((page) => {
        size += page.size || 0;
        sourceSize += page.sourceSize || 0;
    });
    return { size, sourceSize, total: size + sourceSize };
}

/** True when the page still references an original image. */
export function hasOriginalImage(page?: PageWithOriginal): boolean {
    return !!page?.sourceImagePath?.length;
}

/** Keeps only the entries whose page can still be re-cropped/transformed. */
export function filterPagesWithOriginal<T extends { page: PageWithOriginal }>(items: T[]): T[] {
    return items.filter((item) => hasOriginalImage(item.page));
}
