import React, { useState, useContext } from 'react';
import { appWindow, getAll } from '@tauri-apps/api/window';
import { Settings, X, Calendar } from 'lucide-react';
import { Theme, ThemeContext } from '../ThemeContext';
import themes from '../themes';
import { open } from "@tauri-apps/api/shell";
import CalendarPanel from './CalendarPanel';

interface TitleBarProps {
    title?: string;
}

interface ThemeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ThemeModal: React.FC<ThemeModalProps> = ({ isOpen, onClose }) => {
    const { theme, setTheme } = useContext(ThemeContext);
    const themeColors = themes[theme].colors;

    if (!isOpen) return null;

    const handleThemeChange = (newTheme: Theme) => {
        setTheme(newTheme);
    };

    return (
        <div
            className="fixed inset-0 flex items-center justify-center"
            style={{ zIndex: 9999 }}
            onClick={onClose}
        >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
            <div
                style={{
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                    position: 'relative'
                }}
                className="rounded-lg w-80 shadow-xl border"
                onClick={e => e.stopPropagation()}
            >
                <div
                    style={{ borderColor: themeColors.border }}
                    className="flex items-center justify-between p-4 border-b"
                >
                    <h2 style={{ color: themeColors.text }} className="text-lg font-medium">
                        Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="hover:opacity-80 transition-opacity"
                    >
                        <X style={{ color: themeColors.text }} className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4">
                    <label style={{ color: themeColors.text }} className="block mb-2">
                        Theme
                    </label>
                    <div className="space-y-2">
                        {Object.entries(themes).map(([themeKey, themeValue]) => (
                            <button
                                key={themeKey}
                                onClick={() => handleThemeChange(themeKey as Theme)}
                                style={{
                                    backgroundColor: theme === themeKey ? themeColors.highlight : themeColors.inputBg,
                                    color: theme === themeKey ? themeColors.buttonText : themeColors.text,
                                    borderColor: themeColors.border
                                }}
                                className="w-full text-left p-3 rounded transition-colors hover:opacity-90 border"
                            >
                                {themeValue.name}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-4 border-t" style={{ borderColor: themeColors.border }}>
                    <label style={{ color: themeColors.text }} className="block mb-2">
                        About
                    </label>
                    <button
                        onClick={() => open('https://www.nomnomai.org/')}
                        className="w-full text-left p-3 rounded transition-colors hover:opacity-90 border flex items-center justify-center gap-1"
                        style={{
                            backgroundColor: themeColors.inputBg,
                            color: themeColors.text,
                            borderColor: themeColors.border
                        }}
                    >
                        Made By Nom Nom
                    </button>
                </div>
            </div>
        </div>
    );
};

const TitleBar: React.FC<TitleBarProps> = ({ title = "Prompt Copy" }) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const { theme } = useContext(ThemeContext);
    const themeColors = themes[theme].colors;

    const handleClose = async () => {
        try {
            const windows = await getAll();
            const fileViewer = windows.find(w => w.label === 'file-viewer');
            if (fileViewer) {
                await fileViewer.close();
            }
        } catch (error) {
            console.error('Error closing file viewer', error);
        }
        await appWindow.close();
    };

    const handleMinimize = () => appWindow.minimize();
    const handleMaximize = () => appWindow.toggleMaximize();

    return (
        <>
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
                    <div className="w-24 flex items-center pl-2 pointer-events-auto gap-2">
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-1 hover:opacity-80 transition-opacity rounded-sm"
                            style={{ backgroundColor: 'transparent' }}
                        >
                            <Settings style={{ color: themeColors.text }} className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                            className="p-1 hover:opacity-80 transition-opacity rounded-sm"
                            style={{
                                backgroundColor: 'transparent',
                                color: isCalendarOpen ? themeColors.highlight : themeColors.text
                            }}
                        >
                            <Calendar className="w-4 h-4" />
                        </button>
                    </div>

                    <div
                        style={{ color: themeColors.text }}
                        className="flex-1 text-center text-sm font-medium truncate mx-2"
                    >
                        {title}
                    </div>

                    <div className="w-24 flex items-center justify-end gap-2 pr-2 pointer-events-auto">
                        <button
                            onClick={handleMinimize}
                            className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors focus:outline-none"
                        />
                        <button
                            onClick={handleMaximize}
                            className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors focus:outline-none"
                        />
                        <button
                            onClick={handleClose}
                            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            <ThemeModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            <CalendarPanel
                themeColors={themeColors}
                isOpen={isCalendarOpen}
                onClose={() => setIsCalendarOpen(false)}
            />
        </>
    );
};

export default TitleBar;
