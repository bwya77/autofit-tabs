import { TAbstractFile } from 'obsidian';
import AutoFitTabsPlugin from './main';

export class TabManager {
    private plugin: AutoFitTabsPlugin;
    private tabWidthCache: Map<string, number> = new Map();
    private observer: MutationObserver | null = null;
    private iconObserver: MutationObserver | null = null;
    private measureElement: HTMLSpanElement | null = null;
    private debounceTimeout: number | null = null;
    private scrollCheckInterval: number | null = null;
    private isAdjustmentQueued = false;
    private isResetting = false;
    private closeInProgress = false;

    constructor(plugin: AutoFitTabsPlugin) {
        this.plugin = plugin;
    }

    initialize(): void {
        this.setupMeasureElement();
        this.registerEventHandlers();
        
        // Use requestAnimationFrame for initial setup to ensure DOM is ready
        requestAnimationFrame(() => {
            // Pre-calculate all tab widths in a single batch
            this.preCalculateAllTabWidths();
            this.setupMutationObserver();
            this.setupIconStabilizationObserver();
            this.setupScrollVisibilityCheck();
            // Now apply the adjustments
            this.queueHeaderAdjustment();
        });
    }
    
    private preCalculateAllTabWidths(): void {
        const headers = this.getAllHeaders();
        headers.forEach(header => {
            const headerKey = this.getHeaderKey(header);
            if (!this.tabWidthCache.has(headerKey)) {
                const width = this.calculateHeaderWidth(header);
                this.tabWidthCache.set(headerKey, width);
            }
        });
    }

    cleanup(): void {
        this.tabWidthCache.clear();
        if (this.observer) this.observer.disconnect();
        if (this.iconObserver) this.iconObserver.disconnect();
        if (this.measureElement) this.measureElement.remove();
        if (this.scrollCheckInterval) window.clearInterval(this.scrollCheckInterval);

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
            header.classList.remove('out-of-view');
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
            let tabWasRemoved = false;

            // Only trigger on relevant tab changes, not every DOM change
            for (const mutation of mutations) {
                // Check if a tab was removed (for close animation)
                if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                    for (const node of Array.from(mutation.removedNodes)) {
                        if (node instanceof HTMLElement &&
                            node.classList.contains('workspace-tab-header')) {
                            tabWasRemoved = true;
                            break;
                        }
                    }
                }

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
                        // Don't recalculate when a tab was just removed - remaining tabs keep their widths
                        if (!tabWasRemoved) {
                            this.queueHeaderAdjustment();
                        }
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

            // When a tab is removed, we don't need to recalculate remaining tabs
            // They keep their widths and just reposition via flexbox
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

    /**
     * Sets up a periodic check for tab visibility based on scroll position
     * This ensures tabs that are out of view don't interfere with UI interactions
     */
    private setupScrollVisibilityCheck(): void {
        // Check initially
        this.updateTabsVisibility();
        
        // Set up periodic checks for tab visibility during scrolling
        document.querySelectorAll('.workspace-split.mod-vertical.mod-root .workspace-tab-header-container-inner')
            .forEach(container => {
                if (container instanceof HTMLElement) {
                    // Listen for scroll events on container to update visibility
                    container.addEventListener('scroll', () => {
                        this.updateTabsVisibility();
                    }, { passive: true });
                }
            });
        
        // Also check periodically to catch any missed updates
        this.scrollCheckInterval = window.setInterval(() => {
            this.updateTabsVisibility();
        }, 1000);
    }

    registerEventHandlers(): void {
        // Handle layout changes (like split resizing)
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                // Debounce to avoid excessive recalculations during resize
                this.debounceLayoutChange();
                // Also update tab visibility after layout changes
                setTimeout(() => this.updateTabsVisibility(), 300);
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

        // Add click event listener for close button to handle closing animation
        document.body.addEventListener('click', this.handleCloseClick.bind(this), true);
        this.plugin.register(() => document.body.removeEventListener('click', this.handleCloseClick.bind(this), true));

        // Also handle middle-click on tabs (common way to close tabs)
        document.body.addEventListener('auxclick', this.handleMiddleClick.bind(this), true);
        this.plugin.register(() => document.body.removeEventListener('auxclick', this.handleMiddleClick.bind(this), true));

        // Handle keyboard shortcuts for closing tabs (Ctrl+W, Cmd+W)
        document.addEventListener('keydown', this.handleKeyDown.bind(this), true);
        this.plugin.register(() => document.removeEventListener('keydown', this.handleKeyDown.bind(this), true));
        
        // Handle window resize events to update tab visibility
        window.addEventListener('resize', () => {
            this.updateTabsVisibility();
        }, { passive: true });
        this.plugin.register(() => window.removeEventListener('resize', () => this.updateTabsVisibility()));
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

    /**
     * Handles click on close button - intercepts, animates, then closes via API
     */
    private handleCloseClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!target) return;

        // Check if clicking on a close button in main editor area
        const closeButton = target.closest('.workspace-tab-header-inner-close-button');
        if (!closeButton) return;

        const tabHeader = closeButton.closest('.workspace-split.mod-vertical.mod-root .workspace-tab-header') as HTMLElement;
        if (!tabHeader) return;

        // Prevent Obsidian's close handler from running
        event.stopPropagation();
        event.preventDefault();

        this.initiateClose(tabHeader);
    }

