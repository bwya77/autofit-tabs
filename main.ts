import { Plugin, PluginSettingTab, Setting, App } from 'obsidian';
import './styles.css';

interface PluginSettings {
    minWidth: number;
    closeButtonWidth: number;
    leftPadding: number;
    iconRightMargin: number;
    closeButtonPadding: number;
    transitionDuration: number;
    iconWidth: number;
    activeIndicatorWidth: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
    minWidth: 40,
    closeButtonWidth: 28,
    leftPadding: 12,
    iconRightMargin: 0,
    closeButtonPadding: 10,
    transitionDuration: 275,
    iconWidth: 20,
    activeIndicatorWidth: 2
};

export default class AutoFitTabsPlugin extends Plugin {
    settings: PluginSettings;
    private tabWidthCache: Map<string, number> = new Map();
    private observer: MutationObserver | null = null;
    private measureElement: HTMLSpanElement | null = null;

    async onload() {
        console.log('Autofit Tabs Plugin loading...');
        
        await this.loadSettings();
        this.addSettingTab(new AutoFitTabsSettingTab(this.app, this));
        this.setupMeasureElement();
        this.updateCSSVariables();
        this.setupMutationObserver();
        this.registerEventHandlers();
        
        this.queueHeaderAdjustment();
    }

    onunload() {
        console.log('Unloading Autofit Tabs Plugin...');
        this.cleanup();
    }

    private async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    private setupMeasureElement() {
        this.measureElement = document.createElement('span');
        this.measureElement.className = 'autofit-tab-measure';
        document.body.appendChild(this.measureElement);
    }

    private setupMutationObserver() {
        this.observer = new MutationObserver(this.handleMutation.bind(this));
        
        const workspace = document.querySelector('.workspace-tabs');
        if (workspace) {
            this.observer.observe(workspace, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true,
                characterDataOldValue: true
            });
        }
    }

    private registerEventHandlers() {
        this.registerEvent(
            this.app.workspace.on('layout-change', this.handleLayoutChange.bind(this))
        );

        this.registerEvent(
            this.app.workspace.on('file-open', this.handleFileOpen.bind(this))
        );
    }

    private handleMutation(mutations: MutationRecord[]) {
        const shouldUpdate = mutations.some(mutation => 
            mutation.type === 'characterData' || 
            (mutation.type === 'childList' && 
            (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0))
        );

        if (shouldUpdate) {
            this.queueHeaderAdjustment();
        }
    }

    private handleLayoutChange() {
        const headers = this.getAllHeaders();
        const hasUncachedHeaders = headers.some(header => 
            !this.tabWidthCache.has(this.getHeaderKey(header))
        );

        if (hasUncachedHeaders) {
            this.queueHeaderAdjustment();
        }
    }

    private handleFileOpen() {
        const activeHeader = document.querySelector('.workspace-tab-header.is-active');
        if (activeHeader instanceof HTMLElement && 
            !this.tabWidthCache.has(this.getHeaderKey(activeHeader))) {
            this.queueHeaderAdjustment();
        }
    }

    private queueHeaderAdjustment() {
        requestAnimationFrame(() => this.adjustAllHeaders());
    }

    private getAllHeaders(): HTMLElement[] {
        return Array.from(document.querySelectorAll(
            '.workspace-split.mod-vertical .workspace-tabs:not(.mod-top-left-space):not(.mod-left-split) .workspace-tab-header'
        )) as HTMLElement[];
    }

    private getHeaderKey(header: HTMLElement): string {
        const titleElement = header.querySelector('.workspace-tab-header-inner-title');
        return titleElement?.textContent || '';
    }

    private measureTextWidth(text: string, element: Element): number {
        if (!this.measureElement) return 0;
        
        this.measureElement.style.font = window.getComputedStyle(element).font;
        this.measureElement.textContent = text;
        return this.measureElement.offsetWidth;
    }

    private calculateHeaderWidth(header: HTMLElement): number {
        const titleElement = header.querySelector('.workspace-tab-header-inner-title');
        if (!titleElement) return this.settings.minWidth;

        const textWidth = this.measureTextWidth(
            titleElement.textContent || '', 
            titleElement
        );
        
        return Math.ceil(Math.max(
            this.settings.leftPadding +
            this.settings.iconWidth +
            this.settings.iconRightMargin +
            textWidth +
            this.settings.closeButtonPadding +
            this.settings.closeButtonWidth,
            this.settings.minWidth
        ));
    }

    private adjustAllHeaders() {
        const headers = this.getAllHeaders();
        const newCache = new Map<string, number>();

        headers.forEach(header => {
            const headerKey = this.getHeaderKey(header);
            const width = this.calculateHeaderWidth(header);
            
            header.classList.add('autofit-tab');
            header.style.setProperty('--header-width', `${width}px`);
            newCache.set(headerKey, width);
        });

        this.tabWidthCache = newCache;
    }

    private updateCSSVariables() {
        const cssVars: Record<string, string> = {
            '--autofit-min-width': `${this.settings.minWidth}px`,
            '--autofit-close-button-width': `${this.settings.closeButtonWidth}px`,
            '--autofit-left-padding': `${this.settings.leftPadding}px`,
            '--autofit-icon-right-margin': `${this.settings.iconRightMargin}px`,
            '--autofit-close-button-padding': `${this.settings.closeButtonPadding}px`,
            '--autofit-transition-duration': `${this.settings.transitionDuration}ms`,
            '--autofit-icon-width': `${this.settings.iconWidth}px`,
            '--autofit-active-indicator-width': `${this.settings.activeIndicatorWidth}px`
        };

        Object.entries(cssVars).forEach(([property, value]) => {
            document.documentElement.style.setProperty(property, value);
        });
    }

    private cleanup() {
        this.tabWidthCache.clear();
        this.observer?.disconnect();
        this.measureElement?.remove();

        const cssVars = [
            '--autofit-min-width',
            '--autofit-close-button-width',
            '--autofit-left-padding',
            '--autofit-icon-right-margin',
            '--autofit-close-button-padding',
            '--autofit-transition-duration',
            '--autofit-icon-width',
            '--autofit-active-indicator-width'
        ];

        cssVars.forEach(varName => {
            document.documentElement.style.removeProperty(varName);
        });

        const headers = this.getAllHeaders();
        headers.forEach(header => {
            header.classList.add('autofit-cleanup');
            header.classList.remove('autofit-tab');
            header.style.removeProperty('--header-width');
            
            setTimeout(() => {
                header.classList.remove('autofit-cleanup');
            }, this.settings.transitionDuration);
        });
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateCSSVariables();
        this.adjustAllHeaders();
    }
}

