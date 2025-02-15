import React, { useState, useEffect, useContext } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { invoke } from "@tauri-apps/api/tauri";
import { getAll } from '@tauri-apps/api/window';
import { ThemeContext } from '../ThemeContext';
import { listen } from '@tauri-apps/api/event';
import CalendarListItem from './CalendarListItem';

interface CalendarPanelProps {
    themeColors: any;
    isOpen: boolean;
    onClose: () => void;
}

interface HistoryEntry {
    timestamp: string;
    prompt: string;
    files: Array<{ path: string; content: string }>;
    success?: boolean;
    showAllFiles?: boolean;
}

const CalendarPanel: React.FC<CalendarPanelProps> = ({ themeColors, isOpen, onClose }) => {
    const { theme } = useContext(ThemeContext);
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [datesWithHistory, setDatesWithHistory] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isDeletingEntry, setIsDeletingEntry] = useState<string | null>(null);
    const [activeEntryTimestamp, setActiveEntryTimestamp] = useState<string | null>(null);

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const isNextMonthDisabled = () => {
        const today = new Date();
        return currentDate.getFullYear() > today.getFullYear() ||
            (currentDate.getFullYear() === today.getFullYear() &&
                currentDate.getMonth() >= today.getMonth());
    };

    const changeMonth = (increment: number) => {
        if (increment > 0 && isNextMonthDisabled()) {
            return;
        }
        const newDate = new Date(currentDate);
        newDate.setMonth(currentDate.getMonth() + increment);
        setCurrentDate(newDate);
    };

    const generateCalendarDays = (): (Date | null)[] => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days: (Date | null)[] = [];
        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push(null);
        }

        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push(new Date(year, month, i));
        }

        return days;
    };

    const isCurrentDay = (date: Date) => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    const isFutureDate = (date: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date > today;
    };

    // Effect to load history dates when panel opens or month changes
    useEffect(() => {
        const loadHistory = async () => {
            if (!isOpen) return;

            try {
                setIsLoading(true);
                const files = await invoke<string[]>('list_history_files', {
                    path: 'prompt-copy/history'
                });

                const dates = new Set<string>();
                for (const file of files) {
                    const match = file.match(/(\d{4})\/(\d{2})\/(\d{2})/);
                    if (match) {
                        dates.add(`${match[1]}-${match[2]}-${match[3]}`);
                    }
                }
                setDatesWithHistory(dates);
            } catch (error) {
                console.error('Error loading history dates:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadHistory();
    }, [isOpen, currentDate]);

    // Effect to load entries for selected date
    useEffect(() => {
        const loadEntriesForDate = async () => {
            if (!selectedDate || !isOpen) return;

            try {
                setIsLoading(true);
                const year = selectedDate.getFullYear();
                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const day = String(selectedDate.getDate()).padStart(2, '0');
                const path = `prompt-copy/history/${year}/${month}/${day}`;

                const files = await invoke<string[]>('list_history_files', { path });
                if (!files.length) {
                    setHistoryEntries([]);
                    return;
                }

                const entries = await Promise.all(
                    files.map(async (file: string) => {
                        const content = await invoke<string>('read_file', { path: file });
                        return { ...JSON.parse(content), showAllFiles: false };
                    })
                );

                setHistoryEntries(
                    entries.sort((a, b) =>
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    )
                );
            } catch (error) {
                console.error('Error loading history entries:', error);
                setHistoryEntries([]);
            } finally {
                setIsLoading(false);
            }
        };

        loadEntriesForDate();
    }, [selectedDate, isOpen]);

    // Effect to sync selected date with current month
    useEffect(() => {
        const newDate = new Date(currentDate);
        newDate.setDate(selectedDate.getDate());
        // Only update if the day exists in the new month
        if (newDate.getMonth() === currentDate.getMonth()) {
            setSelectedDate(newDate);
        } else {
            // If day doesn't exist in new month (e.g., 31st), set to last day of month
            newDate.setDate(1);
            newDate.setMonth(currentDate.getMonth() + 1);
            newDate.setDate(0);
            setSelectedDate(newDate);
        }
    }, [currentDate]);

    // Effect for file viewer event handling
    useEffect(() => {
        const setupListeners = async () => {
            const unsubscribeClose = await listen('file-viewer-closed', () => {
                setActiveEntryTimestamp(null);
            });

            // Monitor file viewer visibility
            const checkFileViewerVisibility = async () => {
                const windows = await getAll();
                const fileViewer = windows.find(w => w.label === 'file-viewer');
                if (fileViewer) {
                    const isVisible = await fileViewer.isVisible();
                    if (!isVisible) {
                        setActiveEntryTimestamp(null);
                    }
                }
            };

            const visibilityInterval = setInterval(checkFileViewerVisibility, 500);

            return () => {
                unsubscribeClose();
                clearInterval(visibilityInterval);
            };
        };

        const cleanup = setupListeners();
        return () => {
            cleanup.then(cleanupFn => cleanupFn());
        };
    }, []);

    const handleDeleteEntry = async (filePath: string) => {
        try {
            setIsDeletingEntry(filePath);
            const appDataDir = await invoke<string>('get_app_data_dir');
            const fullPath = `${appDataDir}/${filePath}`;

            // Extract timestamp from filename
            const fileTimestamp = filePath.split('/').pop()?.split('.')[0] || '';

            // Close viewer if showing the file being deleted
            const windows = await getAll();
            const fileViewer = windows.find(w => w.label === 'file-viewer');

            if (fileViewer && activeEntryTimestamp === fileTimestamp) {
                await fileViewer.hide();
                setActiveEntryTimestamp(null);
                await fileViewer.emit('file-viewer-closed', {});
            }

            await invoke('delete_history_file', { path: fullPath });

            // Reload entries and update history dates
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedDate.getDate()).padStart(2, '0');
            const path = `prompt-copy/history/${year}/${month}/${day}`;

            const files = await invoke<string[]>('list_history_files', { path });

            if (!files.length) {
                setHistoryEntries([]);
                const updatedDates = new Set(datesWithHistory);
                updatedDates.delete(`${year}-${month}-${day}`);
                setDatesWithHistory(updatedDates);
            } else {
                const entries = await Promise.all(
                    files.map(async (file: string) => {
                        const content = await invoke<string>('read_file', { path: file });
                        const parsed = JSON.parse(content);
                        return { ...parsed, showAllFiles: false };
                    })
                );

                setHistoryEntries(
                    entries.sort((a, b) =>
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    )
                );
            }
        } catch (error) {
            console.error('Error deleting history entry:', error);
        } finally {
            setIsDeletingEntry(null);
        }
    };

    const handleViewEntry = async (entry: HistoryEntry) => {
        try {
            const windows = await getAll();
            const fileViewer = windows.find(w => w.label === 'file-viewer');
            const entryTimestamp = new Date(entry.timestamp).getTime().toString();

            if (fileViewer && activeEntryTimestamp === entryTimestamp) {
                await fileViewer.hide();
                setActiveEntryTimestamp(null);
                return;
            }

            const content = JSON.stringify(entry, null, 2);
            await invoke('create_file_window', {
                title: new Date(entry.timestamp).toLocaleString(),
                content: content,
                theme: theme
            });

            setActiveEntryTimestamp(entryTimestamp);
        } catch (error) {
            console.error('Error viewing history entry:', error);
            setActiveEntryTimestamp(null);
        }
    };

    const handleMarkSuccess = async (entry: HistoryEntry) => {
        try {
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedDate.getDate()).padStart(2, '0');
            const filename = `${new Date(entry.timestamp).getTime()}.json`;
            const path = `prompt-copy/history/${year}/${month}/${day}/${filename}`;

            // Read the current file content
            const appDataDir = await invoke<string>('get_app_data_dir');
            const fullPath = `${appDataDir}/${path}`;
            const content = await invoke<string>('read_file', { path: fullPath });
            const updatedContent = JSON.parse(content);

            // Update the success flag
            updatedContent.success = true;

            // Write back the updated content
            await invoke('write_history', {
                path,
                content: JSON.stringify(updatedContent, null, 2)
            });

            // Update local state
            setHistoryEntries(prev =>
                prev.map(e =>
                    e.timestamp === entry.timestamp
                        ? { ...e, success: true }
                        : e
                )
            );
        } catch (error) {
            console.error('Error marking entry as success:', error);
        }
    };

    const handleToggleShowFiles = (index: number) => {
        setHistoryEntries(prev => prev.map((e, i) =>
            i === index ? { ...e, showAllFiles: !e.showAllFiles } : e
        ));
    };

    const panelStyles = {
        position: 'fixed' as const,
        top: '2rem',
        right: '0',
        height: 'calc(100% - 2rem)',
        width: '350px',
        backgroundColor: themeColors.background,
        borderLeft: `1px solid ${themeColors.border}`,
        transform: `translateX(${isOpen ? '0' : '100%'})`,
        transition: 'transform 0.3s ease-in-out',
        zIndex: 100,
        boxShadow: isOpen ? '-2px 0 10px rgba(0, 0, 0, 0.1)' : 'none',
    };

    return (
        <div style={panelStyles}>
            <div className="p-2 h-full overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-medium" style={{ color: themeColors.text }}>
                            History
                        </h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => changeMonth(-1)}
                                className="p-2 rounded hover:bg-opacity-20 transition-colors"
                                style={{ color: themeColors.text }}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            <h2 className="text-base font-medium" style={{ color: themeColors.text }}>
                                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                            </h2>

                            <button
                                onClick={() => changeMonth(1)}
                                className="p-2 rounded hover:bg-opacity-20 transition-colors"
                                style={{ color: themeColors.text }}
                                disabled={isNextMonthDisabled()}
                            >
                                <ChevronRight className="w-4 h-4" style={{
                                    opacity: isNextMonthDisabled() ? 0.3 : 1
                                }} />
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 hover:opacity-80 rounded"
                        style={{ color: themeColors.text }}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {isLoading ? (
                    <div className="text-center p-4 opacity-70" style={{ color: themeColors.text }}>
                        Loading...
                    </div>
                ) : (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="grid grid-cols-7 gap-1 mb-1" style={{ color: themeColors.text }}>
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                                <div key={day} className="text-center text-sm font-medium">
                                    {day}
                                </div>
                            ))}

                            {generateCalendarDays().map((date, index) => {
                                if (!date) {
                                    return <div key={`empty-${index}`} className="p-2" />;
                                }

                                const dateStr = date.toISOString().split('T')[0];
                                const hasHistory = datesWithHistory.has(dateStr);
                                const isToday = isCurrentDay(date);
                                const isFuture = isFutureDate(date);

                                return (
                                    <button
                                        key={date.getTime()}
                                        onClick={() => setSelectedDate(date)}
                                        disabled={isFuture}
                                        className={`
                                            p-2 rounded text-sm relative
                                            ${selectedDate.toDateString() === date.toDateString() ? 'font-bold' : ''}
                                            ${isFuture ? 'cursor-not-allowed' : 'hover:bg-opacity-20'}
                                        `}
                                        style={{
                                            backgroundColor: selectedDate.toDateString() === date.toDateString()
                                                ? themeColors.highlight
                                                : isToday
                                                    ? themeColors.treeHover
                                                    : hasHistory
                                                        ? `${themeColors.highlight}40`
                                                        : 'transparent',
                                            color: selectedDate.toDateString() === date.toDateString()
                                                ? themeColors.buttonText
                                                : themeColors.text,
                                            opacity: isFuture || (!hasHistory && !isToday) ? 0.5 : 1
                                        }}
                                    >
                                        {date.getDate()}
                                        {hasHistory && (
                                            <div
                                                className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full"
                                                style={{ backgroundColor: themeColors.highlight }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0">
                            {historyEntries.length === 0 ? (
                                <div className="text-center p-4 opacity-70" style={{ color: themeColors.text }}>
                                    No history entries for this date
                                </div>
                            ) : (
                                <div className="space-y-1 p-1">
                                    {historyEntries.map((entry, index) => (
                                        <CalendarListItem
                                            key={entry.timestamp}
                                            entry={entry}
                                            index={index}
                                            themeColors={themeColors}
                                            activeEntryTimestamp={activeEntryTimestamp}
                                            onViewEntry={handleViewEntry}
                                            onDeleteEntry={handleDeleteEntry}
                                            onMarkSuccess={handleMarkSuccess}
                                            onToggleShowFiles={handleToggleShowFiles}
                                            isDeletingEntry={isDeletingEntry}
                                            selectedDate={selectedDate}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CalendarPanel;