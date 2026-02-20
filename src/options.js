const THE_MARVELLOUS_SUSPENDER_EXTENSION_ID = "noogafoofpebimajpfpamcfhoaifemoa";

// Save options to chrome.storage
function saveOptions() {
    var sortBy = document.getElementById('sortBy').value;
    var groupFrom = document.getElementById('groupFrom').value;
    var preserveOrderWithinGroups = document.getElementById('preserveOrderWithinGroups').checked;
    var groupSuspendedTabs = document.getElementById('groupSuspendedTabs').checked;
    var tabSuspenderExtensionId = document.getElementById('tabSuspenderExtensionId').value;
    var sortPinnedTabs = document.getElementById('sortPinnedTabs').checked;
    var dedupeTabs = document.getElementById('dedupeTabs').checked;

    // Auto-sort settings
    var autoSortEnabled = document.getElementById('autoSortEnabled').checked;
    var autoSortIntervalSeconds = parseInt(document.getElementById('autoSortIntervalSeconds').value);
    var autoSortOnTabCreate = document.getElementById('autoSortOnTabCreate').checked;
    var autoSortOnTabClose = document.getElementById('autoSortOnTabClose').checked;

    // Validate interval is in valid range
    if (isNaN(autoSortIntervalSeconds) || autoSortIntervalSeconds < 1) {
        autoSortIntervalSeconds = 1;
    } else if (autoSortIntervalSeconds > 3600) {
        autoSortIntervalSeconds = 3600;
    }

    chrome.storage.sync.set({
        sortBy: sortBy,
        groupFrom: groupFrom,
        preserveOrderWithinGroups: preserveOrderWithinGroups,
        groupSuspendedTabs: groupSuspendedTabs,
        tabSuspenderExtensionId: tabSuspenderExtensionId,
        sortPinnedTabs: sortPinnedTabs,
        dedupeTabs: dedupeTabs,
        autoSortEnabled: autoSortEnabled,
        autoSortIntervalSeconds: autoSortIntervalSeconds,
        autoSortOnTabCreate: autoSortOnTabCreate,
        autoSortOnTabClose: autoSortOnTabClose
    }, function () {
        document.getElementById('save').setAttribute("disabled", true);
        // Show status to let user know changes were saved
        $('#status').removeClass("invisible");
        $('#status').addClass("visible");
    });
}

// Restore options state from chrome.storage
function restoreOptions() {
    // Use default value and preserveOrderWithinGroups = false
    chrome.storage.sync.get({
        sortBy: 'url',
        groupFrom: 'leftToRight',
        preserveOrderWithinGroups: true,
        groupSuspendedTabs: false,
        tabSuspenderExtensionId: THE_MARVELLOUS_SUSPENDER_EXTENSION_ID,
        sortPinnedTabs: false,
        dedupeTabs: false,
        autoSortEnabled: false,
        autoSortIntervalSeconds: 300,
        autoSortOnTabCreate: true,
        autoSortOnTabClose: true
    }, function (items) {
        toggleTabGroupOptions(items.sortBy);
        document.getElementById('sortBy').value = items.sortBy;
        document.getElementById('groupFrom').value = items.groupFrom;
        document.getElementById('preserveOrderWithinGroups').checked = items.preserveOrderWithinGroups;
        document.getElementById('groupSuspendedTabs').checked = items.groupSuspendedTabs;
        document.getElementById('tabSuspenderExtensionId').value = items.tabSuspenderExtensionId;
        document.getElementById('sortPinnedTabs').checked = items.sortPinnedTabs;
        document.getElementById('dedupeTabs').checked = items.dedupeTabs;

        // Restore auto-sort settings
        document.getElementById('autoSortEnabled').checked = items.autoSortEnabled;
        document.getElementById('autoSortIntervalSeconds').value = items.autoSortIntervalSeconds;
        document.getElementById('autoSortOnTabCreate').checked = items.autoSortOnTabCreate;
        document.getElementById('autoSortOnTabClose').checked = items.autoSortOnTabClose;

        // Toggle dependent field states
        toggleAutoSortOptions(items.autoSortEnabled);
    });
}

