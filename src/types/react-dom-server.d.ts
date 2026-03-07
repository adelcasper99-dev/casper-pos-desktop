declare module 'react-dom/server' {
    import { ReactElement } from 'react';
    export function renderToString(element: ReactElement): string;
    export function renderToStaticMarkup(element: ReactElement): string;
}
