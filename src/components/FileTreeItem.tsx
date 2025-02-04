import React, { useState, useEffect } from 'react';
import { Folder, File, ChevronRight, ChevronDown } from "lucide-react";
import { invoke } from "@tauri-apps/api";

interface FileInfo {
    name: string;
    path: string;
    is_directory: boolean;
    children?: FileInfo[];
    displayPath?: string;
}

interface FileTreeItemProps {
    file: FileInfo;
    checkedFiles: Set<string>;
    setCheckedFiles: (files: Set<string>) => void;
    expandedFolders: Set<string>;
    setExpandedFolders: (folders: Set<string>) => void;
    themeColors: any;
    onExpandFolder: (path: string) => Promise<void>;
    loadingFolders: Set<string>;
    level: number;
    searchQuery: string;
}

interface ContextMenuProps {
    x: number;
    y: number;
    file: FileInfo;
    onClose: () => void;
    themeColors: any;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, file, onClose, themeColors }) => {
    const handleOpenInExplorer = async () => {
        try {
            await invoke('open_in_explorer', { path: file.path });
        } catch (error) {
            console.error('Failed to open in explorer:', error);
        }
        onClose();
    };

    useEffect(() => {
        const handleClickOutside = () => onClose();
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [onClose]);

    return (
        <div
            className="fixed z-50 shadow-lg rounded"
            style={{
                left: x,
                top: y,
                backgroundColor: themeColors.inputBg,
                border: `1px solid ${themeColors.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="py-1">
                <button
                    className="w-full px-4 py-2 text-left hover:opacity-80 flex items-center gap-2"
                    onClick={handleOpenInExplorer}
                    style={{ color: themeColors.text }}
                >
                    <Folder className="w-4 h-4" />
                    Show in Explorer
                </button>
            </div>
        </div>
    );
};

const ITEMS_PER_PAGE = 50;
const MAX_DEPTH = 20;

const FileTreeItem: React.FC<FileTreeItemProps> = ({
    file,
    checkedFiles,
    setCheckedFiles,
    expandedFolders,
    setExpandedFolders,
    themeColors,
    onExpandFolder,
    loadingFolders,
    level,
    searchQuery
}) => {
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const isLoading = loadingFolders.has(file.path);

    const toggleFolder = async (path: string) => {
        if (level >= MAX_DEPTH) {
            console.warn('Maximum folder depth reached');
            return;
        }

        const newExpanded = new Set(expandedFolders);
        if (expandedFolders.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
            await onExpandFolder(path);
        }
        setExpandedFolders(newExpanded);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY
        });
    };

    return (
        <>
            <div className="pl-4">
                <div
                    className="flex items-center p-2 rounded hover:bg-opacity-20"
                    style={{
                        backgroundColor: expandedFolders.has(file.path) ? themeColors.treeHover : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = themeColors.treeHover;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor =
                            expandedFolders.has(file.path) ? themeColors.treeHover : 'transparent';
                    }}
                    onContextMenu={handleContextMenu}
                >
                    {!searchQuery && file.is_directory && (
                        <button
                            onClick={() => toggleFolder(file.path)}
                            className="mr-2"
                            style={{ color: themeColors.text }}
                            disabled={isLoading || level >= MAX_DEPTH}
                        >
                            {isLoading ? (
                                <span className="animate-spin">⌛</span>
                            ) : expandedFolders.has(file.path) ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                    )}
                    {!file.is_directory && (
                        <input
                            type="checkbox"
                            checked={checkedFiles.has(file.path)}
                            onChange={() => {
                                const newChecked = new Set(checkedFiles);
                                if (checkedFiles.has(file.path)) {
                                    newChecked.delete(file.path);
                                } else {
                                    newChecked.add(file.path);
                                }
                                setCheckedFiles(newChecked);
                            }}
                            className="mr-2"
                            style={{
                                accentColor: themeColors.highlight
                            }}
                        />
                    )}
                    {file.is_directory ? (
                        <Folder className="w-4 h-4 mr-2" style={{ color: themeColors.text }} />
                    ) : (
                        <File className="w-4 h-4 mr-2" style={{ color: themeColors.text }} />
                    )}
                    <div className="flex flex-col min-w-0">
                        <span style={{ color: themeColors.text, fontSize: '11px', fontWeight: 500 }} className="truncate">
                            {file.name}
                        </span>
                        {searchQuery && 'displayPath' in file && !file.is_directory && (
                            <span
                                style={{ color: themeColors.text, fontSize: '11px' }}
                                className="opacity-60 truncate"
                            >
                                {file.displayPath}
                            </span>
                        )}
                    </div>
                </div>
                {!searchQuery && file.is_directory && expandedFolders.has(file.path) && file.children && (
                    <div className="pl-4">
                        {file.children.slice(0, ITEMS_PER_PAGE).map((child) => (
                            <FileTreeItem
                                key={child.path}
                                file={child}
                                checkedFiles={checkedFiles}
                                setCheckedFiles={setCheckedFiles}
                                expandedFolders={expandedFolders}
                                setExpandedFolders={setExpandedFolders}
                                themeColors={themeColors}
                                onExpandFolder={onExpandFolder}
                                loadingFolders={loadingFolders}
                                level={level + 1}
                                searchQuery={searchQuery}
                            />
                        ))}
                        {file.children.length > ITEMS_PER_PAGE && (
                            <div className="pl-4 py-2 text-sm opacity-70" style={{ color: themeColors.text }}>
                                Showing {ITEMS_PER_PAGE} of {file.children.length} items
                            </div>
                        )}
                    </div>
                )}
            </div>
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    file={file}
                    onClose={() => setContextMenu(null)}
                    themeColors={themeColors}
                />
            )}
        </>
    );
};

export default FileTreeItem;