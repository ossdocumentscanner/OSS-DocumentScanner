<script context="module" lang="ts">
    import { Align, Canvas, CanvasView, LayoutAlignment, Paint, StaticLayout } from '@nativescript-community/ui-canvas';
    import { NativeViewElementNode } from '@nativescript-community/svelte-native/dom';
    import { conditionalEvent } from '@shared/utils/svelte/ui';
    import { showToolTip } from '~/utils/ui';
    import { actionBarButtonHeight, colors, fonts } from '~/variables';
    const iconPaint = new Paint();
    const subtitlePaint = new Paint();
    // subtitlePaint.setTextAlign(Align.CENTER);
</script>

<script lang="ts">
    // technique for only specific properties to get updated on store change
    $: ({ colorOnSurface, colorOnSurfaceVariant, colorPrimary } = $colors);

    export let isVisible = true;
    export let isHidden = false;
    export let white = false;
    export let isEnabled = true;
    export let small = false;
    export let gray = false;
    export let isSelected = false;
    export let text = null;
    export let subtitle = null;
    export let fontFamily = $fonts.mdi;
    export let selectedColor = white ? 'white' : colorPrimary;
    export let color = null;
    export let onLongPress: Function = null;
    export let fontSize = null;
    export let subtitleFontSize = null;
    export let width: any = subtitle ? (small ? 60 : 90) : small ? 30 : $actionBarButtonHeight;
    export let height: any = subtitle ? (small ? 40 : $actionBarButtonHeight + 20) : small ? 30 : $actionBarButtonHeight;
    export let tooltip = null;
    export let rounded = true;
    export let shape = null;
    iconPaint.fontFamily = $fonts.mdi;

    let canvas: NativeViewElementNode<CanvasView>;

    // let actualColor = null;
    // $: actualColor = white ? 'white' : !isEnabled || gray ? $subtitleColor : color;
    $: actualColor = color || (!isEnabled || gray ? colorOnSurfaceVariant : colorOnSurface);
    $: actualLongPress =
        onLongPress || tooltip
            ? (event) => {
                  if (onLongPress) {
                      onLongPress(event);
                  } else {
                      showToolTip(tooltip);
                  }
              }
            : null;
    $: refresh(text);

    function refresh(...args) {
        canvas?.nativeView?.redraw();
    }
    function onCanvasDraw({ canvas, object }: { canvas: Canvas; object: CanvasView }) {
        if (!text) {
            return;
        }
        iconPaint.fontFamily = fontFamily;
        iconPaint.textSize = fontSize || (small ? 16 : 24);
        iconPaint.color = isEnabled ? (isSelected ? selectedColor : actualColor) : 'lightgray';
        const w = canvas.getWidth();
        const w2 = w / 2;
        const h2 = canvas.getHeight() / 2;
        let staticLayout = new StaticLayout(text, iconPaint, w, LayoutAlignment.ALIGN_CENTER, 1, 0, true);
        if (subtitle) {
            const iconHeight = staticLayout.getHeight();
            canvas.translate(0, h2 - iconHeight);
            staticLayout.draw(canvas);
            subtitlePaint.color = isEnabled ? actualColor : 'lightgray';
            subtitlePaint.textSize = subtitleFontSize || (small ? 10 : 12);
            staticLayout = new StaticLayout(subtitle, subtitlePaint, w, LayoutAlignment.ALIGN_CENTER, 1, 0, true);
            canvas.translate(0, iconHeight);
            // canvas.drawText(subtitle, w2, h2, subtitlePaint);
            staticLayout.draw(canvas);
        } else {
            canvas.translate(0, h2 - staticLayout.getHeight() / 2);
            staticLayout.draw(canvas);
        }
        // canvas.drawText(text, w2, w2+ textSize/3, iconPaint);
    }
</script>

<canvasview
    bind:this={canvas}
    borderRadius={shape === 'round' || (rounded && !shape) ? '50%' : null}
        isUserInteractionEnabled={isEnabled}
    disableCss={true}
    {height}
    rippleColor={actualColor}
    visibility={isVisible ? 'visible' : isHidden ? 'hidden' : 'collapse'}
    {width}
    on:draw={onCanvasDraw}
    {...$$restProps}
    on:tap
    use:conditionalEvent={{ condition: !!actualLongPress, event: 'longPress', callback: actualLongPress }} />
<!-- <mdbutton
    color={isSelected ? selectedColor : actualColor}
    disableCss={true}
    {fontFamily}
    {height}
    {isEnabled}
    rippleColor={actualColor}
    shape={shape || (rounded ? 'round' : null)}
    {text}
    variant="text"
    visibility={isVisible ? 'visible' : isHidden ? 'hidden' : 'collapse'}
    {...$$restProps}
    fontSize={fontSize ? fontSize : small ? 16 : 24}
    {width}
    on:tap
    use:conditionalEvent={{ condition: !!actualLongPress, event: 'longPress', callback: actualLongPress }} /> -->
