// File-Viewer.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import FileViewer from "./components/FileViewer";
import { ThemeContext } from './ThemeContext';
import { Theme } from './ThemeContext';
import "./styles.css";

// Initialize with solarized theme to match main app default
const FileViewerApp = () => {
    const [theme, setTheme] = React.useState<Theme>('solarized');

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            <FileViewer />
        </ThemeContext.Provider>
    );
};

ReactDOM.createRoot(document.getElementById("file-viewer-root") as HTMLElement).render(
    <React.StrictMode>
        <FileViewerApp />
    </React.StrictMode>
);