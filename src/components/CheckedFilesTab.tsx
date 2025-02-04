import React, { useState, useEffect } from 'react';
import { File, X, Folder } from 'lucide-react';
import { invoke } from "@tauri-apps/api";

interface CheckedFilesTabProps {
    checkedFiles: Set<string>;
    onRemoveFile: (path: string) => void;
    themeColors: any;
}

interface ContextMenuProps {
    x: number;
    y: number;
    file: { path: string; name: string };
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

const CheckedFilesTab: React.FC<CheckedFilesTabProps> = ({
    checkedFiles,
    onRemoveFile,
    themeColors
}) => {
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: { path: string; name: string } } | null>(null);

    if (checkedFiles.size === 0) {
        return (
            <div 
                className="text-center p-4 opacity-70"
                style={{ color: themeColors.text }}
            >
                No files selected
            </div>
        );
    }

    const handleContextMenu = (e: React.MouseEvent, filePath: string) => {
        e.preventDefault();
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            file: {
                path: filePath,
                name: fileName
            }
        });
    };

    return (
        <div className="space-y-2">
            {Array.from(checkedFiles).map(filePath => {
                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                
                return (
                    <div
                        key={filePath}
                        className="flex items-center justify-between p-2 rounded"
                        style={{
                            backgroundColor: themeColors.treeHover,
                            color: themeColors.text
                        }}
                        onContextMenu={(e) => handleContextMenu(e, filePath)}
                    >
                        <div className="flex items-center space-x-2 min-w-0">
                            <File className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{fileName}</span>
                        </div>
                        <button
                            onClick={() => onRemoveFile(filePath)}
                            className="hover:opacity-80 transition-opacity ml-2 flex-shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    file={contextMenu.file}
                    onClose={() => setContextMenu(null)}
                    themeColors={themeColors}
                />
            )}
        </div>
    );
};

export default CheckedFilesTab;