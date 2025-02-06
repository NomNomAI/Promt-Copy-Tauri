import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ChevronDown, FileX, Copy, CheckCircle, GitCompare } from 'lucide-react';
import { appWindow, getAll } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/api/clipboard';
import themes from '../themes';
import { Theme } from '../ThemeContext';
import { readTextFile } from '@tauri-apps/api/fs';

interface FileContent {
    prompt?: string;
    files?: Array<{
        path: string;
        content: string;
    }>;
    addScriptFix?: boolean;
}

const FileViewer = () => {
    const [content, setContent] = useState<FileContent | string>('');
    const [title, setTitle] = useState('');
    const [currentTheme, setCurrentTheme] = useState<Theme>('solarized');
    const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [isComparing, setIsComparing] = useState(false);
    const [previousContent, setPreviousContent] = useState<string>('');
    const themeColors = themes[currentTheme].colors;
    const [currentFileContent, setCurrentFileContent] = useState<string>('');
   
    const handleClose = async () => {
        try {
            const windows = await getAll();
            const calendar = windows.find(w => w.label === 'calendar');
            if (calendar) {
                await emit('file-viewer-closed', {});
            }
            await appWindow.close();
        } catch (error) {
            console.error('Error closing file viewer:', error);
        }
    };
    useEffect(() => {
        const setupCleanup = async () => {
            const unlisten = await listen('tauri://close-requested', handleClose);
            return () => {
                unlisten();
            };
        };
        setupCleanup();
    }, []);

    useEffect(() => {
        const handleMainClose = async () => {
            await appWindow.close();
        };

        const unlisten = listen('tauri://close-requested', handleMainClose);
        return () => { unlisten.then(u => u()); };
    }, []);
    useEffect(() => {
        const checkMainWindowPosition = async () => {
            try {
                const windows = await getAll();
                const mainWindow = windows.find(w => w.label === 'main');

                if (mainWindow) {
                    const mainPos = await mainWindow.outerPosition();
                    const mainSize = await mainWindow.outerSize();
                    const fileViewerSize = await appWindow.outerSize();

                    await appWindow.setPosition({
                        type: 'Physical',
                        x: mainPos.x + mainSize.width,
                        y: mainPos.y
                    });

                    if (fileViewerSize.height !== mainSize.height) {
                        await appWindow.setSize({
                            type: 'Physical',
                            width: fileViewerSize.width,
                            height: mainSize.height
                        });
                    }
                }
            } catch (error) {
                console.error('Error syncing window position:', error);
            }
        };

        const interval = setInterval(checkMainWindowPosition, 100);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const setupListeners = async () => {
            try {
                const unlistenContent = await listen('set-content', (event: any) => {
                    const { content, filePath, theme } = event.payload;
                    try {
                        const parsedContent = JSON.parse(content);
                        setContent(parsedContent);
                        if (parsedContent.files?.length > 0) {
                            setSelectedFile(parsedContent.files[0]);
                        }
                    } catch (e) {
                        setContent(content);
                    }
                    setTitle(filePath);
                    if (theme) {
                        setCurrentTheme(theme);
                    }
                });

                const unlistenTheme = await listen('theme-update', (event: any) => {
                    const { theme } = event.payload;
                    if (theme) {
                        setCurrentTheme(theme);
                    }
                });

                return () => {
                    unlistenContent();
                    unlistenTheme();
                };
            } catch (error) {
                console.error('Error setting up listeners:', error);
            }
        };

        setupListeners();
    }, []);

    const handleCopyContent = async () => {
        try {
            let contentToCopy = '';
            if (selectedFile) {
                contentToCopy = selectedFile.content;
            } else if (typeof content === 'object') {
                contentToCopy = JSON.stringify(content, null, 2);
            } else {
                contentToCopy = content as string;
            }

            await writeText(contentToCopy);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (error) {
            console.error('Error copying to clipboard:', error);
        }
    };

    const toggleCompare = async () => {
        if (!isComparing && selectedFile) {
            setPreviousContent(selectedFile.content);
            try {
                const currentContent = await readTextFile(selectedFile.path);
                setCurrentFileContent(currentContent);
            } catch (error) {
                console.error('Error reading current file:', error);
            }
        }
        setIsComparing(!isComparing);
    };

    const computeDiff = (oldStr: string, newStr: string) => {
        const oldLines = oldStr.split('\n');
        const newLines = newStr.split('\n');
        const result: { text: string; type: 'add' | 'remove' | 'same' }[] = [];

        let i = 0, j = 0;
        while (i < oldLines.length || j < newLines.length) {
            if (i >= oldLines.length) {
                result.push({ text: newLines[j], type: 'add' });
                j++;
            } else if (j >= newLines.length) {
                result.push({ text: oldLines[i], type: 'remove' });
                i++;
            } else if (oldLines[i] === newLines[j]) {
                result.push({ text: oldLines[i], type: 'same' });
                i++;
                j++;
            } else {
                result.push({ text: oldLines[i], type: 'remove' });
                result.push({ text: newLines[j], type: 'add' });
                i++;
                j++;
            }
        }

        return result;
    };

    const renderContent = (content: string, diffView = false) => {
        if (!content) return renderEmptyState();

        if (!diffView) {
            return (
                <pre
                    className="p-4 rounded font-mono text-sm overflow-x-auto whitespace-pre"
                    style={{
                        backgroundColor: themeColors.background,
                        maxWidth: '100%',
                        tabSize: 4
                    }}
                >
                    {content}
                </pre>
            );
        }

        const diff = computeDiff(previousContent, content);

        return (
            <pre
                className="p-4 rounded font-mono text-sm overflow-x-auto whitespace-pre"
                style={{
                    backgroundColor: themeColors.background,
                    maxWidth: '100%',
                    tabSize: 4
                }}
            >
                {diff.map((line, idx) => (
                    <div
                        key={idx}
                        style={{
                            backgroundColor: line.type === 'add'
                                ? 'rgba(40, 167, 69, 0.2)'
                                : line.type === 'remove'
                                    ? 'rgba(220, 53, 69, 0.2)'
                                    : 'transparent',
                            color: themeColors.text,
                        }}
                    >
                        {line.type === 'add' && '+ '}
                        {line.type === 'remove' && '- '}
                        {line.type === 'same' && '  '}
                        {line.text}
                    </div>
                ))}
            </pre>
        );
    };

    const getProcessedFileContent = (content: string) => {
        if (!content) return '';
        return content;
    };

    const renderEmptyState = () => (
        <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ color: themeColors.text }}>
            <FileX className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No Content Available</p>
            <p className="text-sm opacity-70 text-center">This file has nothing in it</p>
        </div>
    );

    return (
        <div
            className="h-screen flex flex-col"
            data-theme={currentTheme}
            style={{ backgroundColor: themeColors.background }}
        >
            <div
                data-tauri-drag-region
                style={{
                    backgroundColor: themeColors.titlebarBg,
                    position: 'relative',
                    zIndex: 50
                }}
                className="h-8 shrink-0"
            >
                <div className="flex items-center justify-between h-full pointer-events-none">
                    <div className="w-24 flex items-center pl-2" />
                    <div
                        style={{ color: themeColors.text }}
                        className="flex-1 text-center text-sm font-medium truncate mx-2"
                    >
                        {title}
                    </div>
                    <div className="w-24 flex items-center justify-end gap-2 pr-2 pointer-events-auto">
                        <button
                            onClick={handleClose}
                            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
                {typeof content === 'object' && content.files && content.files.length > 0 && (
                    <div
                        className="border-b"
                        style={{
                            borderColor: themeColors.border,
                            backgroundColor: themeColors.treeHover
                        }}
                    >
                        <div className="p-4">
                            <div className="relative">
                                <select
                                    value={selectedFile?.path || ''}
                                    onChange={(e) => {
                                        const file = content.files?.find(f => f.path === e.target.value);
                                        if (file) setSelectedFile(file);
                                    }}
                                    className="w-full appearance-none rounded px-3 py-2 pr-8 focus:ring-2"
                                    style={{
                                        backgroundColor: themeColors.background,
                                        color: themeColors.text,
                                        border: `1px solid ${themeColors.border}`,
                                        '--tw-ring-color': themeColors.highlight,
                                        '--tw-ring-offset-color': themeColors.background,
                                    } as React.CSSProperties}
                                >
                                    {content.files.map((file, index) => (
                                        <option
                                            key={index}
                                            value={file.path}
                                        >
                                            {file.path.split(/[/\\]/).pop()}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none"
                                    style={{ color: themeColors.text }}
                                />
                            </div>
                            <div
                                className="mt-2 text-sm opacity-70"
                                style={{ color: themeColors.text }}
                            >
                                {selectedFile?.path}
                            </div>
                        </div>
                    </div>
                )}

                <div
                    className="flex-1 p-4 overflow-auto"
                    style={{
                        backgroundColor: themeColors.inputBg,
                        color: themeColors.text
                    }}
                >
                    {typeof content === 'object' && (
                        <div className="mb-4">
                            <div className="text-sm font-medium mb-2 opacity-70">Prompt</div>
                            <div
                                className="p-3 rounded"
                                style={{ backgroundColor: themeColors.background }}
                            >
                                {content.prompt || 'No prompt provided'}
                            </div>
                        </div>
                    )}

                    {selectedFile ? (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="text-sm font-medium opacity-70">File Content</div>
                                <button
                                    onClick={handleCopyContent}
                                    className="p-1 rounded hover:opacity-80 transition-colors"
                                    style={{
                                        backgroundColor: copySuccess ? themeColors.highlight : 'transparent',
                                        color: copySuccess ? themeColors.buttonText : themeColors.text
                                    }}
                                    title="Copy content"
                                >
                                    {copySuccess ? (
                                        <CheckCircle className="w-4 h-4" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    onClick={toggleCompare}
                                    className="p-1 rounded hover:opacity-80 transition-colors hidden"
                                    style={{
                                        backgroundColor: isComparing ? themeColors.highlight : 'transparent',
                                        color: isComparing ? themeColors.buttonText : themeColors.text
                                    }}
                                    title="Compare versions"
                                >
                                    <GitCompare className="w-4 h-4" />
                                </button>
                            </div>

                            {isComparing && (
                                <div className="flex justify-between text-sm font-medium mb-2 border-b" style={{ borderColor: themeColors.border }}>
                                    <div>Previous Version</div>
                                    <div>Current Version</div>
                                </div>
                            )}
                            <div className={`flex transition-all duration-300 ${isComparing ? 'space-x-2' : ''}`}>
                                <div className={`transition-all duration-300 ${isComparing ? 'w-[49.5%]' : 'w-full'}`}>
                                    {isComparing ? renderContent(selectedFile.content, true) : renderContent(selectedFile.content, false)}
                                </div>

                                {isComparing && (
                                    <div className="w-[49.5%]">
                                        {renderContent(currentFileContent, true)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : typeof content === 'object' && content.files ? (
                        renderEmptyState()
                    ) : (
                        <pre
                            className="p-4 rounded font-mono text-sm overflow-x-auto whitespace-pre"
                            style={{
                                backgroundColor: themeColors.background,
                                maxWidth: '100%',
                                tabSize: 4
                            }}
                        >
                            {getProcessedFileContent(content as string) || renderEmptyState()}
                        </pre>
                    )}

                    {typeof content === 'object' && content.addScriptFix && (
                        <div className="mt-4 text-sm opacity-70">
                            Script fix requested
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FileViewer;