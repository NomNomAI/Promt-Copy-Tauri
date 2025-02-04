import React, { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';

interface ToastProps {
    message: string;
    type?: 'success' | 'copy';
    visible: boolean;
    onHide: () => void;
    themeColors: any;
}

const Toast: React.FC<ToastProps> = ({ message, visible, onHide, themeColors }) => {
    useEffect(() => {
        if (visible) {
            const timer = setTimeout(() => {
                onHide();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [visible, onHide]);

    if (!visible) return null;

    return (
        <div
            className="fixed top-12 right-4 px-4 py-2 rounded-md shadow-lg flex items-center space-x-2 animate-fade-in"
            style={{
                backgroundColor: themeColors.highlight,
                color: themeColors.buttonText
            }}
        >
            <CheckCircle className="w-5 h-5" />
            <span>{message}</span>
        </div>
    );
};

export default Toast;