// See https://publicsuffix.org and https://github.com/lupomontero/psl for psl library details
import './psl.min.js';

'use strict';

// Default to "The Marvellous Suspender" as the de facto The Great Suspender replacement
const THE_MARVELLOUS_SUSPENDER_EXTENSION_ID = "noogafoofpebimajpfpamcfhoaifemoa";

var TAB_SUSPENDER_EXTENSION_ID = "";
var SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
var SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;

// Auto-sort feature state management
var autoSortDebounceTimer = null;               // Debounce timer for tab events
const AUTO_SORT_DEBOUNCE_DELAY = 1000;          // 1 second debounce delay
const AUTO_SORT_ALARM_NAME = "autoSortTimer";   // Name for chrome.alarms
var isInitializing = true;                      // Initialization flag

// Extension icon onClick handler...
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type == "click_event") {
        sortTabGroups();
        sendResponse({ message: 'success' });
    }
})

// Auto-sort on tab creation
chrome.tabs.onCreated.addListener(function(tab) {
    chrome.storage.sync.get({
        autoSortEnabled: false,
        autoSortOnTabCreate: true
    }, function(settings) {
        if (settings.autoSortEnabled && settings.autoSortOnTabCreate && !isInitializing) {
            triggerAutoSortIfEnabled();
        }
    });
});

// Auto-sort on tab removal
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    chrome.storage.sync.get({
        autoSortEnabled: false,
        autoSortOnTabClose: true
    }, function(settings) {
        if (settings.autoSortEnabled && settings.autoSortOnTabClose && !isInitializing) {
            triggerAutoSortIfEnabled();
        }
    });
});

// Auto-sort on alarm (periodic sorting)
chrome.alarms.onAlarm.addListener(function(alarm) {
    if (alarm.name === AUTO_SORT_ALARM_NAME) {
        chrome.storage.sync.get({
            autoSortEnabled: false
        }, function(settings) {
            if (settings.autoSortEnabled) {
                sortTabGroups();
            }
        });
    }
});

// Listen for storage changes (settings updates from options page)
// Restarts alarms if auto-sort settings change
chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'sync') {
        const autoSortSettingsChanged = changes.autoSortEnabled ||
                                        changes.autoSortIntervalSeconds;
        if (autoSortSettingsChanged) {
            chrome.alarms.clear(AUTO_SORT_ALARM_NAME, function() {
                chrome.storage.sync.get({
                    autoSortEnabled: false,
                    autoSortIntervalSeconds: 300
                }, function(settings) {
                    if (settings.autoSortEnabled && settings.autoSortIntervalSeconds > 0) {
                        chrome.alarms.create(AUTO_SORT_ALARM_NAME, {
                            periodInMinutes: Math.ceil(settings.autoSortIntervalSeconds / 60)
                        });
                    }
                });
            });
        }
    }
});

// Return whether tab is currently suspended
function isSuspended(tab) {
    return tab.url.startsWith(SUSPENDED_PREFIX);
}

// One-time installation and v0.4.0 upgrade handlers...
chrome.runtime.onInstalled.addListener(function (details) {

    var thisVersion = chrome.runtime.getManifest().version;
    if (details.reason == "install") {
        chrome.storage.sync.set({
            installedVersion: thisVersion,
            newInstall: true,
            newUpdate: false
        }, function () {
            // Prompt for (optional) uninstall feedback so I can see if there's room for improvement...
            if (chrome.runtime.setUninstallURL) {
                var uninstallGoogleFormLink = 'https://docs.google.com/forms/d/e/1FAIpQLSe-r_WFNry_KZCwOjdMjDjiS8sEIWmmwY-3hbSmIYV393RLCA/viewform';
                chrome.runtime.setUninstallURL(uninstallGoogleFormLink);
            }
        });
    } else if (details.reason == "update") {
        chrome.storage.sync.set({
            installedVersion: thisVersion,
            newInstall: false,
            newUpdate: true
        }, function () { });
    }
})

