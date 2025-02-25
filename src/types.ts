
export interface PluginSettings {
    minWidth: number;
    closeButtonWidth: number;
    leftPadding: number;
    iconRightMargin: number;
    closeButtonPadding: number;
    transitionDuration: number;
    iconWidth: number;
    maxWidth: number;
    [key: string]: number; // Index signature to allow string indexing
}

export const DEFAULT_SETTINGS: PluginSettings = {
    minWidth: 40,
    closeButtonWidth: 28,
    leftPadding: 12,
    iconRightMargin: 0,
    closeButtonPadding: 0,
    transitionDuration: 275,
    iconWidth: 20,
    maxWidth: 0 // 0 means disabled
} as PluginSettings;
