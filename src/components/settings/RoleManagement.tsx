"use client";

import { useState, useEffect } from "react";
import { getRoles, createRole, updateRole, deleteRole } from "@/actions/roles";
import { PERMISSION_GROUPS, PERMISSION_DEPENDENCIES, SYSTEM_ROLES, getPermissionDisplayName } from "@/lib/permissions";
import { Loader2, Plus, Trash2, Edit, Shield, Check, Lock, Zap, ShieldCheck, ShieldAlert, Save } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n-mock";

interface Role {
    id: string;
    name: string;
    permissions: string; // JSON string
    _count?: { users: number };
}

interface UserSession {
    id: string;
    role: string;
    permissions?: string[];
    [key: string]: any;
}

interface RoleManagementProps {
    initialRoles?: Role[];
    currentUser?: UserSession;
}

export default function RoleManagement({ initialRoles = [], currentUser }: RoleManagementProps) {
    const t = useTranslations('RoleManagement');
    const isAdminCheck = (role: string | undefined) => role === 'ADMIN' || role === 'مدير النظام' || role === 'المالك';
    const isUserAdmin = isAdminCheck(currentUser?.role) || currentUser?.permissions?.includes('*');
    const forbiddenPerms = ['MANAGE_SETTINGS', 'MANAGE_ROLES'];

    const getRolePerms = (role: Role): string[] => {
        try { return JSON.parse(role.permissions || '[]'); } catch (e) { return []; }
    };

    const [roles, setRoles] = useState<Role[]>(initialRoles);
    const [loading, setLoading] = useState(initialRoles.length === 0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [roleName, setRoleName] = useState("");
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (initialRoles.length === 0) loadRoles();
    }, []);

    const loadRoles = async () => {
        setLoading(true);
        const res = await getRoles();
        if (res.success && res.data) setRoles(res.data);
        setLoading(false);
    };

    const canManageRole = (role: Role) => {
        if (isUserAdmin) return true;
        const roleNm = role.name.toUpperCase();
        if (roleNm === 'ADMIN' || roleNm === 'ADMINISTRATOR' || roleNm === 'مدير النظام' || roleNm === 'المالك') return false;
        const rolePerms = getRolePerms(role);
        if (forbiddenPerms.some(p => rolePerms.includes(p))) return false;
        const userPerms = currentUser?.permissions || [];
        return rolePerms.every(p => userPerms.includes(p));
    };

    const togglePermission = (perm: string) => {
        if (selectedPermissions.includes(perm)) {
            setSelectedPermissions(selectedPermissions.filter(p => p !== perm));
        } else {
            const newPerms = [...selectedPermissions, perm];
            (PERMISSION_DEPENDENCIES[perm] || []).forEach(dep => {
                if (!newPerms.includes(dep)) newPerms.push(dep);
            });
            setSelectedPermissions(newPerms);
        }
    };

    const handleSave = async () => {
        if (!roleName) return;
        setIsSaving(true);
        const res = editingRole ? await updateRole(editingRole.id, roleName, selectedPermissions) : await createRole(roleName, selectedPermissions);
        setIsSaving(false);
        if (res.success) {
            setIsModalOpen(false);
            loadRoles();
            toast.success("Role configuration synchronized");
        } else {
            toast.error(res.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Confirm complete removal of this security role?")) return;
        setLoading(true);
        const res = await deleteRole(id);
        setLoading(false);
        if (res.success) loadRoles();
        else toast.error(res.message);
    };

    if (loading && roles.length === 0) return <div className="flex items-center justify-center p-24"><Loader2 className="animate-spin text-primary w-10 h-10" /></div>;

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            {/* Component Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black flex items-center gap-3 text-foreground uppercase tracking-tight">
                        <Shield className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                        {t('title')}
                    </h2>
                    <p className="text-xs uppercase font-black tracking-widest text-muted-foreground ml-9 opacity-70">Define hierarchical access control and permissions</p>
                </div>
                <button
                    onClick={() => { setEditingRole(null); setRoleName(""); setSelectedPermissions([]); setIsModalOpen(true); }}
                    className="group relative inline-flex items-center justify-center gap-2 bg-primary px-8 py-3 rounded-2xl text-white font-black text-xs uppercase tracking-widest overflow-hidden transition-all hover:scale-[1.05] active:scale-[0.98] shadow-xl shadow-primary/20"
                >
                    <Plus className="w-4 h-4" />
                    {t('addRole')}
                </button>
            </div>

            {/* Roles Matrix Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {roles.map(role => {
                    let permCount = 0;
                    try { permCount = JSON.parse(role.permissions).length } catch (e) { }
                    const isSystemRole = SYSTEM_ROLES.includes(role.name as any);
                    const canEdit = canManageRole(role);

                    return (
                        <div key={role.id} className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-border/40 shadow-xl group transition-all duration-500 hover:scale-[1.02] hover:border-primary/40 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{role.name}</h3>
                                        {isSystemRole && (
                                            <span className="text-[8px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full font-black uppercase tracking-widest shadow-sm shadow-cyan-500/5">
                                                Locked
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 leading-none">
                                        Linked to <span className="text-primary">{role._count?.users || 0}</span> Assets
                                    </p>
                                </div>

                                <div className="flex gap-2">
                                    {canEdit ? (
                                        <>
                                            <button 
                                                onClick={() => { setEditingRole(role); setRoleName(role.name); setSelectedPermissions(getRolePerms(role)); setIsModalOpen(true); }}
                                                className="w-10 h-10 rounded-xl bg-card border border-border/40 text-primary flex items-center justify-center hover:bg-primary/10 transition-all shadow-lg"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            {!isSystemRole && (
                                                <button 
                                                    onClick={() => handleDelete(role.id)}
                                                    className="w-10 h-10 rounded-xl bg-card border border-border/40 text-rose-400 flex items-center justify-center hover:bg-rose-500/10 transition-all shadow-lg"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="w-10 h-10 rounded-xl bg-background/20 border border-border/20 text-muted-foreground/30 flex items-center justify-center">
                                            <Lock className="w-4 h-4" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-4 relative z-10">
                                <span className={cn(
                                    "px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-widest shadow-sm transition-all",
                                    permCount > 0 ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-indigo-500/5" : "bg-muted/10 text-muted-foreground border-border/20"
                                )}>
                                    {permCount} Access Points
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Premium Role Configuration Modal */}
            <GlassModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingRole ? "Role Engineering" : "Role Initialization"}
                className="max-w-5xl"
            >
                <div className="space-y-8 p-2">
                    <div className="space-y-2 group">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-1 group-focus-within:text-primary transition-colors">Role Categorization</label>
                        <input
                            className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-2xl py-4 px-6 text-sm font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-inner"
                            value={roleName}
                            onChange={(e) => setRoleName(e.target.value)}
                            placeholder="e.g. CORE_CASHIER"
                        />
                    </div>

                    <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar">
                        <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 flex items-center gap-2">
                            <Zap className="w-3 h-3 text-primary" /> Authority Matrix
                        </div>

                        {Object.entries(PERMISSION_GROUPS).map(([group, allPerms]) => {
                            const perms = isUserAdmin ? allPerms : allPerms.filter(p => !forbiddenPerms.includes(p) && (currentUser?.permissions || []).includes(p));
                            if (perms.length === 0) return null;

                            const allSelected = perms.every(p => selectedPermissions.includes(p));
                            const someSelected = perms.some(p => selectedPermissions.includes(p)) && !allSelected;

                            return (
                                <div key={group} className="glass-card bg-card/20 rounded-[2rem] border border-border/40 overflow-hidden shadow-xl transition-all hover:bg-card/30">
                                    <div className="flex items-center justify-between p-5 bg-muted/40 border-b border-border/40">
                                        <div className="flex flex-col">
                                            <h4 className="text-[10px] font-black text-foreground uppercase tracking-[0.2em]">{group}</h4>
                                            <span className="text-[8px] font-bold text-muted-foreground/60 uppercase">Scope Definitions</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (allSelected) setSelectedPermissions(selectedPermissions.filter(p => !perms.includes(p as any)));
                                                else {
                                                    const newPerms = [...selectedPermissions];
                                                    perms.forEach(p => { if (!newPerms.includes(p as any)) newPerms.push(p as any); });
                                                    setSelectedPermissions(newPerms);
                                                }
                                            }}
                                            className={cn(
                                                "text-[8px] px-3 py-1.5 rounded-full transition-all font-black uppercase tracking-widest border",
                                                allSelected ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : someSelected ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/40" : "bg-card/40 text-muted-foreground border-border/40 hover:bg-card"
                                            )}
                                        >
                                            {allSelected ? "Revoke Group" : "Authorize All"}
                                        </button>
                                    </div>
                                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {perms.map((perm) => {
                                            const isActive = selectedPermissions.includes(perm as any);
                                            return (
                                                <label key={perm} className={cn(
                                                    "flex items-center gap-3 p-4 rounded-[1.25rem] border transition-all duration-300 cursor-pointer group/perm select-none",
                                                    isActive 
                                                        ? "bg-primary/5 border-primary/40 shadow-sm" 
                                                        : "bg-transparent border-transparent hover:bg-muted/30"
                                                )}>
                                                    <div className={cn(
                                                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
                                                        isActive 
                                                            ? "bg-primary border-primary shadow-lg shadow-primary/20 scale-110" 
                                                            : "bg-background/40 border-border group-hover/perm:border-primary/40"
                                                    )}>
                                                        {isActive && <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={isActive}
                                                        onChange={() => togglePermission(perm as any)}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className={cn(
                                                            "text-xs font-black uppercase tracking-tight transition-colors",
                                                            isActive ? "text-foreground" : "text-muted-foreground opacity-60"
                                                        )}>
                                                            {getPermissionDisplayName(perm as any, 'ar')}
                                                        </span>
                                                        <span className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-widest">{perm}</span>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Operational Commitment */}
                    <div className="flex justify-end pt-6 border-t border-border/20">
                        <button
                            onClick={handleSave}
                            disabled={!roleName || isSaving}
                            className="group relative inline-flex items-center justify-center gap-3 bg-primary px-12 py-4 rounded-2xl text-white font-black uppercase tracking-widest overflow-hidden transition-all hover:scale-[1.05] active:scale-[0.98] disabled:opacity-30 shadow-2xl shadow-primary/20"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                            {isSaving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                            Commit Security Profile
                        </button>
                    </div>
                </div>
            </GlassModal>
        </div>
    );
}
