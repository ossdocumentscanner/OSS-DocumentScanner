<script context="module" lang="ts">
    import { Canvas, CanvasView } from '@nativescript-community/ui-canvas';
    import { conditionalEvent } from '@shared/utils/svelte/ui';
    import { colors, fontScale, fonts } from '~/variables';
    import { IListItem } from './OptionSelect.svelte';
</script>

<script lang="ts">
    $: ({ colorOnSurface, colorOnSurfaceVariant, colorOutlineVariant, colorPrimary } = $colors);
    // technique for only specific properties to get updated on store change
    export let showBottomLine: boolean = false;
    export let extraPaddingLeft: number = 0;
    export let iconFontSize: number = 24;
    export let fontSize: number = 17;
    export let fontWeight: string | number = 500;
    export let subtitleFontSize: number = 14;
    export let columns: string = '*';
    export let mainCol = 0;
    export let onLongPress: (item, e) => void = null;
    export let leftIconFonFamily: string = $fonts.mdi;
    export let color: string | Color = colorOnSurface;
    export let subtitleColor: string | Color = null;
    export let item: IListItem;
    export let onDraw: (event: { canvas: Canvas; object: CanvasView }) => void = null;
</script>

<canvasview
    {columns}
    padding="0 16 0 16"
    rippleColor={colorPrimary}
    on:tap
    use:conditionalEvent={{ condition: !!(item.onLongPress || onLongPress), event: 'longPress', callback: item.onLongPress || onLongPress }}
    {...$$restProps}>
    <canvaslabel col={mainCol} color={item.color || color || colorOnSurface} on:draw={onDraw}>
        <cgroup paddingBottom={item.subtitle ? 10 : 0} verticalAlignment="middle">
            <cspan fontFamily={leftIconFonFamily} fontSize={iconFontSize * $fontScale} paddingLeft="8" text={item.icon} visibility={item.icon ? 'visible' : 'hidden'} width={iconFontSize * 2} />
        </cgroup>
        <cgroup paddingLeft={(item.icon ? 38 * $fontScale : 0) + extraPaddingLeft} textAlignment="left" verticalAlignment="middle">
            <cspan fontSize={(item.fontSize || fontSize) * $fontScale} {fontWeight} text={item.title || item.name} />
            <cspan
                color={item.subtitleColor || subtitleColor || colorOnSurfaceVariant}
                fontSize={(item.subtitleFontSize || subtitleFontSize) * $fontScale}
                text={item.subtitle ? '\n' + item.subtitle : ''}
                visibility={item.subtitle ? 'visible' : 'hidden'} />
        </cgroup>
    </canvaslabel>
    <slot />
    {#if showBottomLine}
        <line color={colorOutlineVariant} height="1" startX="20" startY="0" stopX="100%" stopY="0" strokeWidth="1" verticalAlignment="bottom" />
    {/if}
</canvasview>
