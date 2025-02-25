
import { TAbstractFile } from 'obsidian';
import AutoFitTabsPlugin from './main';

export class TabManager {
    private plugin: AutoFitTabsPlugin;
    private tabWidthCache: Map<string, number> = new Map();
    private observer: MutationObserver | null = null;
    private iconObserver: MutationObserver | null = null;
    private measureElement: HTMLSpanElement | null = null;
    private debounceTimeout: number | null = null;
    private isAdjustmentQueued = false;
    private isResetting = false;

    constructor(plugin: AutoFitTabsPlugin) {
        this.plugin = plugin;
    }

    initialize(): void {
        this.setupMeasureElement();
        this.registerEventHandlers();
        
        // Initial adjustment to get tabs sized correctly
        setTimeout(() => {
            this.queueHeaderAdjustment();
            this.setupMutationObserver();
            this.setupIconStabilizationObserver();
        }, 300);
    }

    cleanup(): void {
        this.tabWidthCache.clear();
        if (this.observer) this.observer.disconnect();
        if (this.iconObserver) this.iconObserver.disconnect();
        if (this.measureElement) this.measureElement.remove();

        // Reset the tab containers to default style (only main editor area)
        const tabContainers = document.querySelectorAll('.workspace-split.mod-vertical.mod-root .workspace-tab-header-container-inner');
        tabContainers.forEach(container => {
            if (container instanceof HTMLElement) {
                container.style.overflowX = '';
                container.style.overflowY = '';
                container.scrollLeft = 0;
            }
        });

        const headers = this.getAllHeaders();
        headers.forEach(header => {
            header.classList.add('autofit-cleanup');
            header.classList.remove('autofit-tab');
            header.classList.remove('autofit-max-width');
            header.style.removeProperty('--header-width');
            
            setTimeout(() => {
                header.classList.remove('autofit-cleanup');
            }, this.plugin.settings.transitionDuration);
        });
    }

    private setupMeasureElement(): void {
        this.measureElement = document.createElement('span');
        this.measureElement.className = 'autofit-tab-measure';
        document.body.appendChild(this.measureElement);
    }

