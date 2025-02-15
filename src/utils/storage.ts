import { invoke } from "@tauri-apps/api/tauri";
import { Theme } from "../ThemeContext";

export const saveTheme = async (theme: Theme) => {
    try {
        await invoke('write_history', {
            path: 'settings/theme.json',
            content: JSON.stringify({ theme })
        });
    } catch (error) {
        console.error('Error saving theme:', error);
    }
};

export const loadTheme = async (): Promise<Theme | null> => {
    try {
        const appDataDir = await invoke<string>('get_app_data_dir');
        const content = await invoke<string>('read_file', {
            path: `${appDataDir}/settings/theme.json`
        });
        const data = JSON.parse(content);
        return data.theme;
    } catch (error) {
        // Return null instead of logging error for first-time users
        return null;
    }
};