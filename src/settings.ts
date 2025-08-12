
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from './types';
import AutoFitTabsPlugin from './main';

export class AutoFitTabsSettingTab extends PluginSettingTab {
    plugin: AutoFitTabsPlugin;

    constructor(app: App, plugin: AutoFitTabsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.createSettingsUI(containerEl);
    }

    private createSettingsUI(container: HTMLElement): void {
        // General settings at the top without a heading
        [
            {
                name: 'Close button left padding',
                desc: 'Space in pixels before close button',
                prop: 'closeButtonLeftPadding' as keyof PluginSettings
            },
            {
                name: 'Close button right padding',
                desc: 'Space in pixels after close button',
                prop: 'closeButtonRightPadding' as keyof PluginSettings
            },
            {
                name: 'Transition duration',
                desc: 'Duration in milliseconds for smooth transitions',
                prop: 'transitionDuration' as keyof PluginSettings
            }
        ].forEach(({ name, desc, prop }) => {
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
                            // Ensure transition duration is applied with any settings change
                            this.plugin.updateCSSVariables();
                            await this.plugin.saveSettings();
                        }
                    }));
        });

        this.createSettingsSection(container, 'Basic dimensions', [
            {
                name: 'Minimum width',
                desc: 'Minimum width in pixels for very short titles',
                prop: 'minWidth' as keyof PluginSettings
            },
            {
                name: 'Max width',
                desc: 'Maximum width in pixels for tabs (0 to disable)',
                prop: 'maxWidth' as keyof PluginSettings
            }
        ]);

        this.createSettingsSection(container, 'Icons', [
            {
                name: 'Icon width',
                desc: 'Width in pixels for tab icons',
                prop: 'iconWidth' as keyof PluginSettings
            },
            {
                name: 'Left padding',
                desc: 'Padding in pixels before the icon',
                prop: 'leftPadding' as keyof PluginSettings
            }
        ]);
    }

    private createSettingsSection(container: HTMLElement, title: string, settings: Array<{
        name: string;
        desc: string;
        prop: keyof PluginSettings;
    }>): void {
        new Setting(container)
            .setName(title)
            .setHeading();
        
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
