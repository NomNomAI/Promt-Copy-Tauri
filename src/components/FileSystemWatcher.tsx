import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from "@tauri-apps/api";

interface FileInfo {
    name: string;
    path: string;
    is_directory: boolean;
    children?: FileInfo[];
}

interface FileSystemWatcherProps {
    rootPath: string | null;
    onFileChange: (files: FileInfo[]) => void;
}

const FileSystemWatcher = ({ rootPath, onFileChange }: FileSystemWatcherProps) => {
    useEffect(() => {
        if (!rootPath) return;

        const refreshFiles = async () => {
            try {
                const files = await invoke<FileInfo[]>('list_files', {
                    path: rootPath,
                    depth: 1
                });
                onFileChange(files);
            } catch (error) {
                console.error('Failed to refresh files:', error);
            }
        };

        let unlistenCreated: (() => void) | undefined;
        let unlistenDeleted: (() => void) | undefined;
        let unlistenModified: (() => void) | undefined;

        const setupListeners = async () => {
            try {
                unlistenCreated = await listen('fs-created', () => refreshFiles());
                unlistenDeleted = await listen('fs-deleted', () => refreshFiles());
                unlistenModified = await listen('fs-modified', () => refreshFiles());
            } catch (error) {
                console.error('Failed to setup file system listeners:', error);
            }
        };

        setupListeners();

        return () => {
            unlistenCreated?.();
            unlistenDeleted?.();
            unlistenModified?.();
        };
    }, [rootPath, onFileChange]);

    return null;
};

export default FileSystemWatcher;