// Initialize auto-sort feature when service worker starts
// Also handles service worker resumption after Chrome termination
function initializeAutoSort() {
    isInitializing = true;
    chrome.storage.sync.get({
        autoSortEnabled: false,
        autoSortIntervalSeconds: 300
    }, function(settings) {
        if (settings.autoSortEnabled && settings.autoSortIntervalSeconds > 0) {
            chrome.alarms.clear(AUTO_SORT_ALARM_NAME, function() {
                chrome.alarms.create(AUTO_SORT_ALARM_NAME, {
                    periodInMinutes: Math.ceil(settings.autoSortIntervalSeconds / 60)
                });
            });
        }
        isInitializing = false;
    });
}

// Debounced auto-sort for tab events (creation/close)
// Prevents excessive sorting when multiple tabs are opened/closed rapidly
function triggerAutoSortIfEnabled() {
    if (autoSortDebounceTimer !== null) {
        clearTimeout(autoSortDebounceTimer);
    }
    autoSortDebounceTimer = setTimeout(function() {
        chrome.storage.sync.get({
            autoSortEnabled: false
        }, function(settings) {
            if (settings.autoSortEnabled) {
                sortTabGroups();
            }
        });
        autoSortDebounceTimer = null;
    }, AUTO_SORT_DEBOUNCE_DELAY);
}

// Initialize auto-sort when service worker starts
initializeAutoSort();

// Separate windows must be sorted separately - this is to prevent undesired accidental sorting in other windows...
async function sortTabGroups() {

    let settings = await chrome.storage.sync.get({
        sortBy: "url",
        groupFrom: "leftToRight",
        preserveOrderWithinGroups: false,
        groupSuspendedTabs: false,
        tabSuspenderExtensionId: THE_MARVELLOUS_SUSPENDER_EXTENSION_ID,
        sortPinnedTabs: false,
        dedupeTabs: false
    });

    // I believe this was unnecessary in manifest v2, IIRC, and that the "default window" worked as expected though that's not the case in manifest v3.
    let currentWindow  = await chrome.windows.getLastFocused()

    let pinnedTabs = await chrome.tabs.query({
        windowId: currentWindow.id,
        pinned: true,
        currentWindow: true,
    })
    var groupOffset = pinnedTabs.length

    if (pinnedTabs.length > 0 && settings.sortPinnedTabs) {
        sortTabs(pinnedTabs, pinnedTabs[0].groupId, settings)
    }

    await chrome.tabGroups.query({ windowId: currentWindow.id }, function (tabGroups) {
        // You can prefix your tab group names with numeric values if you'd like to override the sort order...
        tabGroups.sort(function (a, b) {
            return b.title.localeCompare(a.title);
        });

        // Sort tab groups
        for (let i = 0; i < tabGroups.length; i++) {
            let groupId = tabGroups[i].id
            chrome.tabGroups.move(groupId, { index: groupOffset });
            chrome.tabs.query({
                windowId: currentWindow.id,
                groupId: groupId
            }, function(tabs) {
                groupOffset += tabs.length
                // Sort tabs tab group's tabs while we have a reference to them
                sortTabs(tabs, groupId, settings)
            })
        }
        // Sort ungrouped tabs
        chrome.tabs.query({
            windowId: currentWindow.id,
            pinned: false,
            groupId: -1
        }, function(tabs) {
            sortTabs(tabs, -1, settings)
        })
    })
}

