import React, { useEffect, useState, useContext } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ThemeContext } from '../ThemeContext';
import themes from '../themes';

interface SetContentPayload {
    content: string;
    filePath: string;
    theme?: string;
}

const FileWindow: React.FC = () => {
    const [content, setContent] = useState<string>('');
    const [filePath, setFilePath] = useState<string>('');
    const { theme, setTheme } = useContext(ThemeContext);

    useEffect(() => {
        let cleanup: UnlistenFn;

        const setupListener = async () => {
            cleanup = await listen<SetContentPayload>('set-content', (event) => {
                const { content, filePath, theme: newTheme } = event.payload;
                setContent(content);
                setFilePath(filePath);

                if (newTheme && setTheme && themes[newTheme as keyof typeof themes]) {
                    setTheme(newTheme as keyof typeof themes);
                }
            });
        };

        setupListener();

        return () => {
            if (cleanup) {
                cleanup();
            }
        };
    }, [setTheme]);

    const currentThemeColors = themes[theme].colors;

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
                <div
                    className="font-mono whitespace-pre-wrap text-sm"
                    style={{ color: currentThemeColors.text }}
                >
                    {content}
                </div>
            </div>
        </div>
    );
};

export default FileWindow;