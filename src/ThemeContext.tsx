// ThemeContext.tsx
import React from 'react';
import themes from './themes';

export type Theme = keyof typeof themes;

export const ThemeContext = React.createContext({
    theme: 'solarized' as Theme,
    setTheme: (_: Theme) => { },  // Changed 'theme' to '_' to indicate it's intentionally unused

});