async function sortTabs(tabs, groupId, settings) {
    if (tabs.length > 0) {
        TAB_SUSPENDER_EXTENSION_ID = settings.tabSuspenderExtensionId;
        SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
        SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;
        let firstTabIndex = tabs[0].index
        switch (settings.sortBy) {
            case "url":
            case "title":
                sortByTitleOrUrl(tabs, settings.sortBy, settings.groupSuspendedTabs, settings.sortPinnedTabs);
                break;
            case "custom":
                sortByCustom(tabs, settings.groupFrom, settings.groupSuspendedTabs, settings.preserveOrderWithinGroups, settings.sortPinnedTabs);
                break;
        }

        // Convert array of tabs to array of tab IDs, deduping tabs (in current window) if enabled in settings...
        var tabIds = []
        if (settings.dedupeTabs) {
            // Build a map of URL -> array of tabs with that URL
            var urlToTabs = new Map();
            tabs.forEach(tab => {
                var url = tabToUrl(tab).href;
                if (!urlToTabs.has(url)) {
                    urlToTabs.set(url, []);
                }
                urlToTabs.get(url).push(tab);
            });

            // For each URL, keep the tab with the largest ID (newest), remove others
            var tabsToRemove = [];
            urlToTabs.forEach(tabsWithSameUrl => {
                if (tabsWithSameUrl.length > 1) {
                    // Sort by ID ascending, so newest (largest ID) is last
                    tabsWithSameUrl.sort((a, b) => a.id - b.id);
                    // Remove all except the last one (newest)
                    for (let i = 0; i < tabsWithSameUrl.length - 1; i++) {
                        tabsToRemove.push(tabsWithSameUrl[i].id);
                    }
                }
            });

            // Remove old duplicate tabs
            if (tabsToRemove.length > 0) {
                chrome.tabs.remove(tabsToRemove);
            }

            // Build list of tab IDs to keep (excluding removed ones)
            var removedSet = new Set(tabsToRemove);
            tabIds = tabs.filter(tab => !removedSet.has(tab.id)).map(tab => tab.id);
        } else {
            tabIds = tabs.map(function(tab){ return tab.id; })
        }
        // Relocate tabs to their new positions...
        chrome.tabs.move(tabIds, { index: firstTabIndex });

        // Regroup tabs that were moved since moving them appears to remove them from the group...
        if (groupId > -1) {
            chrome.tabs.group({
                groupId: groupId,
                tabIds: tabIds
            })
        }
    }
}

// Returns the tab's suspended URL if 'groupSuspendedTabs' is set - otherwise, return's the current tab's URL or suspended tab's original URL
function tabToUrl(tab, groupSuspendedTabs) {
    if (groupSuspendedTabs) {
        return new URL(tab.url);
    } else {
        const suspendedSuffix = tab.url.slice(SUSPENDED_PREFIX_LEN);
        if (suspendedSuffix) {
            var params = new URLSearchParams(suspendedSuffix);
            for (let [param, val] of params) {
                if (param === 'uri') {
                    return new URL(val);
                }
            }
        }
        return new URL(tab.pendingUrl || tab.url);
    }
}

// Populate tab group ordering Map...
function updateTabGroupMap(tabGroupMap, tab, sortBy, groupSuspendedTabs) {
    if (sortBy == "title") {
        if (!tabGroupMap.has(tab.title)) tabGroupMap.set(tab.title, tabGroupMap.size);
    } else {
        // sortBy "url" and "custom" group tabs by URL().host...
        var urlParser = tabToUrl(tab, groupSuspendedTabs);
        var host = urlParser.host;

        if (!tabGroupMap.has(host)) {
            tabGroupMap.set(host, tabGroupMap.size)
        }
    }
}

// Sort by domain name, sub sort by hostname, path, query string, and hash (anchor)
function compareByUrlComponents(urlA, urlB) {
    // See https://publicsuffix.org and https://github.com/lupomontero/psl for psl library details
    var parsedA =  psl.parse(urlA.hostname)
    var keyA = parsedA.domain + parsedA.subdomain + urlA.pathname + urlA.search + urlA.hash;

    var parsedB =  psl.parse(urlB.hostname)
    var keyB = parsedB.domain + parsedB.subdomain + urlB.pathname + urlB.search + urlB.hash;

    return keyA.localeCompare(keyB);
}

// Group suspended tabs to left side if 'groupSuspendedTabs' is checked in settings
function sortByTitleOrUrl(tabs, sortBy, groupSuspendedTabs, sortPinnedTabs) {
    // Group suspended tabs to the left, using comparator for unsuspended tabs.
    tabs.sort(function (a, b) {

        if (sortBy == "title") {
            return _titleComparator(a, b, groupSuspendedTabs, sortPinnedTabs);
        } else {
            return _urlComparator(a, b, groupSuspendedTabs, sortPinnedTabs);
        }
    });

    // Shift suspended tabs left (if groupSuspendedTabs == true). Otherwise, sort by title in the browser's current locale.
    function _titleComparator(a, b, groupSuspendedTabs, sortPinnedTabs) {

        // Option to exclude pinned tabs in the sort action (excluded by default)
        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }
        return a.title.localeCompare(b.title);
    }

    // Shift suspended tabs left (if groupSuspendedTabs == true). Otherwise, sort by URL in the browser's current locale.
    function _urlComparator(a, b, groupSuspendedTabs, sortPinnedTabs) {

        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        // Shift suspended tabs left...
        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }

        var urlA = tabToUrl(a, groupSuspendedTabs);
        var urlB = tabToUrl(b, groupSuspendedTabs);

        return compareByUrlComponents(urlA, urlB);
    }
}

