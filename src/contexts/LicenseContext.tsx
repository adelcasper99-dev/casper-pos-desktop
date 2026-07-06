"use client";

import React, { createContext, useContext } from 'react';

type LicenseContextType = {
    isReadOnly: boolean;
};

const LicenseContext = createContext<LicenseContextType>({ isReadOnly: false });

export function LicenseProvider({ children, isReadOnly }: { children: React.ReactNode, isReadOnly: boolean }) {
    return (
        <LicenseContext.Provider value={{ isReadOnly }}>
            {children}
        </LicenseContext.Provider>
    );
}

export function useLicense() {
    return useContext(LicenseContext);
}
