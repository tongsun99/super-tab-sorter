# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Super Tab Sorter is a Chrome extension (Manifest v3) for customizable tab sorting and grouping. It's a feature-rich fork of Simple Tab Sorter that respects Chrome's native tab groups and provides advanced sorting strategies including custom domain-based ordering.

## Development Commands

### Testing the Extension
Load the unpacked extension in Chrome:
1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `src` directory

After making changes, click the reload button on the extension card at `chrome://extensions`.

### Packaging for Chrome Web Store
```bash
./package_for_web_store.sh
```
This script:
- Updates the version number in `src/manifest.json`
- Creates a zip file: `super-tab-sorter-v{VERSION}.zip`
- Requires `gsed` (GNU sed) on macOS: `brew install gnu-sed`

**Important**: Update the `VERSION` variable in `package_for_web_store.sh` before running.

## Architecture

### Component Interaction Flow

```
User clicks extension icon
         ↓
popup.js loaded → checks installation state
         ↓
Sends "click_event" message → background.js
         ↓
sortTabGroups() executes sorting logic
         ↓
Tabs rearranged in current window
```

### Key Components

**background.js** (Service Worker, 325 lines)
- Core sorting logic and Chrome API interactions
- Entry point: `sortTabGroups()` at line 54 orchestrates the entire sorting process
- Handles three sorting strategies: URL, Title, and Custom
- Main sorting functions: `sortByTitleOrUrl()` (115-241), `sortByCustom()` (244-335)
- Processes tab groups separately from ungrouped tabs
- Only sorts tabs in the currently focused window (prevents cross-window sorting)

**popup.js** (Extension Popup)
- Detects new installs/updates and shows appropriate modals
- Sends `click_event` message to trigger background.js sorting
- Auto-closes popup after sorting completes

**options.js** (Settings Page)
- Manages user preferences using `chrome.storage.sync`
- Settings sync across devices via Chrome sync
- Validates and toggles save button based on changes

### Sorting Strategies

**1. Sort By URL** (default)
- Implementation: `compareByUrlComponents()` in background.js:169-219
- Parses URLs using the PSL (Public Suffix List) library for accurate domain extraction
- Sorts hierarchically: domain → subdomain → pathname → search → hash
- Example: `google.com/search` before `mail.google.com/inbox`
- Handles complex TLDs like `.co.uk`, `.com.au` correctly via PSL

**2. Sort By Title**
- Implementation: `sortByTitleOrUrl()` with "title" mode in background.js:115-241
- Simple alphabetical sort using `localeCompare()`
- Respects browser locale for international characters
- Uses nested comparator: `_titleComparator()`

**3. Sort By Custom**
- Implementation: `sortByCustom()` in background.js:244-335
- Most complex strategy: groups tabs by domain in order of appearance
- Uses a `Map<hostname, position>` to track domain order as tabs are encountered
- Direction control: "Left to Right" (groups by first-seen order) or "Right to Left" (reverse)
- Optional: preserve original order within domain groups (via `preserveOrderWithinGroups`)
- Optional: group suspended tabs separately
- Key insight: Allows manual tab arrangement, then re-sort to maintain that arrangement while adding new tabs

### Tab Groups Handling

Tab groups are sorted alphabetically by title (background.js:90-112). Users can override this by prefixing group names with numbers (e.g., "1-Work", "2-Personal", "3-Research").

The sorting process:
1. Queries all tab groups in focused window
2. Sorts groups by title (number prefixes control order)
3. Moves each group and its tabs sequentially
4. **Critical**: Re-applies group membership after moving - moving tabs removes them from groups!

```javascript
// Move tabs to new position
await chrome.tabs.move(tabIds, { index: targetIndex });

// MUST re-assign to group (moving removes group membership!)
await chrome.tabs.group({ groupId: groupId, tabIds: tabIds });
```

### Tab Suspender Integration

Handles tabs suspended by "The Great Suspender" derivatives:

- Suspended tabs have URLs like: `chrome-extension://[ID]/suspended.html#uri=[original_url]`
- Function `isSuspended(tab)` detects suspended state
- Function `tabToUrl(tab, groupSuspended)` extracts original URL from suspension prefix
- Configurable via `tabSuspenderExtensionId` setting (default: "noogafoofpebimajpfpamcfhoaifemoa")
- Optional: group suspended tabs to the left during sorting

### Storage Schema

Settings stored in `chrome.storage.sync`:

```javascript
{
    sortBy: "url" | "title" | "custom",      // Sorting strategy
    groupFrom: "leftToRight" | "rightToLeft", // Custom sort direction
    preserveOrderWithinGroups: boolean,       // Custom sort sub-option
    groupSuspendedTabs: boolean,              // Separate suspended tabs
    tabSuspenderExtensionId: string,          // Extension ID for suspender
    sortPinnedTabs: boolean,                  // Include pinned in sort
    dedupeTabs: boolean,                      // Remove duplicate URLs
    installedVersion: string,                 // Version tracking
    newInstall: boolean,                      // First install flag
    newUpdate: boolean                        // Update flag
}
```

## Key Implementation Details

### URL Parsing Pattern
```javascript
// Extract URL from regular or suspended tabs (background.js:152-167)
function tabToUrl(tab, groupSuspended) {
    if (isSuspended(tab) && !groupSuspended) {
        // Extract original URL from suspension marker
        return tab.url.substring(SUSPENDED_PREFIX.length);
    }
    return tab.pendingUrl || tab.url;
}
```

This ensures suspended tabs sort by their original URL, not the suspender's `chrome-extension://` URL.

### Tab Deduplication
Uses a `Set<url>` to track seen URLs. When duplicates are found, they're closed via `chrome.tabs.remove()`. The set is cleared after each sort to prevent false positives across sorting operations.

### Window Isolation
Sorting only affects the currently focused window (`chrome.windows.getLastFocused()`). This prevents the bug where all windows were sorted simultaneously, which was a major user complaint during the manifest v3 migration.

## Important Notes

- **Manifest v3**: Uses service worker instead of persistent background page
- **Dependencies**: psl.min.js (Public Suffix List), jQuery 3.7.1 slim, Bootstrap 5
- **Permissions**: Requires `tabs`, `tabGroups`, and `storage` permissions
- **All code in src/**: The entire extension codebase lives in the `src/` directory
- **No build process**: This is vanilla JavaScript with no transpilation/bundling
- **Version updates**: Update version in both `package_for_web_store.sh` AND `src/manifest.json`

## Testing Considerations

**Note**: This project has no formal test framework. All testing is manual.

When testing changes:
- Test with tab groups (named and unnamed)
- Test with pinned tabs (both included and excluded)
- Test with suspended tabs if using a suspender extension
- Test the "sort all windows" behavior is disabled (only current window sorts)
- Test deduplication feature separately
- Test each sorting strategy (URL, Title, Custom)
- Test custom sort in both directions (left-to-right, right-to-left)
- Reload the extension at `chrome://extensions` after code changes
