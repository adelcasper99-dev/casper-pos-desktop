"use client";

import { useState, useEffect } from "react";
import { getRoles, createRole, updateRole, deleteRole } from "@/actions/roles";
import { PERMISSION_GROUPS, PERMISSION_DEPENDENCIES, SYSTEM_ROLES } from "@/lib/permissions";
import { Loader2, Plus, Trash2, Edit, Shield, Check, Lock } from "lucide-react";
import GlassModal from "../ui/GlassModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
    const isAdminCheck = (role: string | undefined) => role === 'ADMIN' || role === 'مدير النظام' || role === 'المالك';
    const isUserAdmin = isAdminCheck(currentUser?.role) || currentUser?.permissions?.includes('*');
    const forbiddenPerms = ['MANAGE_SETTINGS', 'MANAGE_ROLES'];

    const getRolePerms = (role: Role): string[] => {
        try {
            return JSON.parse(role.permissions || '[]');
        } catch (e) {
            return [];
        }
    };

    const canManageRole = (role: Role) => {
        if (isUserAdmin) return true;

        const roleName = role.name.toUpperCase();
        if (roleName === 'ADMIN' || roleName === 'ADMINISTRATOR' || roleName === 'مدير النظام' || roleName === 'المالك') return false;

        const rolePerms = getRolePerms(role);

        // Cannot manage roles with forbidden permissions
        if (forbiddenPerms.some(p => rolePerms.includes(p))) return false;

        // Cannot manage roles with permissions the user doesn't have
        const userPerms = currentUser?.permissions || [];
        return rolePerms.every(p => userPerms.includes(p));
    };

    const [roles, setRoles] = useState<Role[]>(initialRoles);
    const [loading, setLoading] = useState(initialRoles.length === 0);
    const [error, setError] = useState("");

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    // Form State
    const [roleName, setRoleName] = useState("");
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (initialRoles.length === 0) {
            loadRoles();
        }
    }, []);

    const loadRoles = async () => {
        setLoading(true);
        const res = await getRoles();
        if (res.success && res.data) {
            setRoles(res.data);
        } else {
            setError(res.message || "Failed to load roles");
        }
        setLoading(false);
    };

    const handleOpenModal = (role?: Role) => {
        setEditingRole(role || null);
        setRoleName(role ? role.name : "");

        let perms: string[] = [];
        if (role) {
            try {
                perms = JSON.parse(role.permissions);
            } catch (e) {
                console.error(e);
            }
        }
        setSelectedPermissions(perms);
        setIsModalOpen(true);
    };

    const togglePermission = (perm: string) => {
        if (selectedPermissions.includes(perm)) {
            setSelectedPermissions(selectedPermissions.filter(p => p !== perm));
        } else {
            // Add the permission AND its dependencies
            const newPerms = [...selectedPermissions, perm];

            // Auto-add dependencies
            const deps = PERMISSION_DEPENDENCIES[perm] || [];
            deps.forEach(dep => {
                if (!newPerms.includes(dep)) {
                    newPerms.push(dep);
                }
            });

            setSelectedPermissions(newPerms);
        }
    };

    const handleSave = async () => {
        if (!roleName) return;
        setIsSaving(true);

        let res;
        if (editingRole) {
            res = await updateRole(editingRole.id, roleName, selectedPermissions);
        } else {
            res = await createRole(roleName, selectedPermissions);
        }

        setIsSaving(false);

        if (res.success) {
            setIsModalOpen(false);
            loadRoles();
        } else {
            toast.error(res.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This role will be deleted.")) return;
        setLoading(true);
        const res = await deleteRole(id);
        setLoading(false);
        if (res.success) {
            loadRoles();
        } else {
            toast.error(res.message);
        }
    };

    if (loading && roles.length === 0) return <div className="p-10 text-center"><Loader2 className="animate-spin inline" /></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Shield className="w-5 h-5 text-purple-400" />
                    Roles & Permissions
                </h2>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold text-sm transition-colors"
                >
                    <Plus className="w-4 h-4" /> New Role
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map(role => {
                    let permCount = 0;
                    try { permCount = JSON.parse(role.permissions).length } catch (e) { }

                    // Check if this is a system role using shared constant
                    // Cast to specific string literal union for type safety
                    const isSystemRole = SYSTEM_ROLES.includes(role.name as typeof SYSTEM_ROLES[number]);

                    return (
                        <div key={role.id} className="glass-card p-4 hover:border-purple-500/50 transition-colors group bg-card/50">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-lg text-foreground">{role.name}</h3>
                                        {isSystemRole && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded uppercase font-bold">
                                                System
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Assigned to {role._count?.users || 0} users
                                    </p>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {canManageRole(role) ? (
                                        <>
                                            <button onClick={() => handleOpenModal(role)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                                                <Edit className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(role.id)}
                                                className="p-1.5 hover:bg-red-500/20 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                disabled={isSystemRole}
                                                title={isSystemRole ? "System roles cannot be deleted" : "Delete role"}
                                            >
                                                <Trash2 className="w-4 h-4 text-red-400" />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="p-1.5 text-zinc-500" title="You do not have permission to manage this role">
                                            <Lock className="w-4 h-4" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2 text-xs">
                                <span className={cn(
                                    "px-2 py-1 rounded-md border",
                                    permCount > 0 ? "bg-purple-500/10 text-purple-300 border-purple-500/20" : "bg-muted text-muted-foreground border-border"
                                )}>
                                    {permCount} Permissions
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <GlassModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingRole ? "Edit Role" : "Create Role"}
                className="max-w-4xl"
            >
                <div className="space-y-6">
                    <div>
                        <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">Role Name</label>
                        <input
                            className="glass-input w-full"
                            value={roleName}
                            onChange={(e) => setRoleName(e.target.value)}
                            placeholder="e.g. Cashier"
                        />
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {Object.entries(PERMISSION_GROUPS).map(([group, allPerms]) => {
                            // Filter permissions based on user privileges
                            const perms = isUserAdmin
                                ? allPerms
                                : allPerms.filter(p => !forbiddenPerms.includes(p) && (currentUser?.permissions || []).includes(p));

                            if (perms.length === 0) return null;

                            const allSelected = perms.every(p => selectedPermissions.includes(p));
                            const someSelected = perms.some(p => selectedPermissions.includes(p)) && !allSelected;

                            const toggleGroup = () => {
                                if (allSelected) {
                                    // Deselect all in group
                                    setSelectedPermissions(selectedPermissions.filter(p => !(perms as unknown as string[]).includes(p)));
                                } else {
                                    // Select all in group
                                    const newPerms = [...selectedPermissions];
                                    perms.forEach(p => {
                                        if (!newPerms.includes(p)) newPerms.push(p);
                                    });
                                    setSelectedPermissions(newPerms);
                                }
                            };

                            return (
                                <div key={group} className="bg-card/30 rounded-lg border border-border/50 overflow-hidden">
                                    <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border/50">
                                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">{group}</h4>
                                        <button
                                            type="button"
                                            onClick={toggleGroup}
                                            className={cn(
                                                "text-[10px] px-2 py-1 rounded transition-colors font-bold uppercase",
                                                allSelected
                                                    ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                                                    : someSelected
                                                        ? "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            )}
                                        >
                                            {allSelected ? "Deselect All" : "Select All"}
                                        </button>
                                    </div>
                                    <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {perms.map((perm) => (
                                            <label key={perm} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer group transition-colors select-none">
                                                <div className={cn(
                                                    "w-5 h-5 rounded border flex items-center justify-center transition-all duration-200",
                                                    selectedPermissions.includes(perm)
                                                        ? "bg-purple-500 border-purple-500 shadow-sm shadow-purple-500/20"
                                                        : "border-border bg-transparent group-hover:border-purple-500/50"
                                                )}>
                                                    {selectedPermissions.includes(perm) && <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={selectedPermissions.includes(perm)}
                                                    onChange={() => togglePermission(perm)}
                                                />
                                                <span className={cn(
                                                    "text-sm transition-colors",
                                                    selectedPermissions.includes(perm) ? "text-foreground font-medium" : "text-muted-foreground"
                                                )}>
                                                    {perm.replace(/_/g, " ")}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-end pt-4 border-t border-border mt-4">
                        <button
                            onClick={handleSave}
                            disabled={!roleName || isSaving}
                            className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-purple-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving && <Loader2 className="animate-spin w-4 h-4" />}
                            Save Role
                        </button>
                    </div>
                </div>
            </GlassModal>
        </div>
    );
}
