import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

interface FileViewerPanelProps {
    themeColors: any;
    isOpen: boolean;
    onClose: () => void;
}

const FileViewerPanel: React.FC<FileViewerPanelProps> = ({ themeColors, isOpen, onClose }) => {
    const [content, setContent] = useState<string>('');
    const [title, setTitle] = useState<string>('');

    useEffect(() => {
        const unsubscribe = listen('set-content', (event: any) => {
            const { content, filePath } = event.payload;
            try {
                // Parse and format the JSON content
                const formattedContent = JSON.stringify(JSON.parse(content), null, 2);
                setContent(formattedContent);
                setTitle(filePath);
            } catch (e) {
                setContent(content);
                setTitle(filePath);
            }
        });

        return () => {
            unsubscribe.then(unsub => unsub());
        };
    }, []);

    const panelStyles = {
        position: 'fixed' as const,
        top: 0,
        right: 0,
        height: '100vh',
        width: '600px',
        backgroundColor: themeColors.background,
        border: `1px solid ${themeColors.border}`,
        transform: `translateX(${isOpen ? '0' : '100%'})`,
        transition: 'transform 0.2s ease-in-out',
        zIndex: 2000, // Higher z-index to ensure it's above the main window
        display: isOpen ? 'block' : 'none',
        boxShadow: '-2px 0 10px rgba(0, 0, 0, 0.1)'
    };

    return (
        <div style={panelStyles}>
            <div className="p-4 h-full overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2
                        className="text-lg font-medium truncate flex-1"
                        style={{ color: themeColors.text }}
                    >
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:opacity-80 rounded"
                        style={{ color: themeColors.text }}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div
                    className="flex-1 overflow-auto rounded p-4 font-mono text-sm whitespace-pre"
                    style={{
                        backgroundColor: themeColors.inputBg,
                        color: themeColors.text,
                        border: `1px solid ${themeColors.border}`
                    }}
                >
                    {content}
                </div>
            </div>
        </div>
    );
};

export default FileViewerPanel;