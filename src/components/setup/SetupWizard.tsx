
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CasperLoader } from "@/components/ui/CasperLoader";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Rocket, Shield, Building, Settings, CheckCircle2, Database, FolderOpen, AlertCircle } from "lucide-react";
import { performSetup } from "@/actions/setup";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { extractIpcData, expectIpcOk } from '@/lib/ipc-utils';

const STEPS = [
    { id: 'welcome', title: 'Welcome', icon: Rocket },
    { id: 'db', title: 'Database', icon: Database },
    { id: 'admin', title: 'Administrator', icon: Shield },
    { id: 'branch', title: 'Branch', icon: Building },
    { id: 'settings', title: 'System Settings', icon: Settings },
    { id: 'data-options', title: 'Data Retention', icon: Database },
    { id: 'finish', title: 'Ready!', icon: CheckCircle2 },
];

export default function SetupWizard() {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const router = useRouter();

    const [dbPath, setDbPath] = useState('');
    const [originalDbPath, setOriginalDbPath] = useState('');

    const [formData, setFormData] = useState({
        admin: { username: 'admin', name: 'System Admin', password: '' },
        branch: { name: 'Main Branch', type: 'RETAIL' },
        settings: { taxRate: 14, currency: 'EGP' },
        options: {
            keepProducts: false,
            keepCustomers: false,
            keepEmployees: false,
            keepSettings: false,
            keepTreasuryAndWarehouses: false,
        }
    });

    useEffect(() => {
        // Fetch current DB path on mount
        const fetchDbPath = async () => {
            if (window.electronAPI && window.electronAPI.config) {
                try {
                    const res = await window.electronAPI.config.getDbPath();
                    const currentPath = extractIpcData(res, 'app:get-db-path');
                    if (currentPath) {
                        setDbPath(currentPath);
                        setOriginalDbPath(currentPath);
                    }
                } catch (err) {
                    console.error('Failed to fetch DB path:', err);
                }
            }
        };
        fetchDbPath();
    }, []);

    const handleBrowseDb = async () => {
        if (!window.electronAPI || !window.electronAPI.config) return;
        try {
            const res = await window.electronAPI.config.showOpenDialog();
            const folder = extractIpcData(res, 'dialog:showOpenDialog');
            if (folder) {
                setDbPath(folder);
            }
        } catch (err: any) {
            toast.error("Browse failed: " + err.message);
        }
    };

    const handleSaveDbConfig = async () => {
        if (!window.electronAPI || !window.electronAPI.config) return;
        setRestarting(true);
        try {
            toast.info("Saving configuration and restarting application...", { duration: 5000 });
            const res = await window.electronAPI.config.saveConfigAndRestart(dbPath);
            expectIpcOk(res, 'app:save-config-and-restart');
            // The app will close, so we don't necessarily need to reset loading
        } catch (error: any) {
            toast.error("Failed to update configuration: " + error.message);
            setRestarting(false);
        }
    };

    const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
    const prev = () => setStep(s => Math.max(s - 1, 0));

    const handleSetup = async () => {
        setLoading(true);
        try {
            const res = await performSetup(formData);
            if (res?.success) {
                toast.success("System set up successfully!");
                router.push("/login");
            } else {
                toast.error(res?.error || "Failed to set up system");
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to set up system");
        } finally {
            setLoading(false);
        }
    };

    const currentStep = STEPS[step];
    const Icon = currentStep.icon;

    // Check if the current step is the database step AND the path was changed
    const dbPathChanged = dbPath !== originalDbPath;

    return (
        <Card className="shadow-2xl border-slate-200">
            <CardHeader className="bg-slate-900 text-white rounded-t-lg">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500 rounded-lg">
                        <Icon className="w-6 h-6" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl">Casper ERP Setup</CardTitle>
                        <CardDescription className="text-slate-400">
                            {currentStep.title} — Step {step + 1} of {STEPS.length}
                        </CardDescription>
                    </div>
                </div>
                <Progress value={(step / (STEPS.length - 1)) * 100} className="h-1 mt-4 bg-slate-700" />
            </CardHeader>

            <CardContent className="py-8 min-h-[350px]">
                {step === 0 && (
                    <div className="space-y-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="text-4xl font-bold text-slate-900">Welcome to Casper ERP</h1>
                        <p className="text-lg text-slate-600 max-w-lg mx-auto">
                            We'll get your system ready in just a few minutes. Please follow the steps to configure your initial administrator account and business details.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                            {[
                                { t: 'Securely Configured', d: 'RBAC & CSRF built-in' },
                                { t: 'Atomic Integrity', d: 'Double-entry accounting' },
                                { t: 'Desktop Ready', d: 'Offline-first SQLite' }
                            ].map((f, i) => (
                                <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="font-bold text-slate-800">{f.t}</div>
                                    <div className="text-xs text-slate-500">{f.d}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="space-y-4">
                            <h2 className="text-2xl font-bold">Database Location</h2>
                            <p className="text-slate-600">
                                Select where you want Casper ERP to securely store your data. This must be a reliable, local drive.
                            </p>
                        </div>

                        <div className="grid gap-4 mt-6">
                            <div className="space-y-2">
                                <Label htmlFor="db-path">Storage Folder</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="db-path"
                                        value={dbPath}
                                        readOnly
                                        className="bg-slate-50 font-mono text-sm"
                                        placeholder="Loading default path..."
                                    />
                                    {window.electronAPI?.config && (
                                        <Button variant="secondary" onClick={handleBrowseDb} type="button" className="shrink-0 flex gap-2">
                                            <FolderOpen className="w-4 h-4" /> Browse...
                                        </Button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    The actual file `local.db` will be created inside this directory.
                                </p>
                            </div>

                            {dbPathChanged && (
                                <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
                                    <AlertCircle className="h-4 w-4 stroke-red-600" />
                                    <AlertTitle className="text-red-800 font-bold">Application Restart Required</AlertTitle>
                                    <AlertDescription className="text-red-700">
                                        Changing the database location requires the application to restart immediately to apply the new path and run initialization. You will resume setup after the restart.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="admin-username">Admin Username</Label>
                                <Input
                                    id="admin-username"
                                    value={formData.admin.username}
                                    onChange={e => setFormData({ ...formData, admin: { ...formData.admin, username: e.target.value } })}
                                    placeholder="admin"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="admin-name">Full Name</Label>
                                <Input
                                    id="admin-name"
                                    value={formData.admin.name}
                                    onChange={e => setFormData({ ...formData, admin: { ...formData.admin, name: e.target.value } })}
                                    placeholder="Store Manager"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="admin-password">Secure Password</Label>
                                <Input
                                    id="admin-password"
                                    type="password"
                                    value={formData.admin.password}
                                    onChange={e => setFormData({ ...formData, admin: { ...formData.admin, password: e.target.value } })}
                                    placeholder="••••••••"
                                />
                                <p className="text-xs text-slate-500 italic">This will be your primary administrative login.</p>
                            </div>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="br-name">Business / Branch Name</Label>
                                <Input
                                    id="br-name"
                                    value={formData.branch.name}
                                    onChange={e => setFormData({ ...formData, branch: { ...formData.branch, name: e.target.value } })}
                                    placeholder="Casper Store #1"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="br-type">Business Type</Label>
                                <select
                                    id="br-type"
                                    className="w-full p-2 bg-white border border-slate-200 rounded-lg"
                                    value={formData.branch.type}
                                    onChange={e => setFormData({ ...formData, branch: { ...formData.branch, type: e.target.value } })}
                                >
                                    <option value="RETAIL">Retail Store</option>
                                    <option value="WHOLESALE">Wholesale</option>
                                    <option value="SERVICE">Service Center</option>
                                    <option value="HOSPITALITY">Restaurant / Cafe</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="tax">Standard Tax Rate (%)</Label>
                                <Input
                                    id="tax"
                                    type="number"
                                    value={formData.settings.taxRate}
                                    onChange={e => setFormData({ ...formData, settings: { ...formData.settings, taxRate: Number(e.target.value) } })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="currency">Base Currency Code</Label>
                                <Input
                                    id="currency"
                                    value={formData.settings.currency}
                                    onChange={e => setFormData({ ...formData, settings: { ...formData.settings, currency: e.target.value.toUpperCase() } })}
                                    placeholder="EGP"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === 5 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="space-y-4">
                            <h2 className="text-2xl font-bold text-slate-900">Data Retention Options</h2>
                            <p className="text-sm text-slate-500">
                                Select which data you want to <span className="font-bold text-indigo-600">KEEP</span> from the previous installation. 
                                Unchecked items will be permanently wiped.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { id: 'keepProducts', label: 'Keep Products', desc: 'Preserves categories, products, models and units.', icon: FolderOpen },
                                { id: 'keepCustomers', label: 'Keep CRM Data', desc: 'Preserves customer and supplier directories.', icon: Shield },
                                { id: 'keepEmployees', label: 'Keep Employees', desc: 'Preserves users, technicians and roles.', icon: Building },
                                { id: 'keepTreasuryAndWarehouses', label: 'Keep Infrastructure', desc: 'Preserves your treasuries and warehouses.', icon: Database },
                            ].map((opt) => (
                                <div 
                                    key={opt.id} 
                                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                                        (formData.options as any)[opt.id] 
                                            ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600' 
                                            : 'border-slate-100 bg-white hover:border-slate-200'
                                    }`}
                                    onClick={() => setFormData({
                                        ...formData,
                                        options: {
                                            ...formData.options,
                                            [opt.id]: !(formData.options as any)[opt.id]
                                        }
                                    })}
                                >
                                    <div className={`p-2 rounded-lg ${
                                        (formData.options as any)[opt.id] ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                                    }`}>
                                        <opt.icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-900">{opt.label}</div>
                                        <div className="text-[10px] text-slate-500 leading-tight">{opt.desc}</div>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                        (formData.options as any)[opt.id] ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'
                                    }`}>
                                        {(formData.options as any)[opt.id] && <CheckCircle2 className="w-3 h-3 text-white" />}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                            <AlertCircle className="w-4 h-4 stroke-amber-600" />
                            <AlertTitle className="font-bold">Important Notice</AlertTitle>
                            <AlertDescription className="text-xs">
                                Financial transactions, sales, and purchase history will ALWAYS be wiped during setup to ensure accounting integrity.
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                {step === 6 && (
                    <div className="text-center space-y-6 animate-in zoom-in duration-500">
                        <div className="flex justify-center">
                            <div className="p-4 bg-green-100 rounded-full">
                                <CheckCircle2 className="w-16 h-16 text-green-600" />
                            </div>
                        </div>
                        <h2 className="text-3xl font-bold">Configuration Complete</h2>
                        <p className="text-slate-600">
                            You're all set! Clicking finish will create your admin account, set up your first branch, initialize the accounting system, and prepare the database.
                        </p>
                        <div className="bg-slate-50 p-4 rounded-lg text-left text-sm space-y-1">
                            <div className="flex justify-between"><span>Database:</span> <span className="font-mono text-xs">{dbPath || "Default"}</span></div>
                            <div className="flex justify-between"><span>Admin User:</span> <span className="font-mono">{formData.admin.username}</span></div>
                            <div className="flex justify-between"><span>Branch:</span> <span>{formData.branch.name}</span></div>
                            <div className="flex justify-between"><span>Tax Rate:</span> <span>{formData.settings.taxRate}%</span></div>
                        </div>
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex justify-between p-6 bg-slate-50 border-t rounded-b-lg">
                <Button
                    variant="outline"
                    onClick={prev}
                    disabled={step === 0 || loading || restarting}
                >
                    Previous
                </Button>

                {step === 1 && dbPathChanged ? (
                    <Button
                        variant="destructive"
                        className="w-48"
                        onClick={handleSaveDbConfig}
                        disabled={restarting}
                    >
                        {restarting ? <CasperLoader width={24} /> : 'Apply & Restart'}
                    </Button>
                ) : step < STEPS.length - 1 ? (
                    <Button
                        className="bg-slate-900 hover:bg-slate-800"
                        onClick={next}
                        disabled={(step === 2 && !formData.admin.password) || restarting}
                    >
                        Next Step
                    </Button>
                ) : (
                    <Button
                        className="bg-indigo-600 hover:bg-indigo-700 w-32"
                        onClick={handleSetup}
                        disabled={loading || restarting}
                    >
                        {loading ? <CasperLoader width={24} /> : 'Finish Setup'}
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
