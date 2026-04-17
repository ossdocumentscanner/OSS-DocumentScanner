<svelte:options accessors />

<script context="module" lang="ts">
    import { CheckBox } from '@nativescript-community/ui-checkbox';
    import { openFilePicker } from '@nativescript-community/ui-document-picker';
    import { closeBottomSheet } from '@nativescript-community/ui-material-bottomsheet/svelte';
    import { TextField } from '@nativescript-community/ui-material-textfield';
    import { EventData, File, ObservableArray, Utils, View } from '@nativescript/core';
    import { debounce } from '@nativescript/core/utils';
    import { onDestroy } from 'svelte';
    import { Template } from '@nativescript-community/svelte-native/components';
    import IconButton from '@shared/components/IconButton.svelte';
    import ListItem from '@shared/components/ListItem.svelte';
    import ListItemAutoSize from '@shared/components/ListItemAutoSize.svelte';
    import { lc } from '~/helpers/locale';
    import { colors, fontScale, fonts } from '~/variables';
    import { Canvas, CanvasView } from '@nativescript-community/ui-canvas';

    export interface IListItem {
        showBottomLine?: boolean;
        iconFontSize?: number;
        subtitleFontSize?: number;
        rightValue?: string | (() => string);
        rightValueFontSize?: number;
        fontSize?: number;
        html?: any;
        name?: string;
        icon?: string;
        color?: string | Color | ((item: IListItem) => string | Color);
        rippleColor?: string | Color;
        title?: string;
        subtitle?: string;
        type?: string;
        onLinkTap?: (event) => void;
        onLongPress?: (event) => void;
        onDraw?: (item: IListItem, event: { canvas: Canvas; object: CanvasView }) => void;
        [k: string]: any;
    }
    export interface OptionType extends IListItem {
        isPick?: boolean;
        boxType?: string;
        type?: string;
        [k: string]: any;
    }
</script>

<script lang="ts">
    export let title: string = null;
    export let showFilter = false;
    export let showBorders = false;
    export let backgroundColor = null;
    export let borderRadius = 8;
    export let rowHeight = null;
    export let autofocus = false;
    export let estimatedItemSize = true;
    export let autoSize = false;
    export let isScrollEnabled = true;
    export let width: string | number = '*';
    export let containerColumns: string = '*';
    export let autoSizeListItem: boolean = false;
    export let fontWeight = 'bold';
    export let options: OptionType[] | ObservableArray<OptionType>;
    export let onClose = null;
    export let selectedIndex = -1;
    export let height: number | string = null;
    export let fontSize = 16;
    export let iconFontSize = 24;
    export let onlyOneSelected = false;
    export let currentlyCheckedItem = null;
    export let onCheckBox: (item, value, e) => void = null;
    export let onChange: (item, value, e) => void = null;
    export let onRightIconTap: (item, e) => void = null;
    export let onLongPress: (item, e) => void = null;

    export let titleProps: Partial<svelteNative.JSX.LabelAttributes> = {};
    export let titleHolderProps: Partial<svelteNative.JSX.StackLayoutAttributes> = {};
    export let subtitleProps: Partial<svelteNative.JSX.LabelAttributes> = {};
    export let templateProps: Partial<svelteNative.JSX.GridLayoutAttributes> & {
        [k: string]: Partial<svelteNative.JSX.ViewAttributes>;
    } = {};

    export let component = autoSizeListItem ? ListItemAutoSize : ListItem;
    let filteredOptions: OptionType[] | ObservableArray<OptionType> = null;
    let filter: string = null;

    // technique for only specific properties to get updated on store change
    $: ({ colorOnSurface, colorOutline } = $colors);

    function updateFiltered(filter) {
        if (filter) {
            filteredOptions = options.filter((d) => d.name.indexOf(filter) !== -1);
        } else {
            filteredOptions = options;
        }
    }
    const updateFilteredDebounce = debounce(updateFiltered, 500);
    updateFiltered(filter);
    $: updateFilteredDebounce(filter);

    function close(value?: OptionType) {
        (onClose || closeBottomSheet)(value);
    }

    let checkboxTapTimer;
    function clearCheckboxTimer() {
        if (checkboxTapTimer) {
            clearTimeout(checkboxTapTimer);
            checkboxTapTimer = null;
        }
    }
    async function onRightTap(item: OptionType, event) {
        onRightIconTap?.(item, event);
    }
    async function onTap(item: OptionType, event) {
        if (item.isPick) {
            try {
                const result = await openFilePicker({
                    extensions: ['file/*'],
                    multipleSelection: false,
                    pickerMode: 0,
                    forceSAF: true
                });
                if (File.exists(result.files[0])) {
                    const file = File.fromPath(result.files[0]);
                    close({ name: file.name, data: { url: file.path }, isPick: true });
                } else {
                    close(null);
                }
            } catch (err) {
                close(null);
            }
        } else if (item.type === 'checkbox' || item.type === 'switch') {
            // we dont want duplicate events so let s timeout and see if we clicking diretly on the checkbox
            const checkboxView: CheckBox = ((event.object as View).parent as View).getViewById('checkbox');
            clearCheckboxTimer();
            checkboxTapTimer = setTimeout(() => {
                checkboxView.checked = !checkboxView.checked;
            }, 10);
        } else {
            close(item);
        }
    }
    let ignoreNextOnCheckBoxChange = false;
    function onCheckedChanged(item, event) {
        // DEV_LOG && console.log('onCheckedChanged', event.value, ignoreNextOnCheckBoxChange);
        clearCheckboxTimer();
        if (ignoreNextOnCheckBoxChange) {
            ignoreNextOnCheckBoxChange = false;
            return;
        }
        ignoreNextOnCheckBoxChange = true;
        if (onlyOneSelected && options instanceof ObservableArray) {
            if (event.value) {
                const oldSelected = currentlyCheckedItem;
                if (oldSelected === item) {
                    ignoreNextOnCheckBoxChange = false;
                    return;
                }
                DEV_LOG && console.log('onlyOneSelected', oldSelected);
                item.value = true;
                currentlyCheckedItem = item;
                if (oldSelected) {
                    const index = options.indexOf(oldSelected);
                    DEV_LOG && console.log('onlyOneSelected1', index);
                    if (index >= 0) {
                        oldSelected.value = false;
                        options.setItem(index, oldSelected);
                    }
                }
                options.setItem(options.indexOf(currentlyCheckedItem), currentlyCheckedItem);
            } else {
                // we dont allow to have none selected
                ignoreNextOnCheckBoxChange = false;
                const checkboxView: CheckBox = ((event.object as View).parent as View).getViewById('checkbox');
                checkboxView.checked = true;
                return;
            }
        }
        onCheckBox?.(item, event.value, event);
        ignoreNextOnCheckBoxChange = false;
    }
    onDestroy(() => {
        blurTextField();
    });
    function onTextFieldLoaded(event: EventData) {
        setTimeout(() => {
            DEV_LOG && console.log('onTextFieldLoaded', autofocus);
            if (autofocus) {
                (event.object as TextField).requestFocus();
            } else {
                (event.object as TextField).clearFocus();
            }
        }, 0);
    }
    function blurTextField() {
        Utils.dismissSoftInput();
    }

    function itemTemplateSelector(item) {
        if (item.type) {
            return item.type;
        }
        if (autoSizeListItem && item.icon) {
            return 'lefticon';
        }
        if (item.rightIcon) {
            return 'righticon';
        }
        return 'default';
    }
    function onDataPopulated(event) {
        if (selectedIndex !== undefined) {
            if (onlyOneSelected) {
                currentlyCheckedItem = options instanceof ObservableArray ? options.getItem(selectedIndex) : options[selectedIndex];
            }
            if (selectedIndex > 0) {
                event.object.scrollToIndex(selectedIndex, false);
            }
        }
    }
