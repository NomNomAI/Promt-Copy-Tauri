import React, { useEffect, useState, useContext } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ThemeContext } from '../ThemeContext';
import themes from '../themes';
import { loadTheme } from '../utils/storage';

interface SetContentPayload {
    content: string;
    filePath: string;
    theme?: string;
}

const FileWindow: React.FC = () => {
    const [content, setContent] = useState<string>('');
    const [filePath, setFilePath] = useState<string>('');
    const { theme, setTheme } = useContext(ThemeContext);
    const [isInitialized, setIsInitialized] = useState(false);

    // Load initial theme when component mounts
    useEffect(() => {
        const initTheme = async () => {
            try {
                const savedTheme = await loadTheme();
                if (savedTheme && setTheme) {
                    setTheme(savedTheme);
                }
                setIsInitialized(true);
            } catch (error) {
                console.error('Error loading initial theme:', error);
                setIsInitialized(true);
            }
        };
        initTheme();
    }, [setTheme]);

    // Listen for content updates
    useEffect(() => {
        let cleanupFns: UnlistenFn[] = [];

        const setupListeners = async () => {
            // Listen for set-content events
            const setContentCleanup = await listen<SetContentPayload>('set-content', (event) => {
                const { content, filePath, theme: newTheme } = event.payload;
                setContent(content);
                setFilePath(filePath);

                if (newTheme && setTheme && themes[newTheme as keyof typeof themes]) {
                    setTheme(newTheme as keyof typeof themes);
                }
            });

            // Listen for clear-content events
            const clearContentCleanup = await listen('clear-content', () => {
                setContent('');
                setFilePath('');
            });

            // Listen for append-content events
            const appendContentCleanup = await listen<SetContentPayload>('append-content', (event) => {
                const { content: newContent } = event.payload;
                setContent(prev => prev + newContent);
            });

            cleanupFns = [setContentCleanup, clearContentCleanup, appendContentCleanup];
        };

        setupListeners();
        return () => {
            cleanupFns.forEach(cleanup => cleanup());
        };
    }, [setTheme]);

    const currentThemeColors = themes[theme].colors;

    if (!isInitialized) {
        return (
            <div
                className="h-screen flex items-center justify-center"
                style={{ backgroundColor: currentThemeColors.background }}
            >
                <div style={{ color: currentThemeColors.text }}>Loading...</div>
            </div>
        );
    }

    return (
        <div
            className="h-screen flex flex-col"
            style={{ backgroundColor: currentThemeColors.background }}
            data-theme={theme}
        >
            {filePath && (
                <div
                    className="p-2 border-b text-sm"
                    style={{
                        borderColor: currentThemeColors.border,
                        color: currentThemeColors.text
                    }}
                >
                    {filePath}
                </div>
            )}
            <div className="p-4 flex-1 overflow-auto">
                {content ? (
                    <div
                        className="font-mono whitespace-pre-wrap text-sm"
                        style={{ color: currentThemeColors.text }}
                    >
                        {content}
                    </div>
                ) : (
                    <div
                        className="h-full flex flex-col items-center justify-center opacity-50"
                        style={{ color: currentThemeColors.text }}
                    >
                        <div className="text-4xl mb-4">✕</div>
                        <div className="text-xl mb-2">No Content Available</div>
                        <div className="text-sm">This file has nothing in it</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileWindow;
