
import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from './types';
import { AutoFitTabsSettingTab } from './settings';
import { TabManager } from './tabManager';

export default class AutoFitTabsPlugin extends Plugin {
    settings: PluginSettings;
    private tabManager: TabManager;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new AutoFitTabsSettingTab(this.app, this));
        
        this.tabManager = new TabManager(this);
        this.updateCSSVariables();
        this.tabManager.initialize();
    }

    onunload(): void {
        this.tabManager.cleanup();
    }

    private async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    updateCSSVariables(): void {
        // When icons are hidden, use the left padding directly for the tab inner padding
        const effectiveLeftPadding = this.settings.hideTabIcons ? 
            this.settings.leftPadding : 
            this.settings.leftPadding;
            
        const cssVars: Record<string, string> = {
            '--autofit-min-width': `${this.settings.minWidth}px`,
            '--autofit-left-padding': `${effectiveLeftPadding}px`,
            '--autofit-close-button-left-padding': `${this.settings.closeButtonLeftPadding}px`,
            '--autofit-close-button-right-padding': `${this.settings.closeButtonRightPadding}px`,
            '--autofit-transition-duration': `${this.settings.transitionDuration}ms`,
            '--autofit-icon-width': this.settings.hideTabIcons ? '0' : `${this.settings.iconWidth}px`,
            '--autofit-icon-display': this.settings.hideTabIcons ? 'none' : (this.settings.iconWidth > 0 ? 'flex' : 'none'), // Hide icon if hideTabIcons is true or width is 0
            '--autofit-max-width': this.settings.maxWidth > 0 ? `${this.settings.maxWidth}px` : 'none'
        };

        Object.entries(cssVars).forEach(([property, value]) => {
            document.documentElement.style.setProperty(property, value);
        });

        // Add or remove class on body for hiding tab icons
        if (this.settings.hideTabIcons) {
            document.body.classList.add('autofit-hide-tab-icons');
        } else {
            document.body.classList.remove('autofit-hide-tab-icons');
        }
    }

    async saveSettings(): Promise<void> {
        const previousMaxWidth = this.settings.maxWidth;
        await this.saveData(this.settings);
        this.updateCSSVariables();
        
        // If max width was disabled, completely reset all tabs
        const isMaxWidthChanged = previousMaxWidth > 0 && this.settings.maxWidth === 0;
        if (isMaxWidthChanged) {
            this.tabManager.resetTabs(isMaxWidthChanged);
        } else {
            // Just recalculate normally for other setting changes
            this.tabManager.queueHeaderAdjustment();
        }
    }
}
