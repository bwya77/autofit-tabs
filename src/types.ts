
export interface PluginSettings {
    minWidth: number;
    leftPadding: number;
    closeButtonLeftPadding: number;
    closeButtonRightPadding: number;
    transitionDuration: number;
    iconWidth: number;
    maxWidth: number;
    ignorePinnedTabs: boolean;
    hideTabIcons: boolean;
    [key: string]: number | boolean; // Index signature to allow string indexing
}

export const DEFAULT_SETTINGS: PluginSettings = {
    minWidth: 40,
    leftPadding: 12,
    closeButtonLeftPadding: 30,
    closeButtonRightPadding: 8,
    transitionDuration: 375,
    iconWidth: 20,
    maxWidth: 0, // 0 means disabled
    ignorePinnedTabs: false,
    hideTabIcons: false
} as PluginSettings;