function toggleSaveButton() {
    chrome.storage.sync.get({
        sortBy: 'url',
        groupFrom: 'leftToRight',
        preserveOrderWithinGroups: true,
        groupSuspendedTabs: false,
        tabSuspenderExtensionId: THE_MARVELLOUS_SUSPENDER_EXTENSION_ID,
        sortPinnedTabs: false,
        dedupeTabs: false,
        autoSortEnabled: false,
        autoSortIntervalSeconds: 300,
        autoSortOnTabCreate: true,
        autoSortOnTabClose: true
    }, function (items) {
        if (document.getElementById('sortBy').value != items.sortBy ||
            document.getElementById('groupFrom').value != items.groupFrom ||
            document.getElementById('preserveOrderWithinGroups').checked != items.preserveOrderWithinGroups ||
            document.getElementById('groupSuspendedTabs').checked != items.groupSuspendedTabs ||
            (document.getElementById('tabSuspenderExtensionId').value != items.tabSuspenderExtensionId && document.getElementById('tabSuspenderExtensionId').value != THE_MARVELLOUS_SUSPENDER_EXTENSION_ID ) ||
            document.getElementById('sortPinnedTabs').checked != items.sortPinnedTabs ||
            document.getElementById('dedupeTabs').checked != items.dedupeTabs ||
            document.getElementById('autoSortEnabled').checked != items.autoSortEnabled ||
            parseInt(document.getElementById('autoSortIntervalSeconds').value) != items.autoSortIntervalSeconds ||
            document.getElementById('autoSortOnTabCreate').checked != items.autoSortOnTabCreate ||
            document.getElementById('autoSortOnTabClose').checked != items.autoSortOnTabClose) {
            document.getElementById('save').removeAttribute("disabled");
            // Hide status to reflect that changes have not been saved
            $('#status').removeClass("visible");
            $('#status').addClass("invisible");
        } else {
            document.getElementById('save').setAttribute("disabled", true);
        }
    });
}

function toggleTabSuspenderExtensionId() {
    if (document.getElementById('groupSuspendedTabs').checked) {
        document.getElementById('tabSuspenderExtensionId').setAttribute("disabled", true);
    } else {
        document.getElementById('tabSuspenderExtensionId').removeAttribute("disabled");
    }
    toggleSaveButton();
}

function toggleTabGroupOptions(sortBy) {
    if (sortBy == "title" || sortBy == "url") {
        $('#groupFrom').prop('disabled', true);
        $('#preserveOrderWithinGroups').prop('disabled', true);
    } else {
        $('#groupFrom').prop('disabled', false);
        $('#preserveOrderWithinGroups').prop('disabled', false);
    }
    toggleSaveButton();
}

function toggleAutoSortOptions(autoSortEnabled) {
    if (autoSortEnabled) {
        document.getElementById('autoSortIntervalSeconds').removeAttribute("disabled");
        document.getElementById('autoSortOnTabCreate').removeAttribute("disabled");
        document.getElementById('autoSortOnTabClose').removeAttribute("disabled");
    } else {
        document.getElementById('autoSortIntervalSeconds').setAttribute("disabled", true);
        document.getElementById('autoSortOnTabCreate').setAttribute("disabled", true);
        document.getElementById('autoSortOnTabClose').setAttribute("disabled", true);
    }
    toggleSaveButton();
}

document.addEventListener('DOMContentLoaded', restoreOptions);
$("#settings-form").submit(function(e) {
    e.preventDefault();
});

document.getElementById('sortBy').addEventListener('change', function() {
    toggleTabGroupOptions(this.value);
});

document.getElementById('groupFrom').addEventListener('change', toggleSaveButton);
document.getElementById('preserveOrderWithinGroups').addEventListener('change', toggleSaveButton);
document.getElementById('groupSuspendedTabs').addEventListener('change', toggleTabSuspenderExtensionId);
document.getElementById('tabSuspenderExtensionId').addEventListener('input', toggleSaveButton);
document.getElementById('sortPinnedTabs').addEventListener('change', toggleSaveButton);
document.getElementById('dedupeTabs').addEventListener('change', toggleSaveButton);
document.getElementById('save').addEventListener('click', saveOptions);

// Auto-sort event listeners
document.getElementById('autoSortEnabled').addEventListener('change', function() {
    toggleAutoSortOptions(this.checked);
});
document.getElementById('autoSortIntervalSeconds').addEventListener('input', toggleSaveButton);
document.getElementById('autoSortOnTabCreate').addEventListener('change', toggleSaveButton);
document.getElementById('autoSortOnTabClose').addEventListener('change', toggleSaveButton);

$(document).ready(function() {
    toggleTabSuspenderExtensionId();
});