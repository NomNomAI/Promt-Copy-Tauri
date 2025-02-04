import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api";
import { writeText } from "@tauri-apps/api/clipboard";
import { Folder } from "lucide-react";
import { Theme, ThemeContext } from "./ThemeContext";
import themes from "./themes";
import Toast from "./components/Toast";
import TitleBar from "./components/TitleBar";
import CheckedFilesTab from "./components/CheckedFilesTab";
import FileSystemWatcher from "./components/FileSystemWatcher";
import FileTreeItem from "./components/FileTreeItem";
import { saveToHistory } from "./components/FolderHistory";
import { emit } from '@tauri-apps/api/event';
import { getAll } from '@tauri-apps/api/window';
import { markHistorySuccess } from './components/FolderHistory';
import { TabBar } from "./components/TabBar";
import type { TabData } from "./components/TabBar";
const App = () => {
    const [activeView, setActiveView] = useState<'files' | 'checked'>('files');
    const [theme, setTheme] = useState<Theme>('solarized');
    const themeColors = themes[theme].colors;
    const [showToast, setShowToast] = useState(false);
    const [isSelectingFolder, setIsSelectingFolder] = useState(false);
    const [showToastSuccess, setShowToastSuccess] = useState(false);
    const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

    interface FileInfo {
    name: string;
    path: string;
    is_directory: boolean;
    children?: FileInfo[];
    displayPath?: string;
}

    useEffect(() => {
        const syncTheme = async () => {
            try {
                await emit('theme-update', { theme });
            } catch (error) {
                console.error('Error syncing theme:', error);
            }
        };

        syncTheme();
    }, [theme]);
    
    // Tab Management
    const [tabs, setTabs] = useState<TabData[]>([{
        id: '1',
        promptInput: '',
        addScriptFix: false,
        checkedFiles: new Set(),
        expandedFolders: new Set(),
        files: [],
        filteredFiles: [],
        watchedPath: null,
        searchQuery: '',
        lastCopiedEntry: null 
    }]);
    const [activeTabId, setActiveTabId] = useState('1');
    
    const activeTab = tabs.find(tab => tab.id === activeTabId)!;
    
    const updateActiveTab = (updates: Partial<TabData>) => {
        setTabs(prevTabs => prevTabs.map(tab =>
            tab.id === activeTabId ? { ...tab, ...updates } : tab
        ));
    };
    const adjustTextareaHeight = (textarea: HTMLTextAreaElement) => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };
    useEffect(() => {
        const debounceTimeout = setTimeout(() => {
            if (!activeTab) return;

            const findMatchingFiles = (files: FileInfo[], parentPath: string = ''): FileInfo[] => {
                if (!activeTab.searchQuery.trim()) {
                    const sortFilesWithFoldersFirst = (items: FileInfo[]): FileInfo[] => {
                        return items.sort((a, b) => {
                            if (a.is_directory === b.is_directory) {
                                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                            }
                            return a.is_directory ? -1 : 1;
                        });
                    };
                    return sortFilesWithFoldersFirst(files);
                }

                let matches: FileInfo[] = [];
                for (const file of files) {
                    const currentPath = parentPath ? `${parentPath}/${file.name}` : file.name;

                    if (file.is_directory && file.children) {
                        matches = [...matches, ...findMatchingFiles(file.children, currentPath)];
                    } else if (!file.is_directory && file.name.toLowerCase().includes(activeTab.searchQuery.toLowerCase())) {
                        matches.push({
                            ...file,
                            displayPath: currentPath
                        });
                    }
                }

                return matches;
            };

            updateActiveTab({
                filteredFiles: findMatchingFiles(activeTab.files)
            });
        }, 300);

        return () => clearTimeout(debounceTimeout);
    }, [activeTab?.searchQuery, activeTab?.files]);

    const selectFolder = async () => {
        if (isSelectingFolder) return;

        try {
            setIsSelectingFolder(true);
            const selected = await invoke<string>('select_folder');
            if (selected) {
                // Stop watching previous directory if any
                if (activeTab.watchedPath) {
                    await invoke('stop_watching');
                }

                // Set up watching the new directory
                await invoke('watch_directory', { path: selected });

                // Load initial files
                const fileList = await invoke<FileInfo[]>('list_files', {
                    path: selected,
                    depth: 1
                });

                updateActiveTab({
                    watchedPath: selected,
                    files: fileList,
                    filteredFiles: fileList,
                    checkedFiles: new Set(),
                    expandedFolders: new Set(),
                    searchQuery: ''
                });
            }
        } catch (err) {
            console.error('Failed to select folder:', err);
        } finally {
            setIsSelectingFolder(false);
        }
    };

    const handleAddTab = () => {
        const newTabId = (Math.max(...tabs.map(t => parseInt(t.id))) + 1).toString();
        setTabs(prev => [...prev, {
            id: newTabId,
            promptInput: '',
            addScriptFix: false,
            checkedFiles: new Set(),
            expandedFolders: new Set(),
            files: [],
            filteredFiles: [],
            watchedPath: null,
            searchQuery: '',
            lastCopiedEntry: null // Add this line
        }]);
        setActiveTabId(newTabId);
    };

    const handleCloseTab = async (tabId: string) => {
        const tab = tabs.find(t => t.id === tabId);
        if (tab?.watchedPath) {
            await invoke('stop_watching');
        }
        
        setTabs(prev => prev.filter(t => t.id !== tabId));
        if (activeTabId === tabId) {
            setActiveTabId(tabs[0].id);
        }
    };

    const copyToClipboard = async () => {
        try {
            const selectedFilesContent = await Promise.all(
                Array.from(activeTab.checkedFiles).map(async (filePath) => {
                    try {
                        const content = await invoke<string>('read_file', { path: filePath });
                        const relativePath = activeTab.watchedPath
                            ? filePath.replace(activeTab.watchedPath, '').replace(/^[/\\]/, '\\')
                            : filePath;
                        return `Filename: ${relativePath}\nContents:\n${content}`;
                    } catch (error) {
                        console.error(`Error reading file ${filePath}:`, error);
                        return `Filename: ${filePath}\nError: Could not read file`;
                    }
                })
            );

            let clipboardText = '';
            if (activeTab.promptInput.trim()) {
                clipboardText += `Prompt: ${activeTab.promptInput}\n\n`;
            }

            clipboardText += selectedFilesContent.join('\n\n');

            if (activeTab.addScriptFix) {
                clipboardText += '\nsend full script with fix';
            }

            // Save to history and get the result
            const historyResult = await saveToHistory(
                activeTab.promptInput,
                activeTab.checkedFiles,
                activeTab.addScriptFix
            );

            await writeText(clipboardText);
            setShowToast(true);

            // Update the last copied entry for the active tab
            setTabs(prevTabs => prevTabs.map(tab =>
                tab.id === activeTabId
                    ? {
                        ...tab, lastCopiedEntry: {
                            path: historyResult.path,
                            timestamp: historyResult.timestamp
                        }
                    }
                    : tab
            ));
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    
    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {/* Main App Container */}
            <div
                data-theme={theme}
                style={{
                    backgroundColor: themeColors.background,
                    color: themeColors.text,
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',

                    
                }}
            >
                <TitleBar />
                <FileSystemWatcher
                    rootPath={activeTab.watchedPath}
                    onFileChange={(newFiles) => {
                        updateActiveTab({
                            files: newFiles,
                            filteredFiles: newFiles
                        });
                    }}
                />
                <TabBar
                    tabs={tabs}
                    activeTabId={activeTabId}
                    onTabChange={setActiveTabId}
                    onAddTab={handleAddTab}
                    onCloseTab={handleCloseTab}
                    themeColors={themeColors}
                />

                <div className="flex-1 overflow-hidden p-1.5 flex flex-col min-h-0">
                    <div className="space-y-1.5 flex flex-col h-full">
                        {activeTab.files.length > 0 && (
                            <>
                                <div className="flex-none relative">
                                    <textarea
                                        ref={promptTextareaRef}
                                        value={activeTab.promptInput}
                                        onChange={(e) => {
                                            updateActiveTab({ promptInput: e.target.value });
                                            adjustTextareaHeight(e.target);
                                        }}
                                        placeholder="Enter your prompt here..."
                                        style={{
                                            backgroundColor: themeColors.inputBg,
                                            borderColor: themeColors.border,
                                            color: themeColors.text,
                                            resize: 'vertical',
                                            minHeight: '38px',
                                            maxHeight: '300px'
                                        }}
                                        className="w-full p-2 border rounded pr-24"
                                    />
                                    {activeTab.lastCopiedEntry && (
                                        <button
                                            onClick={async () => {
                                                if (!activeTab.lastCopiedEntry?.path) return;
                                                try {
                                                    await markHistorySuccess(activeTab.lastCopiedEntry.path);
                                                    setTabs(prevTabs => prevTabs.map(tab =>
                                                        tab.id === activeTabId
                                                            ? { ...tab, lastCopiedEntry: null, promptInput: '' }  // Clear prompt input for this tab
                                                            : tab
                                                    ));
                                                    setShowToastSuccess(true);
                                                    setShowToast(true);

                                                    // Refresh calendar if it exists
                                                    const windows = await getAll();
                                                    const calendar = windows.find(w => w.label === 'calendar');
                                                    if (calendar) {
                                                        await calendar.emit('refresh-history');
                                                    }
                                                } catch (error) {
                                                    console.error('Failed to mark as success:', error);
                                                }
                                            }}
                                            style={{
                                                backgroundColor: themeColors.highlight,
                                                color: themeColors.buttonText
                                            }}
                                            className="absolute right-2 top-2 px-3 py-1 rounded text-sm hover:opacity-80 transition-opacity"
                                            title={`Mark ${activeTab.lastCopiedEntry.timestamp} copy as success`}
                                        >
                                            Success
                                        </button>
                                    )}
                                </div>

                                <div className="flex-none">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={activeTab.addScriptFix}
                                            onChange={(e) => updateActiveTab({ addScriptFix: e.target.checked })}
                                            className="mr-2"
                                            style={{
                                                accentColor: themeColors.highlight
                                            }}
                                        />
                                        <span>Add 'send full script with fix' to prompt</span>
                                    </label>
                                </div>

                                <div className="flex-none">
                                    <input
                                        type="text"
                                        value={activeTab.searchQuery}
                                        onChange={(e) => updateActiveTab({ searchQuery: e.target.value })}
                                        placeholder="Search files"
                                        style={{
                                            backgroundColor: themeColors.inputBg,
                                            borderColor: themeColors.border,
                                            color: themeColors.text
                                        }}
                                        className="w-full p-2 border rounded"
                                    />
                                </div>

                                <div className="flex-none mb-4">
                                    <div className="flex border-b" style={{ borderColor: themeColors.border }}>
                                        <button
                                            onClick={() => setActiveView('files')}
                                            className={`px-4 py-2 ${activeView === 'files' ? 'border-b-2' : ''}`}
                                            style={{
                                                borderColor: activeView === 'files' ? themeColors.highlight : 'transparent',
                                                color: activeView === 'files' ? themeColors.highlight : themeColors.text
                                            }}
                                        >
                                            Files
                                        </button>
                                        <button
                                            onClick={() => setActiveView('checked')}
                                            className={`px-4 py-2 ${activeView === 'checked' ? 'border-b-2' : ''} flex items-center`}
                                            style={{
                                                borderColor: activeView === 'checked' ? themeColors.highlight : 'transparent',
                                                color: activeView === 'checked' ? themeColors.highlight : themeColors.text
                                            }}
                                        >
                                            Checked Files
                                            {activeTab.checkedFiles.size > 0 && (
                                                <span
                                                    className="ml-2 px-2 py-0.5 text-xs rounded-full"
                                                    style={{
                                                        backgroundColor: themeColors.highlight,
                                                        color: themeColors.buttonText
                                                    }}
                                                >
                                                    {activeTab.checkedFiles.size}
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {!activeTab.files.length ? (
                            <div className="flex-1 flex items-center justify-center">
                                <button
                                    onClick={selectFolder}
                                    disabled={isSelectingFolder}
                                    className="text-center opacity-70 hover:opacity-100 transition-all transform hover:scale-105 p-8 rounded-lg"
                                    style={{
                                        color: themeColors.text,
                                        backgroundColor: isSelectingFolder ? 'transparent' : themeColors.treeHover
                                    }}
                                >
                                    <Folder className="w-16 h-16 mx-auto mb-4" style={{ color: themeColors.text }} />
                                    <p className="text-lg">{isSelectingFolder ? 'Selecting...' : 'Select a folder to get started'}</p>
                                </button>
                            </div>
                        ) : (
                            <div
                                className="flex-1 border rounded p-2 overflow-y-auto min-h-0 h-[500px]"
                                style={{
                                    borderColor: themeColors.border,
                                    backgroundColor: themeColors.inputBg
                                }}
                            >
                                {activeView === 'checked' ? (
                                    <CheckedFilesTab
                                        checkedFiles={activeTab.checkedFiles}
                                        onRemoveFile={(path) => {
                                            const newChecked = new Set(activeTab.checkedFiles);
                                            newChecked.delete(path);
                                            updateActiveTab({ checkedFiles: newChecked });
                                        }}
                                        themeColors={themeColors}
                                    />
                                ) : (
                                    activeTab.filteredFiles.map((file) => (
                                        <FileTreeItem
                                            key={file.path}
                                            file={file}
                                            checkedFiles={activeTab.checkedFiles}
                                            setCheckedFiles={(newChecked) => updateActiveTab({ checkedFiles: newChecked })}
                                            expandedFolders={activeTab.expandedFolders}
                                            setExpandedFolders={(newExpanded) => updateActiveTab({ expandedFolders: newExpanded })}
                                            themeColors={themeColors}
                                            onExpandFolder={async (path) => {
                                                try {
                                                    const children = await invoke<FileInfo[]>('list_files', {
                                                        path,
                                                        depth: 1
                                                    });

                                                    setTabs(prevTabs =>
                                                        prevTabs.map(tab => {
                                                            if (tab.id === activeTabId) {
                                                                const updateChildren = (files: FileInfo[]): FileInfo[] => {
                                                                    return files.map(file => {
                                                                        if (file.path === path) {
                                                                            return { ...file, children };
                                                                        } else if (file.is_directory && file.children) {
                                                                            return { ...file, children: updateChildren(file.children) };
                                                                        }
                                                                        return file;
                                                                    });
                                                                };
                                                                return {
                                                                    ...tab,
                                                                    files: updateChildren(tab.files)
                                                                };
                                                            }
                                                            return tab;
                                                        })
                                                    );
                                                } catch (err) {
                                                    console.error('Failed to load folder contents:', err);
                                                }
                                            }}
                                            loadingFolders={new Set()}
                                            level={0}
                                            searchQuery={activeTab.searchQuery}
                                        />
                                    ))
                                )}
                            </div>
                        )}

                        <div className="flex-none flex justify-center gap-4">
                            {activeTab.files.length > 0 && (
                                <>
                                    <button
                                        onClick={selectFolder}
                                        disabled={isSelectingFolder}
                                        style={{
                                            backgroundColor: themeColors.button,
                                            color: themeColors.buttonText,
                                            opacity: isSelectingFolder ? 0.7 : 1
                                        }}
                                        className="px-6 py-3 rounded hover:opacity-90 flex items-center"
                                    >
                                        <Folder className="w-4 h-4 mr-2" />
                                        {isSelectingFolder ? 'Selecting...' : 'Select Folder'}
                                    </button>
                                    <button
                                        onClick={copyToClipboard}
                                        disabled={activeTab.checkedFiles.size === 0}
                                        style={{
                                            backgroundColor: themeColors.button,
                                            color: themeColors.buttonText,
                                            opacity: activeTab.checkedFiles.size === 0 ? 0.7 : 1
                                        }}
                                        className="px-6 py-3 rounded hover:opacity-90"
                                    >
                                        Copy
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

               
            <Toast
                message={showToastSuccess ? "Marked as success!" : "Copied to clipboard!"}
                type={showToastSuccess ? 'success' : 'copy'}
                visible={showToast}
                onHide={() => setShowToast(false)}
                themeColors={themeColors}
            />
        </ThemeContext.Provider>
    );
};

export default App;