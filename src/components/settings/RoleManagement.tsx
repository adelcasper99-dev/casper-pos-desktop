"use client";

import { useState, useEffect } from "react";
import { getRoles, createRole, updateRole, deleteRole } from "@/actions/roles";
import { PERMISSION_GROUPS, PERMISSION_DEPENDENCIES, SYSTEM_ROLES, getPermissionDisplayName, Permission } from "@/lib/permissions";
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
    [key: string]: unknown;
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
        <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300 pb-14">
            {/* Component Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                        <Shield className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-black text-foreground uppercase tracking-tight leading-none">
                            {t('title')}
                        </h2>
                        <p className="text-[10px] font-bold text-muted-foreground/70 mt-0.5">Define hierarchical access control and permissions</p>
                    </div>
                </div>
                <button
                    onClick={() => { setEditingRole(null); setRoleName(""); setSelectedPermissions([]); setIsModalOpen(true); }}
                    className="group relative inline-flex items-center justify-center gap-1.5 bg-primary px-3.5 h-8 rounded-xl text-white font-black text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-primary/20"
                >
                    <Plus className="w-3.5 h-3.5" />
                    {t('addRole')}
                </button>
            </div>

            {/* Roles Matrix Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {roles.map(role => {
                    let permCount = 0;
                    try { permCount = JSON.parse(role.permissions).length } catch (e) { }
                    const isSystemRole = (SYSTEM_ROLES as readonly string[]).includes(role.name);
                    const canEdit = canManageRole(role);

                    return (
                        <div key={role.id} className="glass-card bg-card/90 dark:bg-card/40 backdrop-blur-xl p-3.5 rounded-xl border border-border/40 shadow-sm group transition-all duration-300 hover:border-primary/40 relative overflow-hidden">
                            <div className="flex justify-between items-start mb-2.5 relative z-10">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-sm font-black uppercase tracking-tight text-foreground">{role.name}</h3>
                                        {isSystemRole && (
                                            <span className="text-[8px] px-1.5 py-0.2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-md font-black uppercase tracking-wider">
                                                Locked
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] font-bold text-muted-foreground/60 leading-none">
                                        Linked to <span className="text-primary font-black">{role._count?.users || 0}</span> Assets
                                    </p>
                                </div>

                                <div className="flex gap-1">
                                    {canEdit ? (
                                        <>
                                            <button 
                                                onClick={() => { setEditingRole(role); setRoleName(role.name); setSelectedPermissions(getRolePerms(role)); setIsModalOpen(true); }}
                                                className="w-7 h-7 rounded-lg bg-card border border-border/40 text-primary flex items-center justify-center hover:bg-primary/10 transition-all shadow-xs"
                                                title="Edit"
                                            >
                                                <Edit className="w-3.5 h-3.5" />
                                            </button>
                                            {!isSystemRole && (
                                                <button 
                                                    onClick={() => handleDelete(role.id)}
                                                    className="w-7 h-7 rounded-lg bg-card border border-border/40 text-rose-400 flex items-center justify-center hover:bg-rose-500/10 transition-all shadow-xs"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="w-7 h-7 rounded-lg bg-background/20 border border-border/20 text-muted-foreground/30 flex items-center justify-center">
                                            <Lock className="w-3 h-3" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 relative z-10">
                                <span className={cn(
                                    "px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider shadow-xs transition-all",
                                    permCount > 0 ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-muted/10 text-muted-foreground border-border/20"
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
                className="max-w-4xl"
            >
                <div className="space-y-3 p-1 max-h-[80vh] overflow-y-auto pr-1 custom-scrollbar">
                    <div className="space-y-1 group">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1 group-focus-within:text-primary transition-colors">Role Categorization</label>
                        <input
                            className="w-full bg-background/60 dark:bg-background/40 border border-border/40 rounded-xl h-8 px-3 text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary transition-all shadow-inner"
                            value={roleName}
                            onChange={(e) => setRoleName(e.target.value)}
                            placeholder="e.g. CORE_CASHIER"
                        />
                    </div>

                    <div className="space-y-2.5 max-h-[58vh] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider ml-1 flex items-center gap-1.5">
                            <Zap className="w-3 h-3 text-primary" /> Authority Matrix
                        </div>

                        {Object.entries(PERMISSION_GROUPS).map(([group, allPerms]) => {
                            const perms = isUserAdmin ? allPerms : allPerms.filter(p => !forbiddenPerms.includes(p) && (currentUser?.permissions || []).includes(p));
                            if (perms.length === 0) return null;

                            const allSelected = perms.every(p => selectedPermissions.includes(p));
                            const someSelected = perms.some(p => selectedPermissions.includes(p)) && !allSelected;

                            return (
                                <div key={group} className="glass-card bg-card/20 rounded-xl border border-border/40 overflow-hidden shadow-sm transition-all hover:bg-card/30">
                                    <div className="flex items-center justify-between py-1.5 px-3 bg-muted/40 border-b border-border/40">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-[10px] font-black text-foreground uppercase tracking-wider">{group}</h4>
                                            <span className="text-[8px] font-bold text-muted-foreground/60 uppercase">Scope</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (allSelected) setSelectedPermissions(selectedPermissions.filter(p => !(perms as string[]).includes(p)));
                                                else {
                                                    const newPerms = [...selectedPermissions];
                                                    perms.forEach(p => { if (!newPerms.includes(p)) newPerms.push(p); });
                                                    setSelectedPermissions(newPerms);
                                                }
                                            }}
                                            className={cn(
                                                "text-[8px] px-2 py-0.5 rounded-md transition-all font-black uppercase tracking-wider border",
                                                allSelected ? "bg-primary text-white border-primary shadow-xs" : someSelected ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/40" : "bg-card/40 text-muted-foreground border-border/40 hover:bg-card"
                                            )}
                                        >
                                            {allSelected ? "Revoke Group" : "Authorize All"}
                                        </button>
                                    </div>
                                    <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                        {perms.map((perm) => {
                                            const isActive = selectedPermissions.includes(perm);
                                            return (
                                                <label key={perm} className={cn(
                                                    "flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 cursor-pointer group/perm select-none",
                                                    isActive 
                                                        ? "bg-primary/5 border-primary/40 shadow-xs" 
                                                        : "bg-transparent border-transparent hover:bg-muted/30"
                                                )}>
                                                    <div className={cn(
                                                        "w-4 h-4 rounded border flex items-center justify-center transition-all duration-200",
                                                        isActive 
                                                            ? "bg-primary border-primary scale-105" 
                                                            : "bg-background/40 border-border group-hover/perm:border-primary/40"
                                                    )}>
                                                        {isActive && <Check className="w-3 h-3 text-white stroke-[3px]" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={isActive}
                                                        onChange={() => togglePermission(perm)}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className={cn(
                                                            "text-[11px] font-black uppercase tracking-tight transition-colors",
                                                            isActive ? "text-foreground" : "text-muted-foreground opacity-70"
                                                        )}>
                                                            {getPermissionDisplayName(perm as Permission, 'ar')}
                                                        </span>
                                                        <span className="text-[7px] font-bold text-muted-foreground/40 uppercase tracking-wider">{perm}</span>
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
                    <div className="flex justify-end pt-2 border-t border-border/20">
                        <button
                            onClick={handleSave}
                            disabled={!roleName || isSaving}
                            className="group relative inline-flex items-center justify-center gap-2 bg-primary px-6 h-8 rounded-xl text-white font-black text-xs uppercase tracking-wider overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 shadow-md shadow-primary/20"
                        >
                            {isSaving ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                            Commit Security Profile
                        </button>
                    </div>
                </div>
            </GlassModal>
        </div>
    );
}