// Sort by URL as defined by the configured extension settings
function sortByCustom(tabs, groupFrom, groupSuspendedTabs, preserveOrderWithinGroups, sortPinnedTabs) {
    var tabGroupMap = new Map();
    var left = 0, suspendedTabCount = 0, right = tabs.length;

    // Group tabs from leftToRight or rightToLeft as configured in settings...
    if (groupFrom == "leftToRight") {
        // Ensures that suspended tabs will be shifted to the left side of browser if 'groupSuspendedTabs' is checked in settings
        if (groupSuspendedTabs) {
            tabGroupMap.set(TAB_SUSPENDER_EXTENSION_ID, 0);
        }
        while (left !== right) {
            if (isSuspended(tabs[left])) {
                suspendedTabCount += 1;
            }
            updateTabGroupMap(tabGroupMap, tabs[left], "custom", groupSuspendedTabs);
            left += 1;
        }
    } else {
        while (left !== right) {
            right -= 1;
            if (isSuspended(tabs[right])) {
                suspendedTabCount += 1;
            }
            updateTabGroupMap(tabGroupMap, tabs[right], "custom", groupSuspendedTabs);
        }
        // Ensures that suspended tabs will be shifted to the left side of browser if 'groupSuspendedTabs' is checked in settings
        if (groupSuspendedTabs) {
            tabGroupMap.set(TAB_SUSPENDER_EXTENSION_ID, tabGroupMap.size);
        }
    }

    tabs.sort(function (a, b) {
        return _customSortComparator(a, b, groupSuspendedTabs, sortPinnedTabs);
    });

    // Support independent subsorting of suspended tabs if 'groupSuspendedTabs' is checked in settings
    if (groupSuspendedTabs) {
        // Repopulate tabGroupMap, ignoring "groupSuspendedTabs" (so they're not all in the same bucket), to get the subsort right...
        tabGroupMap.clear();
        left = 0, right = suspendedTabCount;
        // Shift suspended tabs to far left of page if keeping them grouped...
        if (groupFrom == "leftToRight") {
            while (left !== right) {
                updateTabGroupMap(tabGroupMap, tabs[left], "custom", false);
                left += 1;
            }
        } else {
            while (left !== right) {
                right -= 1;
                updateTabGroupMap(tabGroupMap, tabs[right], "custom", false);
            }
        }

        var suspendedTabs = tabs.slice(0, suspendedTabCount).sort(function (a, b) { return _customSortComparator(a, b, false); });
        var postSorted = tabs.slice(suspendedTabCount);
        tabs.length = 0;
        tabs.push.apply(tabs, suspendedTabs.concat(postSorted));
    }

    function _customSortComparator(a, b, groupSuspendedTabs, sortPinnedTabs) {
        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        // Shift suspended tabs left...
        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }

        // Subsort by URL...
        let urlA = tabToUrl(a, groupSuspendedTabs);
        let urlB = tabToUrl(b, groupSuspendedTabs);

        var groupPosA = tabGroupMap.get(urlA.host);
        var groupPosB = tabGroupMap.get(urlB.host);

        if (groupFrom == "leftToRight") {
            if (groupPosA < groupPosB) return -1;
            if (groupPosA > groupPosB) return 1;
        } else {
            if (groupPosA < groupPosB) return 1;
            if (groupPosA > groupPosB) return -1;
        }

        // Subsort tabs within groups unless we're subsorting suspended tabs && 'preserveOrderWithinGroups' is specified in user options
        if (!groupSuspendedTabs && !preserveOrderWithinGroups) {
            return compareByUrlComponents(urlA, urlB);
        }
        return 0;
    }
}