class AutoFitTabsSettingTab extends PluginSettingTab {
    plugin: AutoFitTabsPlugin;

    constructor(app: App, plugin: AutoFitTabsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        this.createSettingsUI(containerEl);
    }

    private createSettingsUI(container: HTMLElement) {
        container.createEl('h2', { text: 'AutoFit Tabs Settings' });

        this.createSettingsSection(container, 'Basic Dimensions', [
            {
                name: 'Minimum Width',
                desc: 'Minimum width in pixels for very short titles',
                prop: 'minWidth'
            },
            {
                name: 'Close Button Width',
                desc: 'Width in pixels for the tab close button',
                prop: 'closeButtonWidth'
            },
            {
                name: 'Left Padding',
                desc: 'Padding in pixels before the icon',
                prop: 'leftPadding'
            }
        ]);

        this.createSettingsSection(container, 'Icon Settings', [
            {
                name: 'Icon Width',
                desc: 'Width in pixels for tab icons',
                prop: 'iconWidth'
            },
            {
                name: 'Icon Right Margin',
                desc: 'Space in pixels between icon and text',
                prop: 'iconRightMargin'
            }
        ]);

        this.createSettingsSection(container, 'Other Settings', [
            {
                name: 'Close Button Padding',
                desc: 'Space in pixels before close button',
                prop: 'closeButtonPadding'
            },
            {
                name: 'Active Indicator Width',
                desc: 'Width in pixels for the active tab indicator',
                prop: 'activeIndicatorWidth'
            },
            {
                name: 'Transition Duration',
                desc: 'Duration in milliseconds for smooth transitions',
                prop: 'transitionDuration'
            }
        ]);
    }

    private createSettingsSection(container: HTMLElement, title: string, settings: Array<{
        name: string;
        desc: string;
        prop: keyof PluginSettings;
    }>) {
        container.createEl('h3', { text: title });
        
        settings.forEach(({ name, desc, prop }) => {
            new Setting(container)
                .setName(name)
                .setDesc(`${desc} (default: ${DEFAULT_SETTINGS[prop]})`)
                .addText(text => text
                    .setPlaceholder(String(DEFAULT_SETTINGS[prop]))
                    .setValue(String(this.plugin.settings[prop]))
                    .onChange(async (value) => {
                        const numValue = Number(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                            this.plugin.settings[prop] = numValue;
                            await this.plugin.saveSettings();
                        }
                    }));
        });
    }
}