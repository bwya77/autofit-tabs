import { Plugin, PluginSettingTab, Setting, App } from 'obsidian';

interface PluginSettings {
    minWidth: number;
    closeButtonWidth: number;
    leftPadding: number;
    iconRightMargin: number;
    closeButtonPadding: number;
    transitionDuration: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
    minWidth: 40,          // Minimum width for very short titles
    closeButtonWidth: 28,  // Width of the close button
    leftPadding: 12,      // Padding before the icon
    iconRightMargin: 0,   // Space between icon and text
    closeButtonPadding: 10, // Space before close button
    transitionDuration: 275 // Duration for smooth transitions in milliseconds
};

class AutoFitTabsPlugin extends Plugin {
    settings: PluginSettings;
    tabWidthCache: Map<string, string> = new Map();
    observer: MutationObserver | null = null;

    async onload() {
        console.log('Autofit Tabs Plugin loading...');
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Add settings tab
        this.addSettingTab(new AutoFitTabsSettingTab(this.app, this));

        this.addTransitionStyles();

        this.observer = new MutationObserver((mutations) => {
            const shouldUpdate = mutations.some(mutation => {
                const isRelevantChange = mutation.type === 'characterData' ||
                    (mutation.type === 'childList' &&
                        (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0));

                return isRelevantChange;
            });

            if (shouldUpdate) {
                requestAnimationFrame(() => this.adjustAllHeaders());
            }
        });

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

        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                const currentHeaders = document.querySelectorAll('.workspace-tab-header');
                const uncachedHeaders = Array.from(currentHeaders).some(header =>
                    !this.tabWidthCache.has(this.getHeaderKey(header as HTMLElement))
                );

                if (uncachedHeaders) {
                    requestAnimationFrame(() => this.adjustAllHeaders());
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('file-open', () => {
                const activeHeader = document.querySelector('.workspace-tab-header.is-active');
                if (activeHeader && !this.tabWidthCache.has(this.getHeaderKey(activeHeader as HTMLElement))) {
                    requestAnimationFrame(() => this.adjustAllHeaders());
                }
            })
        );

        requestAnimationFrame(() => this.adjustAllHeaders());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.addTransitionStyles();
        this.adjustAllHeaders();
    }

    getHeaderKey(header: HTMLElement): string {
        const titleElement = header.querySelector('.workspace-tab-header-inner-title');
        return titleElement ? (titleElement.textContent || '') : '';
    }

    addTransitionStyles() {
        const existingStyle = document.getElementById('autofit-tabs-transitions');
        if (existingStyle) {
            existingStyle.remove();
        }

        const styleEl = document.createElement('style');
        styleEl.id = 'autofit-tabs-transitions';
        styleEl.textContent = `
            .workspace-tab-header.autofit-tab {
                transition: all ${this.settings.transitionDuration}ms ease !important;
            }
            .workspace-tab-header.autofit-tab.transitioning .workspace-tab-header-inner {
                overflow: hidden !important;
            }
            .workspace-tab-header.autofit-tab.transitioning .workspace-tab-header-inner-title {
                opacity: 0;
                overflow: hidden !important;
            }
            .workspace-tab-header.autofit-tab:not(.transitioning) .workspace-tab-header-inner,
            .workspace-tab-header.autofit-tab:not(.transitioning) .workspace-tab-header-inner-title {
                overflow: visible !important;
                text-overflow: clip !important;
            }
        `;
        document.head.appendChild(styleEl);
    }

    adjustAllHeaders() {
        const tabHeaders = document.querySelectorAll('.workspace-split.mod-vertical .workspace-tabs:not(.mod-top-left-space):not(.mod-left-split) .workspace-tab-header');
        const newCache = new Map<string, string>();
        let hasChanges = false;

        tabHeaders.forEach((header) => {
            if (header instanceof HTMLElement) {
                const headerKey = this.getHeaderKey(header);
                const cachedWidth = this.tabWidthCache.get(headerKey);
                const currentWidth = header.style.getPropertyValue('width');

                if (cachedWidth && currentWidth === cachedWidth) {
                    newCache.set(headerKey, cachedWidth);
                    this.applyHeaderStyles(header, parseInt(cachedWidth));
                } else {
                    header.classList.add('autofit-tab', 'transitioning');
                    const width = this.calculateHeaderWidth(header);
                    newCache.set(headerKey, `${width}px`);
                    this.applyHeaderStyles(header, width);
                    hasChanges = true;
                }
            }
        });

        this.tabWidthCache = newCache;

        if (hasChanges) {
            setTimeout(() => {
                tabHeaders.forEach((header) => {
                    if (header instanceof HTMLElement) {
                        header.classList.remove('transitioning');
                    }
                });
            }, this.settings.transitionDuration + 50);
        }

        const containers = document.querySelectorAll('.workspace-split.mod-vertical .workspace-tab-header-container:not(.mod-top-left-space)');
        containers.forEach(container => {
            if (container instanceof HTMLElement) {
                const inner = container.querySelector('.workspace-tab-header-container-inner');
                if (inner instanceof HTMLElement) {
                    inner.style.overflow = 'auto';
                }
            }
        });
    }