    /**
     * Handles middle-click on tabs to start the closing animation
     */
    private handleMiddleClick(event: MouseEvent): void {
        // Middle click is button 1
        if (event.button !== 1) return;

        const target = event.target as HTMLElement;
        const tabHeader = target?.closest('.workspace-split.mod-vertical.mod-root .workspace-tab-header') as HTMLElement;
        if (!tabHeader) return;

        // Prevent default middle-click behavior
        event.stopPropagation();
        event.preventDefault();

        this.initiateClose(tabHeader);
    }

    /**
     * Handles keyboard shortcuts for closing tabs (Ctrl+W, Cmd+W)
     */
    private handleKeyDown(event: KeyboardEvent): void {
        // Check for Ctrl+W (Windows/Linux) or Cmd+W (Mac)
        if ((event.ctrlKey || event.metaKey) && event.key === 'w') {
            const activeTab = document.querySelector('.workspace-split.mod-vertical.mod-root .workspace-tab-header.is-active') as HTMLElement;
            if (!activeTab) return;

            // Prevent default close behavior
            event.stopPropagation();
            event.preventDefault();

            this.initiateClose(activeTab);
        }
    }

    /**
     * Closes a leaf by matching its tab header element
     */
    private closeLeafByTabHeader(tabHeader: HTMLElement): void {
        // Get all leaves
        const allLeaves: any[] = [];
        this.plugin.app.workspace.iterateAllLeaves((leaf) => {
            allLeaves.push(leaf);
        });

        // Try to find the leaf by matching the tab element
        for (const leaf of allLeaves) {
            if (leaf.tabHeaderEl === tabHeader) {
                leaf.detach();
                return;
            }
        }

        // Fallback: if the tab is still marked as active, close the active leaf
        if (tabHeader.classList.contains('is-active')) {
            const activeLeaf = this.plugin.app.workspace.activeLeaf;
            if (activeLeaf) {
                activeLeaf.detach();
            }
        }
    }

    /**
     * Initiates the close sequence with animation
     */
    private initiateClose(tabHeader: HTMLElement): void {
        if (this.closeInProgress) return;
        this.closeInProgress = true;

        // Start the closing animation
        this.startClosingAnimation(tabHeader);

        // After animation, close the tab
        const duration = this.plugin.settings.transitionDuration;
        setTimeout(() => {
            this.closeLeafByTabHeader(tabHeader);
            // Keep the flag on longer to prevent any events from triggering recalc
            setTimeout(() => {
                this.closeInProgress = false;
            }, 300);
        }, duration);
    }

    /**
     * Starts the closing animation - shrinks the tab to 0
     */
    private startClosingAnimation(tabHeader: HTMLElement): void {
        if (this.isResetting) return;

        // Add closing class and shrink to 0
        tabHeader.classList.add('autofit-closing');
        tabHeader.style.setProperty('--header-width', '0px');
    }

