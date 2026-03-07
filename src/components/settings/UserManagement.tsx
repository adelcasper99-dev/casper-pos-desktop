'use client'

import { useState } from 'react'
import { Plus, Trash2, User as UserIcon, Shield, ShieldAlert, Loader2, Edit, Eye, EyeOff, Lock } from 'lucide-react'
import { createUser, deleteUser, updateUser } from '@/actions/users'
import GlassModal from '@/components/ui/GlassModal'
import { useTranslations } from '@/lib/i18n-mock'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from '@/lib/utils'

type UserType = {
    id: string
    name: string | null
    username: string
    roleStr: string
    role?: { id: string, name: string } | null
    branch?: { id: string, name: string } | null
    salary?: number | string
    maxDiscount?: number | string | null
    maxDiscountAmount?: number | string | null
    createdAt: Date | string
    isGlobalAdmin?: boolean
}

export default function UserManagement({ users, roles, branches, branchId, currentUser }: { users: any[], roles: any[], branches: any[], branchId?: string, currentUser: any }) {
    const t = useTranslations('UserManagement')
    const router = useRouter()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [editingUser, setEditingUser] = useState<any | null>(null)
    const [showPassword, setShowPassword] = useState(false)

    if (!currentUser) return null;

    const isAdminCheck = (roleStr: string) => roleStr === 'ADMIN' || roleStr === 'مدير النظام' || roleStr === 'المالك';
    const isUserAdmin = isAdminCheck(currentUser.role) || (currentUser.permissions && currentUser.permissions.includes('*'));

    const filteredRoles = isUserAdmin
        ? roles
        : roles.filter(role => {
            const roleName = role.name.toUpperCase();
            // Non-admins cannot see/assign Admin role
            if (roleName === 'ADMIN' || roleName === 'ADMINISTRATOR' || roleName === 'مدير النظام' || roleName === 'المالك') return false;

            // Non-admins can only assign roles whose permissions are a subset of their own
            let rolePerms: string[] = [];
            try {
                rolePerms = typeof role.permissions === 'string' ? JSON.parse(role.permissions || '[]') : role.permissions || [];
            } catch (e) {
                rolePerms = [];
            }

            // Explicitly block system configuration permissions for non-admins
            const forbiddenPerms = ['MANAGE_SETTINGS', 'MANAGE_ROLES'];
            if (forbiddenPerms.some(p => rolePerms.includes(p))) return false;

            const userPerms = currentUser.permissions || [];
            return rolePerms.every(p => userPerms.includes(p));
        });

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        const data = Object.fromEntries(formData)

        // Set name to username if not provided
        if (!data.name || data.name === '') {
            data.name = data.username
        }

        let res;
        if (editingUser) {
            res = await updateUser(editingUser.id, data as any)
        } else {
            res = await createUser(data as any)
        }

        setLoading(false)
        if (res.success) {
            setIsModalOpen(false)
            setEditingUser(null)
            setShowPassword(false)
            router.refresh()
        } else {
            const errorKey = editingUser ? 'errors.updateError' : 'errors.createError';
            alert(res.error || t(errorKey))
        }
    }

    async function handleDelete(id: string) {
        if (!confirm(t('errors.deleteConfirm'))) return
        setDeletingId(id)
        const res = await deleteUser({ id })

        if (res.success) {
            router.refresh()
        } else {
            alert(res.error || t('errors.deleteError'))
            setDeletingId(null)
        }
    }

    function openAddModal() {
        setEditingUser(null)
        setShowPassword(false)
        setIsModalOpen(true)
    }

    function openEditModal(user: any) {
        setEditingUser(user)
        setShowPassword(false)
        setIsModalOpen(true)
    }

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-cyan-400" />
                    {t('title')}
                </h2>
                <button
                    onClick={openAddModal}
                    className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t('addUser')}
                </button>
            </div>

            <div className="glass-card overflow-hidden bg-card/50">
                <table className="w-full text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                        <tr>
                            <th className="p-4">{t('username')}</th>
                            <th className="p-4">{t('role')}</th>
                            <th className="p-4">{t('branch')}</th>
                            <th className="p-4 text-center">Max Discount (%)</th>
                            <th className="p-4 text-center">Max Amount</th>
                            <th className="p-4 text-right">{t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {users.map((user: any) => {
                            const isAdmin = isAdminCheck(user.roleStr) || isAdminCheck(user.role?.name) || user.isGlobalAdmin;
                            const forbiddenPerms = ['MANAGE_SETTINGS', 'MANAGE_ROLES'];

                            let targetPerms: string[] = [];
                            try {
                                targetPerms = typeof user.role?.permissions === 'string' ? JSON.parse(user.role?.permissions || '[]') : user.role?.permissions || [];
                            } catch (e) {
                                targetPerms = [];
                            }

                            const userPerms = currentUser.permissions || [];
                            const isSubset = targetPerms.every(p => userPerms.includes(p));
                            const hasForbidden = targetPerms.some(p => forbiddenPerms.includes(p));

                            // Managers can only modify users who are NOT admins, 
                            // whose permissions are a subset of their own,
                            // AND who don't have forbidden system permissions.
                            const canModify = isUserAdmin || (!isAdmin && isSubset && !hasForbidden);

                            const rawRoleName = user.role?.name || user.roleStr;

                            // Safe translation with fallback
                            const roleKey = `roles.${rawRoleName?.toUpperCase()}`;
                            const translated = t(roleKey);
                            const roleName = translated === roleKey ? rawRoleName : translated;

                            const branchName = user.branch?.name || '-';

                            return (
                                <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                                    <td className="p-4 text-muted-foreground font-mono text-sm font-medium text-foreground">{user.username}</td>
                                    <td className="p-4">
                                        <span className={cn(
                                            "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border",
                                            isAdmin
                                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                                : 'bg-green-500/10 text-green-400 border-green-500/20'
                                        )}>
                                            {isAdmin ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                                            {roleName}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm text-zinc-400">{branchName}</td>
                                    <td className="p-4 text-center text-sm font-bold text-cyan-400">
                                        {user.maxDiscount ? `${user.maxDiscount}%` : '0%'}
                                    </td>
                                    <td className="p-4 text-center text-sm font-bold text-green-400">
                                        {user.maxDiscountAmount ? `$${user.maxDiscountAmount}` : '$0'}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        {canModify ? (
                                            <>
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="text-cyan-400 hover:bg-cyan-500/10 p-2 rounded-lg transition-colors"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    disabled={deletingId === user.id}
                                                    className="text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors disabled:opacity-50"
                                                >
                                                    {deletingId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </>
                                        ) : (
                                            <div className="p-2 text-zinc-500 opacity-50 cursor-not-allowed" title="System Administrator Locked">
                                                <Lock className="w-4 h-4" />
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                    {t('noUsers')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <GlassModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false)
                    setShowPassword(false)
                }}
                title={editingUser ? t('editUser') : t('addUser')}
            >
                <form action={handleSubmit} className="space-y-4">
                    <input type="hidden" name="name" value="" />

                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('username')}</label>
                        <input
                            name="username"
                            type="text"
                            className="w-full glass-input"
                            required
                            placeholder="e.g. cashier1"
                            defaultValue={editingUser?.username}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                            {t('password')}
                            {editingUser && <span className="text-muted-foreground text-xs font-normal ml-2">{t('passwordHint')}</span>}
                        </label>
                        <div className="relative">
                            <input
                                name="password"
                                type={showPassword ? "text" : "password"}
                                className="w-full glass-input pr-10"
                                required={!editingUser}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('role')}</label>
                        <Select
                            name="roleId"
                            defaultValue={editingUser?.role?.id || editingUser?.roleId || ''}
                            required
                        >
                            <SelectTrigger className="w-full glass-input bg-card text-foreground">
                                <SelectValue placeholder={t('selectRole') || "Select Role"} />
                            </SelectTrigger>
                            <SelectContent>
                                {filteredRoles.map((role: any) => {
                                    const roleKey = `roles.${role.name.toUpperCase()}`;
                                    const translated = t(roleKey);
                                    const roleName = translated === roleKey ? role.name : translated;

                                    return (
                                        <SelectItem key={role.id} value={role.id}>{roleName}</SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {branchId ? (
                        <input type="hidden" name="branchId" value={branchId} />
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('assignedBranch')}</label>
                            <Select
                                name="branchId"
                                defaultValue={editingUser?.branch?.id || editingUser?.branchId || ''}
                                required
                            >
                                <SelectTrigger className="w-full glass-input bg-card text-foreground">
                                    <SelectValue placeholder={t('selectBranch') || "Select Branch"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {branches.map((b: any) => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Max Discount (%)</label>
                        <input
                            name="maxDiscount"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="w-full glass-input"
                            placeholder="e.g. 10"
                            defaultValue={editingUser?.maxDiscount ?? ''}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Maximum discount percentage this user can apply in POS (0 to 100).</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Max Discount (Amount)</label>
                        <input
                            name="maxDiscountAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full glass-input"
                            placeholder="e.g. 50"
                            defaultValue={editingUser?.maxDiscountAmount ?? ''}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Maximum fixed discount amount this user can apply in POS.</p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-cyan-500 text-black font-bold p-3 rounded-xl flex items-center justify-center gap-2 hover:bg-cyan-400 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingUser ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />)}
                        {editingUser ? t('updateUser') : t('addUser')}
                    </button>
                </form >
            </GlassModal >
        </div >
    )
}