    calculateHeaderWidth(header: HTMLElement): number {
        const titleElement = header.querySelector('.workspace-tab-header-inner-title');
        if (!titleElement) return this.settings.minWidth;

        const temp = document.createElement('span');
        temp.style.visibility = 'hidden';
        temp.style.position = 'absolute';
        temp.style.whiteSpace = 'nowrap';
        temp.style.font = window.getComputedStyle(titleElement).font;
        temp.innerText = titleElement.textContent || '';
        document.body.appendChild(temp);
        const textWidth = temp.offsetWidth;
        document.body.removeChild(temp);

        const extraPadding = textWidth < 20 ? 10 : 0;

        return Math.max(
            this.settings.leftPadding +
            20 +
            this.settings.iconRightMargin +
            textWidth +
            extraPadding +
            this.settings.closeButtonPadding +
            this.settings.closeButtonWidth,
            this.settings.minWidth
        );
    }

    applyHeaderStyles(header: HTMLElement, width: number) {
        header.style.setProperty('width', `${width}px`, 'important');
        header.style.setProperty('min-width', `${width}px`, 'important');
        header.style.setProperty('max-width', `${width}px`, 'important');

        const titleElement = header.querySelector('.workspace-tab-header-inner-title');
			if (titleElement instanceof HTMLElement) {
				titleElement.style.overflow = 'visible';
				titleElement.style.textOverflow = 'clip';
				titleElement.style.whiteSpace = 'nowrap';
				titleElement.style.marginRight = `${this.settings.closeButtonPadding}px`;
		}

        const innerContainer = header.querySelector('.workspace-tab-header-inner');
        if (innerContainer instanceof HTMLElement) {
            innerContainer.style.overflow = 'visible';
            innerContainer.style.display = 'flex';
            innerContainer.style.alignItems = 'center';
            innerContainer.style.width = '100%';
            innerContainer.style.paddingLeft = `${this.settings.leftPadding}px`;
        }

        const icon = header.querySelector('.workspace-tab-header-inner-icon');
        if (icon instanceof HTMLElement) {
            icon.style.marginRight = `${this.settings.iconRightMargin}px`;
        }
    }

    onunload() {
        console.log('Unloading Autofit Tabs Plugin...');
        this.tabWidthCache.clear();

        if (this.observer) {
            this.observer.disconnect();
        }

        const styleEl = document.getElementById('autofit-tabs-transitions');
        if (styleEl) {
            styleEl.remove();
        }

        const allHeaders = document.querySelectorAll('.workspace-split.mod-vertical .workspace-tabs:not(.mod-top-left-space):not(.mod-left-split) .workspace-tab-header');
        allHeaders.forEach((header) => {
            if (header instanceof HTMLElement) {
                header.classList.remove('autofit-tab');
                header.classList.remove('transitioning');

                header.style.removeProperty('width');
                header.style.removeProperty('min-width');
                header.style.removeProperty('max-width');

                const titleElement = header.querySelector('.workspace-tab-header-inner-title');
                if (titleElement instanceof HTMLElement) {
                    titleElement.style.overflow = '';
                    titleElement.style.textOverflow = '';
                    titleElement.style.whiteSpace = '';
                    titleElement.style.marginRight = '';
                }

                const innerContainer = header.querySelector('.workspace-tab-header-inner');
                if (innerContainer instanceof HTMLElement) {
                    innerContainer.style.overflow = '';
                    innerContainer.style.display = '';
                    innerContainer.style.alignItems = '';
                    innerContainer.style.width = '';
                    innerContainer.style.paddingLeft = '';
                }

                const icon = header.querySelector('.workspace-tab-header-inner-icon');
                if (icon instanceof HTMLElement) {
                    icon.style.marginRight = '';
                }
            }
        });

        const containers = document.querySelectorAll('.workspace-split.mod-vertical .workspace-tab-header-container:not(.mod-top-left-space)');
        containers.forEach(container => {
            if (container instanceof HTMLElement) {
                const inner = container.querySelector('.workspace-tab-header-container-inner');
                if (inner instanceof HTMLElement) {
                    inner.style.overflow = '';
                }
            }
        });
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

        containerEl.createEl('h2', { text: 'AutoFit Tabs Settings' });

        new Setting(containerEl)
            .setName('Minimum Width')
            .setDesc(`Minimum width in pixels for very short titles (default: ${DEFAULT_SETTINGS.minWidth})`)
            .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.minWidth))
                .setValue(String(this.plugin.settings.minWidth))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.minWidth = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Close Button Width')
            .setDesc(`Width in pixels for the tab close button (default: ${DEFAULT_SETTINGS.closeButtonWidth})`)
            .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.closeButtonWidth))
                .setValue(String(this.plugin.settings.closeButtonWidth))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.closeButtonWidth = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Left Padding')
            .setDesc(`Padding in pixels before the icon (default: ${DEFAULT_SETTINGS.leftPadding})`)
            .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.leftPadding))
                .setValue(String(this.plugin.settings.leftPadding))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.leftPadding = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Icon Right Margin')
            .setDesc(`Space in pixels between icon and text (default: ${DEFAULT_SETTINGS.iconRightMargin})`)
            .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.iconRightMargin))
                .setValue(String(this.plugin.settings.iconRightMargin))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.iconRightMargin = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Close Button Padding')
            .setDesc(`Space in pixels before close button (default: ${DEFAULT_SETTINGS.closeButtonPadding})`)
            .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.closeButtonPadding))
                .setValue(String(this.plugin.settings.closeButtonPadding))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.closeButtonPadding = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Transition Duration')
            .setDesc(`Duration in milliseconds for smooth transitions (default: ${DEFAULT_SETTINGS.transitionDuration})`)
            .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.transitionDuration))
                .setValue(String(this.plugin.settings.transitionDuration))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.transitionDuration = numValue;
                        await this.plugin.saveSettings();
                    }
                }));
    }
}

export default AutoFitTabsPlugin;