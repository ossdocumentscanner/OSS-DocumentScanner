import { expect, test } from 'vitest';
import { computeStorageSizes, filterPagesWithOriginal, hasOriginalImage } from './originals';

// hasOriginalImage

test('hasOriginalImage returns false for a page without sourceImagePath', () => {
    expect(hasOriginalImage({})).toBe(false);
});

test('hasOriginalImage returns false when sourceImagePath is null', () => {
    expect(hasOriginalImage({ sourceImagePath: null })).toBe(false);
});

test('hasOriginalImage returns false when sourceImagePath is an empty string', () => {
    expect(hasOriginalImage({ sourceImagePath: '' })).toBe(false);
});

test('hasOriginalImage returns false for a missing page', () => {
    expect(hasOriginalImage(undefined)).toBe(false);
});

test('hasOriginalImage returns true when sourceImagePath is set', () => {
    expect(hasOriginalImage({ sourceImagePath: '/data/doc/page/20260811.jpg' })).toBe(true);
});

// filterPagesWithOriginal

test('filterPagesWithOriginal keeps only entries whose page has an original', () => {
    const items = [{ page: { sourceImagePath: '/data/a.jpg' } }, { page: {} }, { page: { sourceImagePath: null } }, { page: { sourceImagePath: '/data/b.jpg' } }];
    expect(filterPagesWithOriginal(items)).toEqual([{ page: { sourceImagePath: '/data/a.jpg' } }, { page: { sourceImagePath: '/data/b.jpg' } }]);
});

test('filterPagesWithOriginal returns an empty array when no page has an original', () => {
    expect(filterPagesWithOriginal([{ page: {} }, { page: { sourceImagePath: '' } }])).toEqual([]);
});

test('filterPagesWithOriginal keeps the other entry properties untouched', () => {
    const items = [{ page: { sourceImagePath: '/data/a.jpg' }, pageIndex: 3, document: { id: 'doc' } }];
    expect(filterPagesWithOriginal(items)).toEqual(items);
});

// computeStorageSizes

test('computeStorageSizes sums processed and original sizes', () => {
    const pages = [
        { size: 100, sourceSize: 400 },
        { size: 50, sourceSize: 250 }
    ];
    expect(computeStorageSizes(pages)).toEqual({ size: 150, sourceSize: 650, total: 800 });
});

test('computeStorageSizes counts pages without an original', () => {
    const pages = [{ size: 100, sourceSize: 0 }, { size: 50 }];
    expect(computeStorageSizes(pages)).toEqual({ size: 150, sourceSize: 0, total: 150 });
});

test('computeStorageSizes ignores undefined sizes', () => {
    expect(computeStorageSizes([{}, { sourceSize: 10 }])).toEqual({ size: 0, sourceSize: 10, total: 10 });
});

test('computeStorageSizes returns zeros for no page', () => {
    expect(computeStorageSizes([])).toEqual({ size: 0, sourceSize: 0, total: 0 });
    expect(computeStorageSizes(undefined)).toEqual({ size: 0, sourceSize: 0, total: 0 });
});