</script>

<gesturerootview columns={containerColumns} rows="auto">
    <gridlayout {backgroundColor} {borderRadius} columns={`${width}`} {height} rows="auto,auto,*" {...$$restProps}>
        {#if title}
            <label class="actionBarTitle" fontWeight="bold" margin="10 10 0 10" text={title} />
        {/if}
        {#if showFilter}
            <gridlayout borderColor={colorOutline} margin="10 10 0 10" row={1}>
                <textfield
                    autocapitalizationType="none"
                    backgroundColor="transparent"
                    hint={lc('search')}
                    placeholder={lc('search')}
                    returnKeyType="search"
                    text={filter}
                    variant="outline"
                    verticalTextAlignment="center"
                    on:loaded={onTextFieldLoaded}
                    on:returnPress={blurTextField}
                    on:textChange={(e) => (filter = e['value'])} />

                <IconButton
                    col={1}
                    gray={true}
                    horizontalAlignment="right"
                    isHidden={!filter || filter.length === 0}
                    size={40}
                    text="mdi-close"
                    verticalAlignment="middle"
                    on:tap={() => {
                        blurTextField();
                        filter = null;
                    }} />
            </gridlayout>
        {/if}
        <collectionView
            {autoSize}
            {estimatedItemSize}
            {isScrollEnabled}
            {itemTemplateSelector}
            items={filteredOptions}
            row={2}
            {rowHeight}
            on:dataPopulated={onDataPopulated}
            ios:contentInsetAdjustmentBehavior={2}>
            <Template key="checkbox" let:item>
                <svelte:component
                    this={component}
                    {borderRadius}
                    columns="auto,*,auto"
                    {fontSize}
                    {fontWeight}
                    iconFontSize={item.iconFontSize || iconFontSize}
                    {item}
                    mainCol={1}
                    showBottomLine={showBorders}
                    {subtitleProps}
                    {titleHolderProps}
                    {titleProps}
                    {...templateProps}
                    onLongPress={onLongPress ? (e) => onLongPress(item, e) : null}
                    on:tap={(event) => onTap(item, event)}>
                    <checkbox
                        id="checkbox"
                        boxType={item.boxType}
                        checked={item.value}
                        col={item.boxType === 'circle' ? 0 : 2}
                        verticalAlignment="center"
                        on:checkedChange={(e) => onCheckedChanged(item, e)} />
                </svelte:component>
            </Template>
            <Template key="switch" let:item>
                <svelte:component
                    this={component}
                    {borderRadius}
                    columns="auto,*,auto"
                    {fontSize}
                    {fontWeight}
                    iconFontSize={item.iconFontSize || iconFontSize}
                    {item}
                    mainCol={1}
                    showBottomLine={showBorders}
                    {subtitleProps}
                    {titleHolderProps}
                    {titleProps}
                    {...templateProps}
                    onLongPress={onLongPress ? (e) => onLongPress(item, e) : null}
                    on:tap={(event) => onTap(item, event)}>
                    <switch id="checkbox" checked={item.value} col={1} marginLeft={10} on:checkedChange={(e) => onCheckedChanged(item, e)} />
                </svelte:component>
            </Template>
            <Template key="righticon" let:item>
                <svelte:component
                    this={component}
                    {borderRadius}
                    columns="*,auto"
                    {fontSize}
                    {fontWeight}
                    iconFontSize={item.iconFontSize || iconFontSize}
                    {item}
                    showBottomLine={showBorders}
                    {subtitleProps}
                    {titleHolderProps}
                    {titleProps}
                    {...templateProps}
                    onLongPress={onLongPress ? (e) => onLongPress(item, e) : null}
                    on:tap={(event) => onTap(item, event)}>
                    <mdbutton class="icon-btn" col={1} text={item.rightIcon} variant="text" on:tap={(event) => onRightTap(item, event)} />
                </svelte:component>
            </Template>
            <Template key="lefticon" let:item>
                <svelte:component
                    this={component}
                    {borderRadius}
                    columns="auto,*"
                    {fontSize}
                    {fontWeight}
                    {item}
                    mainCol={1}
                    showBottomLine={showBorders}
                    {subtitleProps}
                    {titleHolderProps}
                    {titleProps}
                    {...templateProps}
                    onLongPress={onLongPress ? (e) => onLongPress(item, e) : null}
                    on:tap={(event) => onTap(item, event)}>
                    <label
                        col={0}
                        color={item.color || colorOnSurface}
                        fontFamily={$fonts.mdi}
                        fontSize={(item.iconFontSize || iconFontSize) * $fontScale}
                        paddingLeft="8"
                        text={item.icon}
                        verticalAlignment="center"
                        width={iconFontSize * 2} />
                </svelte:component>
            </Template>
            <Template key="image" let:item>
                <svelte:component
                    this={component}
                    {borderRadius}
                    columns="auto,*"
                    {fontSize}
                    {fontWeight}
                    iconFontSize={item.iconFontSize || iconFontSize}
                    {item}
                    mainCol={1}
                    showBottomLine={showBorders}
                    {subtitleProps}
                    title={item.name}
                    {titleHolderProps}
                    {titleProps}
                    {...templateProps}
                    onLongPress={onLongPress ? (e) => onLongPress(item, e) : null}
                    on:tap={(event) => onTap(item, event)}>
                    <image borderRadius={4} col={0} marginBottom={5} marginRight={10} marginTop={5} src={item.image} />
                </svelte:component>
            </Template>
            <Template key="checkbox_image" let:item>
                <svelte:component
                    this={component}
                    {borderRadius}
                    columns="auto,*,auto"
                    {fontSize}
                    {fontWeight}
                    iconFontSize={item.iconFontSize || iconFontSize}
                    {item}
                    mainCol={1}
                    showBottomLine={showBorders}
                    {subtitleProps}
                    title={item.name}
                    {titleHolderProps}
                    {titleProps}
                    {...templateProps}
                    onLongPress={onLongPress ? (e) => onLongPress(item, e) : null}
                    on:tap={(event) => onTap(item, event)}>
                    <checkbox
                        id="checkbox"
                        boxType={item.boxType}
                        checked={item.value}
                        col={item.boxType === 'circle' ? 0 : 2}
                        verticalAlignment="center"
                        on:checkedChange={(e) => onCheckedChanged(item, e)} />
                    <image borderRadius={4} col={2} marginBottom={5} marginRight={10 + (item.imageMargin ?? 0)} marginTop={5} src={item.image} stretch="aspectFit" width={item.imageWidth ?? 50} />
                </svelte:component>
            </Template>Z
            <Template let:item>
                <svelte:component
                    this={component}
                    {borderRadius}
                    {fontSize}
                    {fontWeight}
                    iconFontSize={item.iconFontSize || iconFontSize}
                    {item}
                    showBottomLine={showBorders}
                    {subtitleProps}
                    {titleHolderProps}
                    {titleProps}
                    {...templateProps}
                    onLongPress={onLongPress ? (e) => onLongPress(item, e) : null}
                    on:rightTap={(event) => onRightTap(item, event)}
                    on:tap={(event) => onTap(item, event)}>
                </svelte:component>
            </Template>
            <slot name="templates" />
        </collectionView>
    </gridlayout>
</gesturerootview>