    private handleFileOpen(): void {
        // Skip during close animation to prevent jitter
        if (this.closeInProgress) return;

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
            
            // After scrolling, update the visibility of tabs that may be out of view
            setTimeout(() => this.updateTabsVisibility(), this.plugin.settings.transitionDuration + 50);
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
        // Skip during close to prevent jitter
        if (this.closeInProgress) return;

        if (!this.isAdjustmentQueued) {
            this.isAdjustmentQueued = true;

            // Use a single requestAnimationFrame for batching
            requestAnimationFrame(() => {
                // Double-check we're not closing
                if (this.closeInProgress) {
                    this.isAdjustmentQueued = false;
                    return;
                }
                this.adjustAllHeaders();
                // updateTabsVisibility is now called inside adjustAllHeaders
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
        // When hideTabIcons is true or iconWidth is 0, don't reserve space for icons
        const iconSpaceNeeded = this.plugin.settings.hideTabIcons ? 0 :
            (this.plugin.settings.iconWidth > 0 ? this.plugin.settings.iconWidth : 0);
            
        const calculatedWidth = Math.ceil(Math.max(
            this.plugin.settings.leftPadding +
            iconSpaceNeeded +
            textWidth +
            this.plugin.settings.closeButtonLeftPadding +
            this.plugin.settings.closeButtonRightPadding,
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

        // Batch all DOM reads first to avoid layout thrashing
        const headerData = headers.map(header => {
            const headerKey = this.getHeaderKey(header);
            const isPinned = this.plugin.settings.ignorePinnedTabs ? 
                header.querySelector('.workspace-tab-header-status-icon.mod-pinned') : null;
            const isWebLink = this.plugin.settings.ignoreWebLinks ? 
                header.getAttribute('data-type') === 'webviewer' : false;
            const isActive = header.classList.contains('is-active');
            const cachedWidth = this.tabWidthCache.get(headerKey);
            const needsRecalc = cachedWidth === undefined || isActive;
            
            return {
                header,
                headerKey,
                isPinned: !!isPinned,
                isWebLink,
                isActive,
                cachedWidth,
                needsRecalc
            };
        });

        // Calculate widths for headers that need it
        headerData.forEach(data => {
            if (data.needsRecalc && !data.isPinned && !data.isWebLink) {
                data.cachedWidth = this.calculateHeaderWidth(data.header);
            }
        });

        // Now batch all DOM writes together
        requestAnimationFrame(() => {
            headerData.forEach(data => {
                const { header, headerKey, isPinned, isWebLink, isActive, cachedWidth } = data;
                
                if (isPinned || isWebLink) {
                    // Remove autofit classes and styles if they were previously applied
                    header.classList.remove('autofit-tab', 'autofit-max-width');
                    header.style.removeProperty('--header-width');
                    return;
                }
                
                const width = cachedWidth!;
                
                // Lock all child elements to prevent intermediate states
                const innerElements = header.querySelectorAll('.workspace-tab-header-inner, .workspace-tab-header-inner-icon, .workspace-tab-header-inner-title');
                innerElements.forEach(el => {
                    if (el instanceof HTMLElement) {
                        el.style.transition = 'none';
                    }
                });
                
                // Apply all changes at once
                header.classList.add('autofit-tab');
                header.style.setProperty('--header-width', `${width}px`);
                newCache.set(headerKey, width);
                
                // Apply maxWidth class if the setting is enabled
                if (this.plugin.settings.maxWidth > 0 && width >= this.plugin.settings.maxWidth) {
                    header.classList.add('autofit-max-width');
                    const adjustedWidth = Math.min(width, this.plugin.settings.maxWidth + 20);
                    header.style.setProperty('--header-width', `${adjustedWidth}px`);
                } else {
                    header.classList.remove('autofit-max-width');
                }
                
                if (isActive) {
                    activeHeader = header;
                }
                
                // Re-enable transitions after a brief delay
                setTimeout(() => {
                    innerElements.forEach(el => {
                        if (el instanceof HTMLElement) {
                            el.style.transition = '';
                        }
                    });
                }, 10);
            });

            this.tabWidthCache = newCache;
            
            // Only scroll to active tab when needed
            if (activeHeader) {
                this.scrollToActiveTab(activeHeader);
            } else {
                // Still update tab visibility even if no active tab
                this.updateTabsVisibility();
            }
        });
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
            header.classList.remove('out-of-view');
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
                this.updateTabsVisibility();
                this.isResetting = false;
            }, 50);
        }, 100);
    }
    
    /**
     * Updates the visibility state of tabs based on whether they're in the viewport
     * Tabs outside the viewport get the 'out-of-view' class which disables pointer events
     */
    private updateTabsVisibility(): void {
        if (this.isResetting) return;
        
        document.querySelectorAll('.workspace-split.mod-vertical.mod-root .workspace-tab-header-container-inner')
            .forEach(container => {
                if (container instanceof HTMLElement) {
                    const containerRect = container.getBoundingClientRect();
                    const containerLeft = containerRect.left;
                    const containerRight = containerRect.right;
                    
                    // Get all tabs within this container
                    const tabs = Array.from(container.querySelectorAll('.workspace-tab-header.autofit-tab'));
                    
                    tabs.forEach(tab => {
                        if (tab instanceof HTMLElement) {
                            const tabRect = tab.getBoundingClientRect();
                            
                            // A tab is out of view if it's completely to the left of the container
                            // or completely to the right of the container
                            const isOutOfView = (
                                tabRect.right < containerLeft || 
                                tabRect.left > containerRight
                            );
                            
                            // Apply or remove the class based on visibility
                            if (isOutOfView) {
                                tab.classList.add('out-of-view');
                            } else {
                                tab.classList.remove('out-of-view');
                            }
                        }
                    });
                }
            });
    }
}