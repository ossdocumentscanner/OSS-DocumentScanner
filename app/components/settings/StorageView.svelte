<script context="module" lang="ts">
    import { Template } from '@nativescript-community/svelte-native/components';
    import { NativeViewElementNode } from '@nativescript-community/svelte-native/dom';
    import { Canvas, CanvasView, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { createNativeAttributedString } from '@nativescript-community/ui-label';
    import { VerticalPosition } from '@nativescript-community/ui-popover';
    import { ObservableArray, Utils } from '@nativescript/core';
    import { OptionType } from '@shared/components/OptionSelect.svelte';
    import { showError } from '@shared/utils/showError';
    import dayjs from 'dayjs';
    import { filesize } from 'filesize';
    import CActionBar from '~/components/common/CActionBar.svelte';
    import PageIndicator from '~/components/common/PageIndicator.svelte';
    import RotableImageView from '~/components/common/RotableImageView.svelte';
    import SelectedIndicator from '~/components/common/SelectedIndicator.svelte';
    import SelectionToolbar from '~/components/common/SelectionToolbar.svelte';
    import { lc, lcp } from '~/helpers/locale';
    import { isEInk, onThemeChanged } from '~/helpers/theme';
    import { OCRDocument } from '~/models/OCRDocument';
    import { documentsService } from '~/services/documents';
    import { StorageSizes, computeStorageSizes } from '~/utils/originals';
    import { deleteDocumentsWithConfirm, deleteOriginalImages, formatStorageSizes, goToDocumentView, showPopoverMenu } from '~/utils/ui';
    import { ellipsize } from '~/utils/utils.common';
    import { colors, fontScale, windowInset } from '~/variables';

    interface Item {
        doc: OCRDocument;
        selected: boolean;
        sizes: StorageSizes;
    }

    const textPaint = new Paint();
    const IMAGE_DECODE_WIDTH = Utils.layout.toDevicePixels(200);
    // same as the main list "condensed" view style
    const ITEM_IMAGE_HEIGHT = 44;
    const ITEM_ROW_HEIGHT = 80;
</script>

<script lang="ts">
    let { colorError, colorOnBackground, colorOnSurfaceVariant } = $colors;
    $: ({ colorError, colorOnBackground, colorOnSurfaceVariant } = $colors);

    let collectionView: NativeViewElementNode<CollectionView>;
    let items: ObservableArray<Item> = new ObservableArray([]);
    let totals: StorageSizes = { size: 0, sourceSize: 0, total: 0 };
    let nbSelected: number = 0;

    $: textPaint.color = colorOnBackground || 'black';

    async function refresh() {
        try {
            const documents = await documentsService.documentRepository.findDocuments();
            const newItems = documents.map((doc) => ({ doc, selected: false, sizes: computeStorageSizes(doc.pages) })).sort((firstItem, secondItem) => secondItem.sizes.total - firstItem.sizes.total);
            totals = computeStorageSizes(documents.reduce((acc, doc) => acc.concat(doc.pages), []));
            nbSelected = 0;
            items = new ObservableArray(newItems);
        } catch (error) {
            showError(error);
        }
    }

    function getSelectedDocuments() {
        const selected: OCRDocument[] = [];
        items.forEach((item) => {
            if (item.selected) {
                selected.push(item.doc);
            }
        });
        return selected;
    }
    function setSelected(item: Item, selected: boolean) {
        if (item.selected === selected) {
            return;
        }
        item.selected = selected;
        nbSelected += selected ? 1 : -1;
        items.setItem(items.indexOf(item), item);
    }
    function unselectAll() {
        items.forEach((item) => setSelected(item, false));
    }
    function selectAll() {
        items.forEach((item) => setSelected(item, true));
    }

    async function onItemTap(item: Item) {
        try {
            if (nbSelected > 0) {
                setSelected(item, !item.selected);
            } else {
                await goToDocumentView(item.doc);
            }
        } catch (error) {
            showError(error);
        }
    }
    function onItemLongPress(item: Item) {
        setSelected(item, !item.selected);
    }

    function getSelectionToolbarOptions(): OptionType[] {
        return [
            { id: 'select_all', name: lc('select_all'), icon: 'mdi-select-all' },
            { id: 'delete_originals', name: lc('delete_original_images'), icon: 'mdi-image-remove' },
            { id: 'delete', name: lc('delete'), icon: 'mdi-delete', color: colorError }
        ];
    }
    async function handleSelectionAction(event, option: OptionType) {
        try {
            switch (option.id) {
                case 'select_all':
                    if (nbSelected === items.length) {
                        unselectAll();
                    } else {
                        selectAll();
                    }
                    break;
                case 'delete_originals':
                    if (await deleteOriginalImages({ documents: getSelectedDocuments() })) {
                        await refresh();
                    }
                    break;
                case 'delete':
                    if (await deleteDocumentsWithConfirm(getSelectedDocuments())) {
                        await refresh();
                    }
                    break;
            }
        } catch (error) {
            showError(error);
        }
    }

    async function showOptions(event) {
        try {
            const options = new ObservableArray([{ id: 'delete_all_originals', name: lc('delete_all_original_images'), icon: 'mdi-image-remove' }] as any);
            await showPopoverMenu({
                options,
                anchor: event.object,
                vertPos: VerticalPosition.BELOW,
                onClose: async (option) => {
                    try {
                        if (option.id === 'delete_all_originals') {
                            const documents: OCRDocument[] = [];
                            items.forEach((item) => documents.push(item.doc));
                            if (await deleteOriginalImages({ documents })) {
                                await refresh();
                            }
                        }
                    } catch (error) {
                        showError(error);
                    }
                }
            });
        } catch (error) {
            showError(error);
        }
    }

    function onCanvasDraw(item: Item, { canvas }: { canvas: Canvas; object: CanvasView }) {
        const width = canvas.getWidth();
        const height = canvas.getHeight();
        const dx = 10 + ITEM_IMAGE_HEIGHT * $fontScale + 16;
        const { doc, sizes } = item;
        textPaint.color = colorOnSurfaceVariant;
        textPaint.textSize = 11;
        canvas.drawText(formatStorageSizes(sizes), dx, height - 10, textPaint);
        textPaint.color = colorOnBackground;
        const topText = createNativeAttributedString({
            spans: [
                {
                    fontSize: 16 * $fontScale,
                    fontWeight: 'bold',
                    lineBreak: 'end',
                    lineHeight: 18 * $fontScale,
                    text: ellipsize(doc.name, 50)
                },
                {
                    color: colorOnSurfaceVariant,
                    fontSize: 14 * $fontScale,
                    lineHeight: 14,
                    text: '\n' + dayjs(doc.createdDate).format('L LT')
                }
            ]
        });
        const staticLayout = new StaticLayout(topText, textPaint, Math.max(0, width - dx), LayoutAlignment.ALIGN_NORMAL, 1, 0, true);
        canvas.translate(dx, 10);
        staticLayout.draw(canvas);
    }

    function refreshCollectionView() {
        collectionView?.nativeView?.refresh();
    }
    onThemeChanged(refreshCollectionView);

    refresh();
</script>

<page id="storageView" actionBarHidden={true}>
    <gridlayout class="pageContent" rows="auto,auto,*">
        <gridlayout columns="*,auto" padding="16 16 8 16" row={1} rows="auto,auto">
            <label color={colorOnBackground} fontSize={20 * $fontScale} fontWeight="bold" text={filesize(totals.total, { output: 'string' })} />
            <label col={0} color={colorOnSurfaceVariant} fontSize={14 * $fontScale} row={1} text={lc('originals_size', filesize(totals.sourceSize, { output: 'string' }))} />
            <label col={1} color={colorOnSurfaceVariant} fontSize={14 * $fontScale} rowSpan={2} text={lcp('documents_count', items.length)} verticalAlignment="center" />
        </gridlayout>
        <collectionview bind:this={collectionView} {items} row={2} android:paddingBottom={$windowInset.bottom}>
            <Template let:item>
                <canvasview
                    class="card"
                    borderWidth={isEInk ? 1 : 0}
                    height={ITEM_ROW_HEIGHT * $fontScale}
                    on:tap={() => onItemTap(item)}
                    on:longPress={() => onItemLongPress(item)}
                    on:draw={(e) => onCanvasDraw(item, e)}
                >
                    <RotableImageView
                        id="imageView"
                        borderRadius={12}
                        decodeWidth={IMAGE_DECODE_WIDTH}
                        horizontalAlignment="left"
                        item={item.doc.pages[0]}
                        marginBottom={10}
                        marginLeft={10}
                        marginTop={10}
                        stretch="aspectFill"
                        width={ITEM_IMAGE_HEIGHT * $fontScale}
                    />
                    <SelectedIndicator horizontalAlignment="left" margin={10} selected={item.selected} />
                    <PageIndicator horizontalAlignment="right" margin={10} scale={$fontScale} text={item.doc.pages.length} />
                </canvasview>
            </Template>
        </collectionview>
        {#if nbSelected > 0}
            <SelectionToolbar onAction={handleSelectionAction} options={getSelectionToolbarOptions()} row={2} />
        {/if}
        <CActionBar canGoBack onGoBack={nbSelected ? unselectAll : null} title={nbSelected ? lcp('selected', nbSelected) : lc('documents_storage')}>
            <mdbutton class="actionBarButton" text="mdi-dots-vertical" variant="text" on:tap={showOptions} />
        </CActionBar>
    </gridlayout>
</page>
