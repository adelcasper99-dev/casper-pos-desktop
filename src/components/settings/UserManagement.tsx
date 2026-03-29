'use client'

import { useState } from 'react'
import { Plus, Trash2, User as UserIcon, Shield, ShieldAlert, Loader2, Edit, Eye, EyeOff, Lock, Users, Phone, MapPin, Receipt, Save } from 'lucide-react'
import { createUser, deleteUser, updateUser, checkPhoneLink } from '@/actions/users'
import GlassModal from '@/components/ui/GlassModal'
import ConfirmationModal from '@/components/ui/ConfirmationModal'
import { useTranslations } from '@/lib/i18n-mock'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function UserManagement({ users, roles, branches, branchId, currentUser }: { users: any[], roles: any[], branches: any[], branchId?: string, currentUser: any }) {
    const t = useTranslations('UserManagement')
    const router = useRouter()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [editingUser, setEditingUser] = useState<any | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [confirmDeleteModal, setConfirmDeleteModal] = useState<{ isOpen: boolean, id: string | null }>({ isOpen: false, id: null })
    const [confirmLinkModal, setConfirmLinkModal] = useState<{ isOpen: boolean, customer: any | null, formData: FormData | null }>({ isOpen: false, customer: null, formData: null })

    if (!currentUser) return null;

    const isAdminCheck = (roleStr: string) => roleStr === 'ADMIN' || roleStr === 'مدير النظام' || roleStr === 'المالك';
    const isUserAdmin = isAdminCheck(currentUser.role) || (currentUser.permissions && currentUser.permissions.includes('*'));

    const filteredRoles = isUserAdmin
        ? roles
        : roles.filter(role => {
            const roleName = role.name.toUpperCase();
            if (roleName === 'ADMIN' || roleName === 'ADMINISTRATOR' || roleName === 'مدير النظام' || roleName === 'المالك') return false;
            let rolePerms: string[] = [];
            try {
                rolePerms = typeof role.permissions === 'string' ? JSON.parse(role.permissions || '[]') : role.permissions || [];
            } catch (e) {
                rolePerms = [];
            }
            const forbiddenPerms = ['MANAGE_SETTINGS', 'MANAGE_ROLES'];
            if (forbiddenPerms.some(p => rolePerms.includes(p))) return false;
            const userPerms = currentUser.permissions || [];
            return rolePerms.every(p => userPerms.includes(p));
        });

    async function handleSubmit(formData: FormData, bypassLinkCheck = false) {
        setLoading(true)
        const data = Object.fromEntries(formData)
        if (!data.name || data.name === '') data.name = data.username
        const phone = data.phone as string;
        if (!bypassLinkCheck && phone && phone.length === 11) {
            const needsCheck = !editingUser || editingUser.phone !== phone;
            if (needsCheck) {
                const linkCheck = await checkPhoneLink(phone);
                if (linkCheck.exists && linkCheck.customer) {
                    setConfirmLinkModal({ isOpen: true, customer: linkCheck.customer, formData });
                    setLoading(false);
                    return;
                }
            }
        }

        let res;
        if (editingUser) res = await updateUser(editingUser.id, data as any)
        else res = await createUser(data as any)

        setLoading(false)
        if (res.success) {
            setIsModalOpen(false)
            setEditingUser(null)
            setShowPassword(false)
            setConfirmLinkModal({ isOpen: false, customer: null, formData: null })
            router.refresh()
            toast.success(editingUser ? t('success.updated') : t('success.created'))
        } else {
            toast.error(res.error || t(editingUser ? 'errors.updateError' : 'errors.createError'))
        }
    }

    async function handleDeleteConfirmed() {
        if (!confirmDeleteModal.id) return;
        setDeletingId(confirmDeleteModal.id)
        const res = await deleteUser({ id: confirmDeleteModal.id })
        if (res.success) {
            toast.success(t('success.deleted') || "User deleted successfully")
            setConfirmDeleteModal({ isOpen: false, id: null })
            router.refresh()
        } else {
            toast.error(res.error || t('errors.deleteError'))
        }
        setDeletingId(null)
    }

    async function handleLinkConfirmed() {
        if (!confirmLinkModal.formData) return;
        const finalData = new FormData();
        confirmLinkModal.formData.forEach((value, key) => finalData.append(key, value));
        finalData.append('confirmLink', 'true');
        await handleSubmit(finalData, true);
    }

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            {/* User Component Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black flex items-center gap-3 text-foreground uppercase tracking-tight">
                        <Users className="w-6 h-6 text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.5)]" />
                        {t('title')}
                    </h2>
                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-9 opacity-60">Manage staff identity and access privileges</p>
                </div>
                <button
                    onClick={() => { setEditingUser(null); setShowPassword(false); setIsModalOpen(true); }}
                    className="group relative inline-flex items-center justify-center gap-2 bg-primary px-8 py-3 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest overflow-hidden transition-all hover:scale-[1.05] active:scale-[0.98] shadow-xl shadow-primary/20"
                >
                    <Plus className="w-4 h-4" />
                    {t('addUser')}
                </button>
            </div>

            {/* Main Users Table Container */}
            <div className="glass-card bg-card/40 backdrop-blur-xl border border-border/40 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-muted/50 border-b border-border/20">
                            <tr>
                                {['username', 'phone', 'role', 'branch', 'maxDiscount', 'maxDiscountAmount'].map((key) => (
                                    <th key={key} className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                                        {t(key)}
                                    </th>
                                ))}
                                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-left">
                                    {t('actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10">
                            {users.map((user: any) => {
                                const isAdmin = isAdminCheck(user.roleStr) || isAdminCheck(user.role?.name) || user.isGlobalAdmin;
                                const forbiddenPerms = ['MANAGE_SETTINGS', 'MANAGE_ROLES'];
                                let targetPerms: string[] = [];
                                try {
                                    targetPerms = typeof user.role?.permissions === 'string' ? JSON.parse(user.role?.permissions || '[]') : user.role?.permissions || [];
                                } catch (e) { targetPerms = []; }
                                const userPerms = currentUser.permissions || [];
                                const isSubset = targetPerms.every(p => userPerms.includes(p));
                                const hasForbidden = targetPerms.some(p => forbiddenPerms.includes(p));
                                const canModify = isUserAdmin || (!isAdmin && isSubset && !hasForbidden);
                                const rawRoleName = user.role?.name || user.roleStr;
                                const roleKey = `roles.${rawRoleName?.toUpperCase()}`;
                                const translated = t(roleKey);
                                const roleName = translated === roleKey ? rawRoleName : translated;

                                return (
                                    <tr key={user.id} className="group transition-all hover:bg-primary/5 even:bg-muted/70 h-16">
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20 group-hover:bg-violet-500/20 transition-all">
                                                    <UserIcon className="w-4 h-4 text-violet-400" />
                                                </div>
                                                <span className="font-black text-foreground group-hover:text-primary transition-colors">{user.username}</span>
                                            </div>
                                        </td>
                                        <td className="p-6 text-xs font-bold text-muted-foreground/60">{user.phone || '—'}</td>
                                        <td className="p-6">
                                            <span className={cn(
                                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm transition-all",
                                                isAdmin
                                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-rose-500/5'
                                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5'
                                            )}>
                                                {isAdmin ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                                                {roleName}
                                            </span>
                                        </td>
                                        <td className="p-6 text-xs font-black text-muted-foreground/60 uppercase tracking-tight">{user.branch?.name || '—'}</td>
                                        <td className="p-6">
                                            <span className={cn(
                                                "font-black text-xs px-2 py-1 rounded bg-background/40 border border-border/40",
                                                user.maxDiscount ? "text-primary" : "text-muted-foreground/30"
                                            )}>
                                                {user.maxDiscount ? `${user.maxDiscount}%` : '0%'}
                                            </span>
                                        </td>
                                        <td className="p-6">
                                            <span className={cn(
                                                "font-black text-xs px-2 py-1 rounded bg-background/40 border border-border/40",
                                                user.maxDiscountAmount ? "text-emerald-500" : "text-muted-foreground/30"
                                            )}>
                                                {user.maxDiscountAmount ? `${user.maxDiscountAmount} EGP` : '0 EGP'}
                                            </span>
                                        </td>
                                        <td className="p-6 text-left">
                                            <div className="flex justify-start gap-2 h-0 opacity-0 group-hover:h-auto group-hover:opacity-100 transition-all duration-300">
                                                {canModify ? (
                                                    <>
                                                        <button
                                                            onClick={() => { setEditingUser(user); setShowPassword(false); setIsModalOpen(true); }}
                                                            className="w-10 h-10 rounded-xl bg-card border border-border/40 text-primary hover:bg-primary/10 transition-all flex items-center justify-center shadow-lg"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDeleteModal({ isOpen: true, id: user.id })}
                                                            disabled={deletingId === user.id}
                                                            className="w-10 h-10 rounded-xl bg-card border border-border/40 text-rose-400 hover:bg-rose-500/10 transition-all flex items-center justify-center shadow-lg disabled:opacity-50"
                                                        >
                                                            {deletingId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="w-10 h-10 rounded-xl bg-background/20 border border-border/20 text-muted-foreground/30 flex items-center justify-center" title="System Administrator Locked">
                                                        <Lock className="w-4 h-4" />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-24 text-center">
                                        <div className="flex flex-col items-center gap-3 grayscale opacity-30">
                                           <Users size={40} />
                                           <span className="text-sm font-black uppercase tracking-widest">{t('noUsers')}</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Premium Staff Editor Modal */}
            <GlassModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setShowPassword(false); }}
                title={editingUser ? t('editUser') : t('addUser')}
            >
                <form action={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{t('name')}</label>
                            <input
                                name="name"
                                type="text"
                                className="w-full bg-background/40 border border-border/40 rounded-2xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                required
                                placeholder="e.g. John Doe"
                                defaultValue={editingUser?.name}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{t('username')}</label>
                            <input
                                name="username"
                                type="text"
                                className="w-full bg-background/40 border border-border/40 rounded-2xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                required
                                placeholder="e.g. cashier1"
                                defaultValue={editingUser?.username}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{t('phone')}</label>
                            <input
                                name="phone"
                                type="text"
                                className="w-full bg-background/40 border border-border/40 rounded-2xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                required
                                placeholder="e.g. 01234567890"
                                defaultValue={editingUser?.phone}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                                {t('password')}
                                {editingUser && <span className="text-muted-foreground text-[8px] font-black ml-2 opacity-50">{t('passwordHint')}</span>}
                            </label>
                            <div className="relative">
                                <input
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    className="w-full bg-background/40 border border-border/40 rounded-2xl p-3 pr-10 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    required={!editingUser}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2 text-right">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('role')}</label>
                            <Select name="roleId" defaultValue={editingUser?.role?.id || editingUser?.roleId || ''} required>
                                <SelectTrigger className="w-full bg-background/40 border-border/40 h-12 rounded-2xl px-4 font-bold text-sm">
                                    <SelectValue placeholder={t('selectRole')} />
                                </SelectTrigger>
                                <SelectContent className="bg-card/95 backdrop-blur-2xl border-border/40 rounded-2xl">
                                    {filteredRoles.map((role: any) => (
                                        <SelectItem key={role.id} value={role.id} className="font-bold text-sm py-3 mb-1 rounded-xl">{role.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {branchId ? (
                            <input type="hidden" name="branchId" value={branchId} />
                        ) : (
                            <div className="space-y-2 text-right">
                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('assignedBranch')}</label>
                                <Select name="branchId" defaultValue={editingUser?.branch?.id || editingUser?.branchId || ''} required>
                                    <SelectTrigger className="w-full bg-background/40 border-border/40 h-12 rounded-2xl px-4 font-bold text-sm">
                                        <SelectValue placeholder={t('selectBranch')} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card/95 backdrop-blur-2xl border-border/40 rounded-2xl">
                                        {branches.map((b: any) => (
                                            <SelectItem key={b.id} value={b.id} className="font-bold text-sm py-3 mb-1 rounded-xl">{b.name}</SelectItem>
                                        )) }
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/20">
                        <div className="space-y-2">
                             <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{t('maxDiscount')}</label>
                             <div className="relative">
                                <input
                                    name="maxDiscount"
                                    type="number"
                                    min="0" max="100" step="0.01"
                                    className="w-full bg-background/60 border border-border/40 rounded-2xl p-3 text-sm font-black focus:outline-none focus:border-indigo-500/50 pr-10"
                                    placeholder="e.g. 10"
                                    defaultValue={editingUser?.maxDiscount ?? ''}
                                />
                                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                   <span className="font-black text-indigo-400 opacity-60 text-xs">%</span>
                                </div>
                             </div>
                        </div>
                        <div className="space-y-2">
                             <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">{t('maxDiscountAmount')}</label>
                             <div className="relative">
                                <input
                                    name="maxDiscountAmount"
                                    type="number"
                                    min="0" step="0.01"
                                    className="w-full bg-background/60 border border-border/40 rounded-2xl p-3 text-sm font-black focus:outline-none focus:border-indigo-500/50 pr-10"
                                    placeholder="e.g. 50"
                                    defaultValue={editingUser?.maxDiscountAmount ?? ''}
                                />
                                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                   <span className="font-black text-indigo-400 opacity-60 text-[8px] uppercase">EGP</span>
                                </div>
                             </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full group relative inline-flex items-center justify-center gap-3 bg-primary py-4 rounded-2xl text-white font-black uppercase tracking-widest overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingUser ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />)}
                        {editingUser ? t('updateUser') : t('addUser')}
                    </button>
                </form >
            </GlassModal >

            <ConfirmationModal
                isOpen={confirmDeleteModal.isOpen}
                onClose={() => setConfirmDeleteModal({ isOpen: false, id: null })}
                onConfirm={handleDeleteConfirmed}
                title={t('errors.deleteConfirm') || "Confirm Deletion"}
                message={t('errors.deleteMessage') || "Are you sure you want to delete this user? This action cannot be undone."}
                variant="danger"
                loading={deletingId !== null}
            />

            <ConfirmationModal
                isOpen={confirmLinkModal.isOpen}
                onClose={() => setConfirmLinkModal({ isOpen: false, customer: null, formData: null })}
                onConfirm={handleLinkConfirmed}
                title="ربط حساب عميل"
                message={`عفواً، هذا الرقم مسجل لعميل: [${confirmLinkModal.customer?.name}].\nرصيده الحالي: ${confirmLinkModal.customer?.balance} EGP.\n\nهل تريد ربط حساب الموظف بهذا العميل؟`}
                variant="warning"
                loading={loading}
            />
        </div >
    )
}
