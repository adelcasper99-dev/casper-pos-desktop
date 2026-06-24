'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Cloud, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CloudConfigManager, CloudConfig } from "@/utils/cloudConfigManager";

export default function CloudSettings() {
    const [config, setConfig] = useState<CloudConfig>({
        enabled: false,
        cloudUrl: '',
        branchId: '',
        syncSecret: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        CloudConfigManager.getCloudConfig().then(c => {
            setConfig(c);
            setLoading(false);
        });

        const unsub = CloudConfigManager.onConfigUpdated((newConfig) => {
            setConfig(newConfig);
        });
        return () => unsub();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await CloudConfigManager.saveCloudConfig(config);
            if (res.success) {
                toast.success('Cloud settings saved successfully. Sync worker restarted.');
            } else {
                toast.error(`Failed to save: ${res.error}`);
            }
        } catch (error: any) {
            toast.error(error.message || 'An error occurred while saving.');
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        if (!config.cloudUrl) {
            toast.error('Please enter a Cloud URL first.');
            return;
        }

        setTesting(true);
        try {
            const res = await fetch(`${config.cloudUrl}/api/health`, {
                method: 'GET',
                // Optional: headers if your health endpoint needs them
            });
            
            if (res.ok) {
                toast.success('Connection successful! Cloud server is reachable.');
            } else {
                toast.error(`Connected but returned status: ${res.status}`);
            }
        } catch (error: any) {
            toast.error(`Connection failed: ${error.message}. Please check the URL and your network.`);
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <Card className="glass-card bg-card/40 border-border/40 overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/50" />
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-500">
                            <Cloud className="w-5 h-5" />
                        </div>
                        <div>
                            <CardTitle className="text-xl">Cloud Connection Settings</CardTitle>
                            <CardDescription>
                                Optional settings to link this local terminal to the central Casper Cloud ERP. 
                                Leave disabled to operate strictly offline.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-background/50 border border-border/50">
                        <div className="space-y-0.5">
                            <Label className="text-base">Enable Cloud Synchronization</Label>
                            <p className="text-xs text-muted-foreground">Turn on background sync worker</p>
                        </div>
                        <Switch 
                            checked={config.enabled}
                            onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                        />
                    </div>

                    <div className={`space-y-4 transition-all duration-300 ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="space-y-2">
                            <Label htmlFor="cloudUrl">Cloud ERP URL</Label>
                            <Input 
                                id="cloudUrl"
                                placeholder="https://cloud.casper-erp.com"
                                value={config.cloudUrl}
                                onChange={(e) => setConfig({ ...config, cloudUrl: e.target.value })}
                                className="bg-background/50"
                            />
                            <p className="text-[10px] text-muted-foreground">The public URL of your centralized PostgreSQL Next.js server.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="branchId">Branch ID</Label>
                                <Input 
                                    id="branchId"
                                    placeholder="branch-uuid"
                                    value={config.branchId}
                                    onChange={(e) => setConfig({ ...config, branchId: e.target.value })}
                                    className="bg-background/50 font-mono text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground">The UUID of this branch on the central server.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="syncSecret">Sync Secret (API Key)</Label>
                                <Input 
                                    id="syncSecret"
                                    type="password"
                                    placeholder="super-secret-key"
                                    value={config.syncSecret}
                                    onChange={(e) => setConfig({ ...config, syncSecret: e.target.value })}
                                    className="bg-background/50 font-mono text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground">Authentication key required for syncing.</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="bg-muted/20 flex items-center justify-between border-t border-border/10 p-6">
                    <Button 
                        variant="outline" 
                        onClick={handleTestConnection}
                        disabled={!config.cloudUrl || testing || !config.enabled}
                        className="bg-background/50 border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-600"
                    >
                        {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                        Test Connection
                    </Button>

                    <Button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                    >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Save Cloud Settings
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