    private setupMutationObserver(): void {
        // Explicitly filter for only the main content area tabs
        const tabContainers = document.querySelectorAll('.workspace-split.mod-vertical.mod-root .workspace-tab-header-container');
        // Skip any observation if we didn't find any matching containers
        if (!tabContainers || tabContainers.length === 0) {
            // No workspace tabs found in main content area
            return;
        }
        
        this.observer = new MutationObserver((mutations) => {
            // Only trigger on relevant tab changes, not every DOM change
            for (const mutation of mutations) {
                // Only care about specific tab-related changes
                if (mutation.target && mutation.target instanceof Element) {
                    // ONLY target tabs in the main editor area
                    if (!mutation.target.closest('.workspace-split.mod-vertical.mod-root')) {
                        continue; // Skip this mutation
                    }
                    // Only check for main editor area tabs (not sidedock/left pane)
                    const isTabElement = (
                        (mutation.target.closest('.workspace-split.mod-vertical.mod-root .workspace-tab-header')) ||
                        (mutation.target.classList.contains('workspace-tab-header-inner-title') && 
                         mutation.target.closest('.workspace-split.mod-vertical.mod-root'))
                    );
                    
                    if (isTabElement) {
                        this.queueHeaderAdjustment();
                        return;
                    }
                    
                    // Check for theme changes
                    if (mutation.target === document.body && 
                        mutation.type === 'attributes' && 
                        mutation.attributeName === 'class') {
                        this.tabWidthCache.clear();
                        this.queueHeaderAdjustment();
                        return;
                    }
                }
            }
        });
        
        // Only observe main editor tab containers for changes
        document.querySelectorAll('.workspace-split.mod-vertical.mod-root .workspace-tab-header-container').forEach(container => {
            if (this.observer) {
                this.observer.observe(container, {
                    childList: true,
                    subtree: true,
                    attributes: false,
                    characterData: true
                });
            }
        });
        
        // Observe theme changes
        if (this.observer) {
            this.observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    private setupIconStabilizationObserver(): void {
        this.iconObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' &&
                    mutation.target instanceof Element &&
                    mutation.target.classList.contains('workspace-tab-header-inner-icon')) {
                    
                    // Prevent multiple icon changes within the transition duration
                    const parentTab = mutation.target.closest('.workspace-tab-header');
                    if (parentTab && !parentTab.classList.contains('is-active')) {
                        parentTab.classList.add('icon-transition');
                        setTimeout(() => {
                            if (parentTab) {
                                parentTab.classList.remove('icon-transition');
                            }
                        }, this.plugin.settings.transitionDuration);
                    }
                }
            }
        });

        // Observe all tabs for icon changes
        document.querySelectorAll('.workspace-split.mod-vertical.mod-root').forEach(root => {
            if (this.iconObserver) {
                this.iconObserver.observe(root, {
                    childList: true,
                    subtree: true
                });
            }
        });
    }

    registerEventHandlers(): void {
        // Handle layout changes (like split resizing)
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                // Debounce to avoid excessive recalculations during resize
                this.debounceLayoutChange();
            })
        );

        // Handle file opens - important for changing tab content
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('file-open', this.handleFileOpen.bind(this))
        );
        
        // Register for rename events
        this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', () => {
                this.queueHeaderAdjustment();
            })
        );
        
        // Add click event listener for tab selection
        document.body.addEventListener('click', this.handleTabClick.bind(this));
        this.plugin.register(() => document.body.removeEventListener('click', this.handleTabClick.bind(this)));
    }

    private debounceLayoutChange(): void {
        if (this.debounceTimeout) {
            window.clearTimeout(this.debounceTimeout);
        }
        
        this.debounceTimeout = window.setTimeout(() => {
            this.queueHeaderAdjustment();
            this.debounceTimeout = null;
        }, 100);
    }

    private handleTabClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        const tabHeader = target?.closest('.workspace-split.mod-vertical.mod-root .workspace-tab-header');
        
        if (!tabHeader) {
            return;
        }
        if (tabHeader instanceof HTMLElement) {
            // Wait a moment for the active class to be applied
            setTimeout(() => {
                if (tabHeader.classList.contains('is-active')) {
                    this.scrollToActiveTab(tabHeader);
                }
            }, 50);
        }
    }

    private handleFileOpen(): void {
        const activeHeaders = document.querySelectorAll('.workspace-split.mod-vertical.mod-root .workspace-tab-header.is-active');
        activeHeaders.forEach(header => {
            if (header instanceof HTMLElement) {
                // Handle icon flickering issue specifically
                this.stabilizeIcon(header);
                
                setTimeout(() => {
                    if (!this.tabWidthCache.has(this.getHeaderKey(header))) {
                        this.queueHeaderAdjustment();
                    }
                    this.scrollToActiveTab(header);
                }, 50); // Shorter delay after stabilizing icon
            }
        });
    }

    private stabilizeIcon(header: HTMLElement): void {
        const iconElement = header.querySelector('.workspace-tab-header-inner-icon');
        if (iconElement) {
            // Add a class to prevent icon transitions
            iconElement.classList.add('stable-icon');
            
            // Store the current HTML content to prevent flickering
            const currentIconHTML = iconElement.innerHTML;
            
            // Create a MutationObserver to prevent unwanted icon changes
            const iconObserver = new MutationObserver(() => {
                // If icon is about to change during transition, force it to stay
                if (iconElement.innerHTML !== currentIconHTML) {
                    // Keep the original icon until transition completes
                    iconElement.innerHTML = currentIconHTML;
                }
            });
            
            // Observe only changes to the icon's content
            iconObserver.observe(iconElement, { childList: true, subtree: true });
            
            // Disconnect after the transition completes
            setTimeout(() => {
                iconObserver.disconnect();
                iconElement.classList.remove('stable-icon');
            }, this.plugin.settings.transitionDuration + 50);
        }
    }

    private preserveAllIcons(): void {
        const headers = this.getAllHeaders();
        headers.forEach(header => {
            const iconElement = header.querySelector('.workspace-tab-header-inner-icon');
            if (iconElement instanceof HTMLElement) {
                // Prevent any icon changes during transition
                iconElement.style.pointerEvents = 'none';
            }
        });
    }

    private scrollToActiveTab(activeTab: HTMLElement): void {
        // Only process tabs in the main editor area
        if (!activeTab.closest('.workspace-split.mod-vertical.mod-root')) {
            return;
        }
        
        const container = activeTab.closest('.workspace-tab-header-container-inner');
        if (container instanceof HTMLElement) {
            // Calculate the center position of the active tab
            const tabRect = activeTab.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Check if the tab is already visible in the viewport
            const tabLeft = activeTab.offsetLeft;
            const tabRight = tabLeft + tabRect.width;
            const containerLeft = container.scrollLeft;
            const containerRight = containerLeft + containerRect.width;
            
            // Only scroll if the tab is not fully visible
            if (tabLeft < containerLeft || tabRight > containerRight) {
                // Calculate smooth scroll position - centering the tab
                const targetScroll = (tabLeft + (tabRect.width / 2)) - (containerRect.width / 2);
                
                // Use smooth scrolling with a custom animation
                this.smoothScrollTo(container, container.scrollLeft, Math.max(0, targetScroll), 300);
            }
        }
    }

    private smoothScrollTo(element: HTMLElement, start: number, end: number, duration: number): void {
        const startTime = performance.now();
        
        // Easing function - easeInOutQuad for smoother motion
        const easeInOutQuad = (t: number): number => {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        };
        
        const animateScroll = (currentTime: number) => {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);
            const easedProgress = easeInOutQuad(progress);
            
            const scrollValue = start + (end - start) * easedProgress;
            element.scrollLeft = scrollValue;
            
            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            }
        };
        
        requestAnimationFrame(animateScroll);
    }

    queueHeaderAdjustment(): void {
        if (!this.isAdjustmentQueued) {
            this.isAdjustmentQueued = true;
            
            requestAnimationFrame(() => {
                this.adjustAllHeaders();
                this.isAdjustmentQueued = false;
            });
        }
    }

    getAllHeaders(): HTMLElement[] {
        // Only get headers in the main editor area
        return Array.from(document.querySelectorAll(
            '.workspace-split.mod-vertical.mod-root .workspace-tab-header'
        )) as HTMLElement[];
    }

    private getHeaderKey(header: HTMLElement): string {
        const titleElement = header.querySelector('.workspace-tab-header-inner-title');
        return titleElement?.textContent || '';
    }

    private measureTextWidth(text: string, element: Element): number {
        if (!this.measureElement) return 0;
        
        const styles = window.getComputedStyle(element);
        this.measureElement.style.font = styles.font;
        this.measureElement.style.letterSpacing = styles.letterSpacing;
        this.measureElement.style.textTransform = styles.textTransform;
        this.measureElement.style.fontWeight = styles.fontWeight;
        this.measureElement.textContent = text;
        
        // Add a small padding buffer to ensure text fits
        return Math.ceil(this.measureElement.offsetWidth) + 5;
    }

    private calculateHeaderWidth(header: HTMLElement): number {
        const titleElement = header.querySelector('.workspace-tab-header-inner-title');
        if (!titleElement) return this.plugin.settings.minWidth;

        const textWidth = this.measureTextWidth(
            titleElement.textContent || '', 
            titleElement
        );
        
        // Calculate width without maxWidth constraint
        const calculatedWidth = Math.ceil(Math.max(
            this.plugin.settings.leftPadding +
            this.plugin.settings.iconWidth +
            this.plugin.settings.iconRightMargin +
            textWidth +
            this.plugin.settings.closeButtonPadding +
            this.plugin.settings.closeButtonWidth,
            this.plugin.settings.minWidth
        ));
        
        // Apply maxWidth if it's enabled (non-zero)
        if (this.plugin.settings.maxWidth > 0) {
            return Math.min(calculatedWidth, this.plugin.settings.maxWidth);
        }
        
        return calculatedWidth;
    }

    adjustAllHeaders(): void {
        // Skip adjustment if currently resetting
        if (this.isResetting) return;
        
        // Only adjust headers that aren't currently loading icons
        const headers = this.getAllHeaders().filter(header => {
            const container = header.closest('.workspace-tab-header-container');
            const isVisible = container && window.getComputedStyle(container).display !== 'none';
            const isNotLoading = !header.classList.contains('icon-loading');
            return isVisible && isNotLoading;
        });
        
        const newCache = new Map<string, number>();
        let activeHeader: HTMLElement | null = null;

        headers.forEach(header => {
            const headerKey = this.getHeaderKey(header);
            
            // Lock the icon state during transitions
            const iconElement = header.querySelector('.workspace-tab-header-inner-icon');
            if (iconElement instanceof HTMLElement) {
                iconElement.style.pointerEvents = 'none';
                // Force hardware acceleration
                iconElement.style.transform = 'translateZ(0)';
            }
            
            // Only recalculate width if not in cache or tab is active
            let width = this.tabWidthCache.get(headerKey);
            if (width === undefined || header.classList.contains('is-active')) {
                width = this.calculateHeaderWidth(header);
            }
            
            header.classList.add('autofit-tab');
            header.style.setProperty('--header-width', `${width}px`);
            newCache.set(headerKey, width);
            
            // Apply maxWidth class if the setting is enabled
            if (this.plugin.settings.maxWidth > 0 && width >= this.plugin.settings.maxWidth) {
                header.classList.add('autofit-max-width');
                // Apply a slightly larger max-width to allow for more text visibility
                width = Math.min(width, this.plugin.settings.maxWidth + 20);
                header.style.setProperty('--header-width', `${width}px`);
            } else {
                header.classList.remove('autofit-max-width');
            }
            
            if (header.classList.contains('is-active')) {
                activeHeader = header;
            }
        });

        this.tabWidthCache = newCache;
        
        // Only scroll to active tab when needed
        if (activeHeader) {
            this.scrollToActiveTab(activeHeader);
        }
    }

    resetTabs(isMaxWidthChanged: boolean): void {
        // Set resetting flag to prevent concurrent adjustments
        this.isResetting = true;
        
        // Completely reset all affected tabs
        const headers = this.getAllHeaders();
        headers.forEach(header => {
            // Remove all custom classes and styling
            header.classList.remove('autofit-max-width');
            header.classList.remove('autofit-tab');
            header.classList.add('autofit-cleanup');
            header.style.removeProperty('--header-width');
        });
        
        // Clear cache and wait for cleanup
        this.tabWidthCache.clear();
        
        // Allow time for Obsidian's internal layout to reset
        setTimeout(() => {
            headers.forEach(header => {
                header.classList.remove('autofit-cleanup');
            });
            
            // Now re-apply our styling after a small delay
            setTimeout(() => {
                headers.forEach(header => {
                    header.classList.add('autofit-tab');
                });
                this.adjustAllHeaders();
                this.isResetting = false;
            }, 50);
        }, 100);
    }
}
