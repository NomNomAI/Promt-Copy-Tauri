import React from 'react';
import { Trash2, CheckCircle, Check } from 'lucide-react';
import { getAll } from '@tauri-apps/api/window';

interface CalendarListItemProps {
    entry: {
        timestamp: string;
        prompt: string;
        files: Array<{ path: string; content: string }>;
        success?: boolean;
        showAllFiles?: boolean;
    };
    index: number;
    themeColors: any;
    activeEntryTimestamp: string | null;
    onViewEntry: (entry: any) => Promise<void>;
    onDeleteEntry: (path: string) => Promise<void>;
    onMarkSuccess: (entry: any) => Promise<void>;
    onToggleShowFiles: (index: number) => void;
    isDeletingEntry: string | null;
    selectedDate: Date;
}

const CalendarListItem: React.FC<CalendarListItemProps> = ({
    entry,
    index,
    themeColors,
    activeEntryTimestamp,
    onViewEntry,
    onDeleteEntry,
    onMarkSuccess,
    onToggleShowFiles,
    isDeletingEntry,
    selectedDate
}) => {
    const entryTimestamp = new Date(entry.timestamp).getTime().toString();
    const isActive = activeEntryTimestamp === entryTimestamp;

    const handleSuccess = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!entry.success) {
            try {
                await onMarkSuccess(entry);

                // Refresh calendar if it exists
                const windows = await getAll();
                const calendar = windows.find(w => w.label === 'calendar');
                if (calendar) {
                    await calendar.emit('refresh-history');
                }
            } catch (error) {
                console.error('Failed to mark as success:', error);
            }
        }
    };

    return (
        <div
            className={`p-3 rounded relative group cursor-pointer hover:opacity-80 ${isActive ? 'history-entry-active' : ''}`}
            style={{
                backgroundColor: themeColors.inputBg,
                border: `1px solid ${themeColors.border}`,
                color: themeColors.text
            }}
            onClick={() => onViewEntry(entry)}
        >
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <div className="text-sm opacity-70 mb-2">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                    {entry.success && (
                        <div
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                            style={{
                                backgroundColor: themeColors.highlight,
                                color: themeColors.buttonText
                            }}
                        >
                            <CheckCircle className="w-3 h-3" />
                            <span>Success</span>
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    {!entry.success && (
                        <button
                            onClick={handleSuccess}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-opacity-10 hover:bg-white rounded"
                            style={{
                                color: themeColors.highlight,
                                borderColor: themeColors.highlight,
                                border: '1px solid'
                            }}
                            title="Mark as success"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const year = selectedDate.getFullYear();
                            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                            const day = String(selectedDate.getDate()).padStart(2, '0');
                            const filename = `${new Date(entry.timestamp).getTime()}.json`;
                            const path = `prompt-copy/history/${year}/${month}/${day}/${filename}`;
                            onDeleteEntry(path);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-opacity-10 hover:bg-white rounded"
                        style={{ color: themeColors.text }}
                        disabled={isDeletingEntry !== null}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {entry.prompt && (
                <div className="mb-2">
                    <strong className="text-sm">Prompt:</strong>
                    <div className="text-sm line-clamp-2 break-words">
                        {entry.prompt}
                    </div>
                </div>
            )}

            <div className="text-sm">
                <strong>Files:</strong> ({entry.files?.length || 0})
                <ul className="ml-4 mt-1">
                    {Array.isArray(entry.files) && entry.files.slice(0, entry.showAllFiles ? undefined : 5).map((file, fileIndex) => (
                        <li
                            key={fileIndex}
                            className="line-clamp-1 cursor-pointer hover:opacity-80 break-all"
                            title={file?.path}
                        >
                            {file?.path ? file.path.split(/[/\\]/).pop() : 'Unknown file'}
                        </li>
                    ))}
                </ul>
                {Array.isArray(entry.files) && entry.files.length > 5 && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleShowFiles(index);
                        }}
                        className="mt-1 text-sm hover:opacity-80"
                        style={{ color: themeColors.highlight }}
                    >
                        {entry.showAllFiles ? 'Show Less' : `Show ${entry.files.length - 5} More`}
                    </button>
                )}
            </div>
        </div>
    );
};

export default CalendarListItem;