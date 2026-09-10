<script context="module" lang="ts">
    import { lc } from '@nativescript-community/l';
    import { createNativeAttributedString } from '@nativescript-community/text';
    import { LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { CollectionView } from '@nativescript-community/ui-collectionview';
    import { ObservableArray, Utils } from '@nativescript/core';
    import { Template } from '@nativescript-community/svelte-native/components';
    import { NativeViewElementNode } from '@nativescript-community/svelte-native/dom';
    import { isEInk } from '~/helpers/theme';
    import { ellipsize } from '~/utils/utils.common';
    import { colors, fontScale } from '~/variables';
    import dayjs from 'dayjs';
    import { computeStorageSizes } from '~/utils/originals';
    import { formatStorageSizes } from '~/utils/ui';
    import PageIndicator from '../common/PageIndicator.svelte';
    import RotableImageView from '../common/RotableImageView.svelte';
    import SelectedIndicator from '../common/SelectedIndicator.svelte';
    import MainList, { Item } from './MainList.svelte';

    const textPaint = new Paint();
    const IMAGE_DECODE_WIDTH = Utils.layout.toDevicePixels(200);
</script>

<script lang="ts">
    let { colorOnBackground, colorOnSurfaceVariant } = $colors;
    $: ({ colorOnBackground, colorOnSurfaceVariant } = $colors);

    let collectionView: NativeViewElementNode<CollectionView>;
    let viewStyle: string;
    let nbSelected: number = 0;
    let documents: ObservableArray<Item>;
    let getSyncColors: (item: Item) => string[];
    let onItemLongPress: (item: Item, event?) => Promise<void>;
    let onItemTap: (item: Item) => Promise<void>;
    let refreshCollectionView: () => void;

    $: condensed = viewStyle === 'condensed';
    function getItemRowHeight(viewStyle) {
        return condensed ? 80 : 150;
    }
    function getImageMargin(viewStyle) {
        return 10;
    }
    function getItemImageHeight(viewStyle) {
        return condensed ? 44 : 94;
    }

    $: textPaint.color = colorOnBackground || 'black';

    function onCanvasDraw(item: Item, { canvas, object }: { canvas: Canvas; object: CanvasView }) {
        const w = canvas.getWidth();
        const h = canvas.getHeight();
        const dx = 10 + getItemImageHeight(viewStyle) * $fontScale + 16;
        textPaint.color = colorOnSurfaceVariant;
        const { doc } = item;
        textPaint.textSize = condensed ? 11 : 14 * $fontScale;
        canvas.drawText(formatStorageSizes(computeStorageSizes(doc.pages)), dx, h - (condensed ? 0 : 16) - 10, textPaint);
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
                    lineHeight: condensed ? 14 : 20 * $fontScale,
                    text: '\n' + dayjs(doc.trashedDate).format('L LT')
                }
            ]
        });
        const staticLayout = new StaticLayout(topText, textPaint, Math.max(0, w - dx), LayoutAlignment.ALIGN_NORMAL, 1, 0, true);
        canvas.translate(dx, (condensed ? 0 : 10) + 10);
        staticLayout.draw(canvas);
    }
</script>

<MainList
    isTrash={true}
    title={lc('trash')}
    viewStyles={{
        default: { name: lc('expanded') },
        condensed: { name: lc('condensed') }
    }}
    bind:viewStyle
    bind:onItemTap
    bind:onItemLongPress
    bind:nbSelected
    bind:refreshCollectionView
    bind:getSyncColors
    bind:documents
    bind:collectionView
>
    <Template let:item>
        <canvasview
            class="card"
            borderWidth={isEInk ? 1 : 0}
            height={getItemRowHeight(viewStyle) * $fontScale}
            on:tap={() => onItemTap(item)}
            on:longPress={(e) => onItemLongPress(item, e)}
            on:draw={(e) => onCanvasDraw(item, e)}
        >
            <RotableImageView
                id="imageView"
                borderRadius={12}
                decodeWidth={IMAGE_DECODE_WIDTH}
                horizontalAlignment="left"
                item={item.doc.pages[0]}
                marginBottom={getImageMargin(viewStyle)}
                marginLeft={10}
                marginTop={getImageMargin(viewStyle)}
                sharedTransitionTag={`document_${item.doc.id}_${item.doc.pages[0]?.id}`}
                stretch="aspectFill"
                width={getItemImageHeight(viewStyle) * $fontScale}
            />
            <SelectedIndicator horizontalAlignment="left" margin={10} selected={item.selected} />
            <PageIndicator horizontalAlignment="right" margin={10} scale={$fontScale} text={item.doc.pages.length} />
        </canvasview>
    </Template>
</MainList>
