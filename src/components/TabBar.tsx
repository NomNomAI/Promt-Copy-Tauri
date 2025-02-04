import React from 'react';
import { Plus, X } from 'lucide-react';

/**
 * Represents a file or directory in the file system
 */
interface FileInfo {
    name: string;
    path: string;
    is_directory: boolean;
    children?: FileInfo[];
    displayPath?: string;
}

/**
 * Represents the state and data for a single tab
 */
interface TabData {
    id: string;
    promptInput: string;
    addScriptFix: boolean;
    checkedFiles: Set<string>;
    expandedFolders: Set<string>;
    files: FileInfo[];
    filteredFiles: FileInfo[];
    watchedPath: string | null;
    searchQuery: string;
    lastCopiedEntry: { path: string; timestamp: string } | null;
}

/**
 * Props for the TabBar component
 */
interface TabBarProps {
    tabs: TabData[];
    activeTabId: string;
    onTabChange: (tabId: string) => void;
    onAddTab: () => void;
    onCloseTab: (tabId: string) => void;
    themeColors: any;
}

export const TabBar: React.FC<TabBarProps> = ({
    tabs,
    activeTabId,
    onTabChange,
    onAddTab,
    onCloseTab,
    themeColors,
}) => {
    return (
        <div
            className="flex items-center gap-1 border-b overflow-x-auto"
            style={{ borderColor: themeColors.border }}
        >
            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-t cursor-pointer ${activeTabId === tab.id ? 'border-b-2' : ''
                        }`}
                    style={{
                        backgroundColor: activeTabId === tab.id ? themeColors.treeHover : 'transparent',
                        borderColor: activeTabId === tab.id ? themeColors.highlight : 'transparent',
                        color: activeTabId === tab.id ? themeColors.highlight : themeColors.text,
                    }}
                    onClick={() => onTabChange(tab.id)}
                >
                    <span className="text-sm whitespace-nowrap">
                        {tab.watchedPath
                            ? tab.watchedPath.split(/[/\\]/).pop()
                            : 'New Tab'
                        }
                    </span>
                    {tabs.length > 1 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onCloseTab(tab.id);
                            }}
                            className="hover:opacity-80"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            ))}
            <button
                onClick={onAddTab}
                className="p-2 hover:opacity-80"
                style={{ color: themeColors.text }}
            >
                <Plus className="w-4 h-4" />
            </button>
        </div>
    );
};

// Export the interfaces so they can be used by other components
export type { TabData, FileInfo };