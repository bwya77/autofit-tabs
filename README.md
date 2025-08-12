# AutoFit Tabs for Obsidian

Automatically adjusts tab header widths in real-time to perfectly fit each tab's title content while maintaining a clean, seamless interface that prevents awkward text truncation and ensures optimal readability of your document titles.

![Demo video](/images/demo.gif) 

## Features

- **Dynamic Width Adjustment**: Tabs automatically resize to fit their content
- **Smooth Transitions**: Clean animations when tabs are resized
- **Space Optimization**: No more truncated titles or wasted space
- **Highly Customizable**: Fine-tune every aspect of tab appearance
- **Resource Efficient**: Uses caching to minimize performance impact
- **Clean Interface**: Maintains Obsidian's sleek look and feel
- **Max Width**: Set a maximum width for tabs to prevent excessive resizing
- **Ignore Pinned Tabs**: Option to keep pinned tabs with default Obsidian behavior
- **Hide Tab Icons**: Option to remove all icons from tabs for a cleaner look
- **Close Button Customization**: Adjust padding before and after the close button
- **Icon Configuration**: Customize icon width and left padding
- **Transition Duration**: Set how fast tabs animate when resizing
- **Scrolling Tab Bars**: Enables tabs to be scrolled left and right when they exceed the available space
- **Auto Center Tabs**: When clicking a tab that is off-screen, the tab will automatically scroll into view

## Installation

1. Open Obsidian Settings
2. Navigate to Community Plugins and disable Safe Mode
3. Click Browse and search for "AutoFit Tabs"
4. Install the plugin
5. Enable the plugin in your Community Plugins list

### Manual Installation

1. Download the latest release from the releases page
2. Extract the files into your vault's `.obsidian/plugins/autofit-tabs/` directory
3. Reload Obsidian
4. Enable the plugin in your Community Plugins list

## Usage

Once installed and enabled, AutoFit Tabs works automatically with no additional configuration needed. The plugin will immediately begin adjusting your tab widths to fit their content.

### Configuration

You can customize the following settings in the plugin options:

![Plugin Settings](/images/settings.png) 

### General

| Setting                      | Description                                     | Default |
| ---------------------------- | ----------------------------------------------- | ------- |
| Close button left padding    | Space in pixels before close button            | 30      |
| Close button right padding   | Space in pixels after close button             | 8       |
| Transition duration          | Duration in milliseconds for smooth transitions | 375     |
| Ignore pinned tabs           | Do not modify pinned tabs (keeps default behavior) | false   |
| Hide tab icons               | Hide all icons in tabs                         | false   |

### Basic dimensions

| Setting            | Description                                     | Default |
| ------------------ | ----------------------------------------------- | ------- |
| Minimum width      | Minimum width in pixels for very short titles   | 40      |
| Max width          | Maximum width in pixels for tabs (0 to disable) | 0       |

### Icons

| Setting           | Description                           | Default |
| ----------------- | ------------------------------------- | ------- |
| Icon width        | Width in pixels for tab icons         | 20      |
| Left padding      | Padding in pixels before the icon     | 12      |

## Compatibility

- Requires Obsidian v1.0.0 or higher
- Desktop only (not available for mobile)
- Compatible with most themes and plugins

## Support

If you find this plugin helpful, you can:

- Star the repository on GitHub
- Report any issues on the GitHub issue tracker
- [Buy me a coffee](https://buymeacoffee.com/bwya77)
- [Become a GitHub Sponsor](https://github.com/sponsors/bwya77)

## Development

Want to contribute or modify the plugin? Here's how to get started with the source code:

1. Create a directory for your GitHub projects:
   ```bash
   cd path/to/somewhere
   mkdir Github
   cd Github
   ```

2. Clone the repository:
   ```bash
   git clone https://github.com/bwya77/autofit-tabs.git
   ```

3. Navigate to the plugin directory:
   ```bash
   cd autofit-tabs
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

5. Start development build mode:
   ```bash
   npm run dev
   ```
   This command will keep running in the terminal and automatically rebuild the plugin whenever you make changes to the source code.

6. You'll see a `main.js` file appear in the plugin directory - this is the compiled version of your plugin.

### Testing Your Changes

To test your modifications:

1. Create a symbolic link or copy your plugin folder to your vault's `.obsidian/plugins/` directory
2. Enable the plugin in Obsidian's community plugins settings
3. Use the developer console (Ctrl+Shift+I) to check for errors and debug

### Making Contributions

1. Fork the repository
2. Create a new branch for your feature
3. Make your changes
4. Submit a pull request with a clear description of your changes

## License

MIT License. See [LICENSE](https://github.com/bwya77/autofit-tabs/blob/main/LICENSE) for full text.
