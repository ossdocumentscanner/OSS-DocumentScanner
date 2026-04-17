<script context="module" lang="ts">
    import { Canvas, CanvasView, Paint } from '@nativescript-community/ui-canvas';
    import { conditionalEvent, createEventDispatcher } from '@shared/utils/svelte/ui';
    import { colors, fontScale } from '~/variables';
    import type { IListItem } from './OptionSelect.svelte';
    const linePaint = new Paint();
    linePaint.strokeWidth = 1;
</script>

<script lang="ts">
    const dispatch = createEventDispatcher();
    // technique for only specific properties to get updated on store change
    let { colorOnSurface, colorOnSurfaceVariant, colorOutlineVariant, colorPrimary } = $colors;
    $: ({ colorOnSurface, colorOnSurfaceVariant, colorOutlineVariant, colorPrimary } = $colors);

    $: linePaint.color = colorOutlineVariant;

    $: color = typeof item.color === 'function' ? item['color'](item) : item.color;
    export let showBottomLine: boolean = false;
    // export let iconFontSize: number = 24;
    export let item: IListItem;
    export let fontSize: number = 21;
    export let fontWeight: any = 'normal';
    export let subtitleFontSize: number = 15;
    export let columns: string = '*,auto';
    export let mainCol = 0;
    export let onLinkTap: (event) => void = null;
    export let onLongPress: (event) => void = null;
    export let onDraw: (item: IListItem, event: { canvas: Canvas; object: CanvasView }) => void = null;

    function draw(event: { canvas: Canvas; object: CanvasView }) {
        const canvas = event.canvas;
        const h = canvas.getHeight();
        const w = canvas.getWidth();

        if (item.showBottomLine || showBottomLine) {
            event.canvas.drawLine(20, h - 1, w, h - 1, linePaint);
        }
        // if (leftIcon) {
        //     const fontSize = iconFontSize * $fontScale;
        //     iconPaint.textSize = fontSize;
        //     iconPaint.color = titleColor || color || colorOnSurface;
        //     iconPaint.fontFamily = leftIconFonFamily;
        //     const staticLayout = new StaticLayout(leftIcon, iconPaint, leftColumn, LayoutAlignment.ALIGN_CENTER, 1, 0, true);
        //     canvas.translate(6, h / 2 - staticLayout.getHeight() / 2);
        //     // canvas.drawRect(0,0,leftColumn,  staticLayout.getHeight(), iconPaint);
        //     staticLayout.draw(canvas);
        // }
        (item.onDraw || onDraw)?.(item, event);
    }

    $: addedPadding = (item.subtitle?.length > 0 ? 6 : 10) + (__ANDROID__ ? 8 : 12);
</script>

<!-- <gridlayout>
    <gridlayout {columns} rippleColor={colorOnSurface} on:tap={(event) => dispatch('tap', event)} {...$$restProps} padding="10 16 10 16">
        <canvaslabel col={mainCol} color={titleColor} on:draw={onDraw}>
            <cgroup paddingBottom={subtitle ? 10 : 0} verticalAlignment="middle">
                <cspan
                    fontFamily={leftIconFonFamily}
                    fontSize={iconFontSize * $fontScale}
                    paddingLeft="10"
                    text={leftIcon}
                    visibility={leftIcon ? 'visible' : 'hidden'}
                    width={iconFontSize * 2} />
            </cgroup>
            <cgroup paddingLeft={(leftIcon ? iconFontSize * 2 : 0) + extraPaddingLeft} textAlignment="left" verticalAlignment="middle">
                <cspan fontSize={fontSize * $fontScale} {fontWeight} text={title} />
                <cspan color={subtitleColor} fontSize={subtitleFontSize * $fontScale} text={subtitle ? '\n' + subtitle : ''} visibility={subtitle ? 'visible' : 'hidden'} />
            </cgroup>
        </canvaslabel>
        <slot />
    </gridlayout>
</gridlayout> -->

<canvasview
    {columns}
    padding="0 16 0 16"
    rippleColor={color || colorPrimary}
    on:tap={(event) => dispatch('tap', event)}
    on:draw={draw}
    use:conditionalEvent={{ condition: !!(item.onLongPress || onLongPress), event: 'longPress', callback: item.onLongPress || onLongPress }}
    {...$$restProps}>
    <!-- <label
        fontFamily={leftIconFonFamily}
        fontSize={iconFontSize}
        marginLeft="-10"
        text={leftIcon}
        verticalAlignment="middle"
        visibility={!!leftIcon ? 'visible' : 'collapse'}
        width={iconFontSize * 2} /> -->
    <label
        col={mainCol}
        color={item.titleColor || color || colorOnSurface}
        disableCss={true}
        {fontWeight}
        html={item.html}
        paddingBottom={addedPadding}
        paddingTop={addedPadding}
        text={item.text}
        textWrap={true}
        verticalTextAlignment="center"
        {...item.titleProps || $$restProps?.titleProps}
        use:conditionalEvent={{ condition: !!(item.onLinkTap || onLinkTap), event: 'linkTap', callback: item.onLinkTap || onLinkTap }}>
        <cspan fontSize={fontSize * $fontScale} lineHeight={fontSize * $fontScale * 1.3} text={item.title || item.name} />
        <cspan color={item.subtitleColor || colorOnSurfaceVariant} fontSize={(item.subtitleFontSize || subtitleFontSize) * $fontScale} text={item.subtitle ? '\n' + item.subtitle : null} />
    </label>

    <label
        col={1}
        color={item.subtitleColor}
        disableCss={true}
        fontSize={(item.rightValueFontSize || subtitleFontSize) * $fontScale}
        marginLeft={16}
        text={typeof item.rightValue === 'function' ? item.rightValue() : item.rightValue}
        textAlignment="right"
        verticalAlignment="middle"
        visibility={!!item.rightValue ? 'visible' : 'collapse'}
        on:tap={(event) => dispatch('rightIconTap', event)} />
    <slot />
</canvasview>
