import { invoke } from "@tauri-apps/api";

export async function saveToHistory(prompt: string, files: Set<string>, addScriptFix: boolean) {
    try {
        // First gather all file contents
        const filesWithContent = await Promise.all(
            Array.from(files).map(async (filePath) => {
                try {
                    const content = await invoke('read_file', { path: filePath });
                    return {
                        path: filePath,
                        content
                    };
                } catch (error) {
                    console.error(`Error reading file ${filePath}:`, error);
                    return {
                        path: filePath,
                        content: 'Error: Could not read file'
                    };
                }
            })
        );

        const historyData = {
            timestamp: new Date().toISOString(),
            prompt,
            files: filesWithContent,
            addScriptFix,
            success: false // Initialize as false
        };

        const now = new Date();
        const path = `prompt-copy/history/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
        const filename = `${now.getTime()}.json`;
        const fullPath = `${path}/${filename}`;

        // Write the file
        await invoke('write_history', {
            path: fullPath,
            content: JSON.stringify(historyData, null, 2)
        });

        // Return the path for success button
        return { path: fullPath, timestamp: now.toLocaleTimeString() };
    } catch (error) {
        console.error('Failed to save history:', error);
        throw error;
    }
}

export async function markHistorySuccess(historyPath: string) {
    try {
        // Get app data directory first, since that's where the file is actually saved
        const appDataDir = await invoke<string>('get_app_data_dir');
        const fullPath = `${appDataDir}/${historyPath}`;

        // Add a small delay to ensure file is written
        await new Promise(resolve => setTimeout(resolve, 100));

        // Read the file
        const content = await invoke<string>('read_file', { path: fullPath });
        const historyData = JSON.parse(content);
        historyData.success = true;

        // Write back the updated content
        await invoke('write_history', {
            path: historyPath,
            content: JSON.stringify(historyData, null, 2)
        });

        return true;
    } catch (error) {
        console.error('Failed to mark history as success:', error);
        throw error;
    }
}