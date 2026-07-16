
import {
    App,
    PluginSettingTab,
    requireApiVersion,
    Setting,
    type SettingDefinition,
    type SettingDefinitionItem,
} from 'obsidian';
import { DEFAULT_SETTINGS, type PluginSettings } from './types';
import AutoFitTabsPlugin from './main';

type NumericSettingKey =
    | 'closeButtonLeftPadding'
    | 'closeButtonRightPadding'
    | 'iconWidth'
    | 'leftPadding'
    | 'maxWidth'
    | 'minWidth'
    | 'transitionDuration';

export class AutoFitTabsSettingTab extends PluginSettingTab {
    plugin: AutoFitTabsPlugin;

    constructor(app: App, plugin: AutoFitTabsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        if (!requireApiVersion('1.13.0')) {
            return [];
        }

        const numberSetting = (
            name: string,
            desc: string,
            key: NumericSettingKey,
        ): SettingDefinition => ({
            name,
            desc: `${desc} (default: ${DEFAULT_SETTINGS[key]})`,
            control: {
                type: 'number',
                key,
                defaultValue: Number(DEFAULT_SETTINGS[key]),
                min: 0,
            },
        });

        return [
            numberSetting(
                'Close button left padding',
                'Space in pixels before close button',
                'closeButtonLeftPadding',
            ),
            numberSetting(
                'Close button right padding',
                'Space in pixels after close button',
                'closeButtonRightPadding',
            ),
            numberSetting(
                'Transition duration',
                'Duration in milliseconds for smooth transitions',
                'transitionDuration',
            ),
            {
                name: 'Ignore pinned tabs',
                desc: 'Do not modify pinned tabs (keeps default behavior)',
                control: { type: 'toggle', key: 'ignorePinnedTabs' },
            },
            {
                name: 'Ignore web links',
                desc: 'Do not modify tabs that are web links (keeps default behavior)',
                control: { type: 'toggle', key: 'ignoreWebLinks' },
            },
            {
                type: 'group',
                heading: 'Basic dimensions',
                items: [
                    numberSetting(
                        'Minimum width',
                        'Minimum width in pixels for very short titles',
                        'minWidth',
                    ),
                    numberSetting(
                        'Max width',
                        'Maximum width in pixels for tabs (0 to disable)',
                        'maxWidth',
                    ),
                ],
            },
            {
                type: 'group',
                heading: 'Icons',
                items: [
                    numberSetting(
                        'Icon width',
                        'Width in pixels for tab icons',
                        'iconWidth',
                    ),
                    numberSetting(
                        'Left padding',
                        'Padding in pixels before the icon',
                        'leftPadding',
                    ),
                    {
                        name: 'Hide tab icons',
                        desc: 'Hide all icons in tabs',
                        control: { type: 'toggle', key: 'hideTabIcons' },
                    },
                ],
            },
        ];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        if (!(key in this.plugin.settings)) {
            return;
        }

        Reflect.set(this.plugin.settings, key, value);
        if (
            key === 'closeButtonLeftPadding' ||
            key === 'closeButtonRightPadding' ||
            key === 'transitionDuration'
        ) {
            this.plugin.updateCSSVariables();
        }
        await this.plugin.saveSettings();
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

        // Add ignore pinned tabs toggle
        new Setting(container)
            .setName('Ignore pinned tabs')
            .setDesc('Do not modify pinned tabs (keeps default behavior)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ignorePinnedTabs)
                .onChange(async (value) => {
                    this.plugin.settings.ignorePinnedTabs = value;
                    await this.plugin.saveSettings();
                }));

        // Add ignore web links toggle
        new Setting(container)
            .setName('Ignore web links')
            .setDesc('Do not modify tabs that are web links (keeps default behavior)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ignoreWebLinks)
                .onChange(async (value) => {
                    this.plugin.settings.ignoreWebLinks = value;
                    await this.plugin.saveSettings();
                }));

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

        // Add hide tab icons toggle
        new Setting(container)
            .setName('Hide tab icons')
            .setDesc('Hide all icons in tabs')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideTabIcons)
                .onChange(async (value) => {
                    this.plugin.settings.hideTabIcons = value;
                    await this.plugin.saveSettings();
                }));
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
