"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Loader2, Save } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { toast } from "sonner";
import GlassModal from "@/components/ui/GlassModal";
import { getFloors, createFloor, deleteFloor, updateFloor, getTablesByFloor, createTable, deleteTable, updateTable } from "@/actions/tables-actions";

interface FloorItem {
    id: string;
    name: string;
    [key: string]: unknown;
}

interface TableItem {
    id: string;
    name: string;
    floorId: string;
    status?: string;
    [key: string]: unknown;
}

export default function TablesManagement() {
    const t = useTranslations("TablesManagement");
    const [floors, setFloors] = useState<FloorItem[]>([]);
    const [tables, setTables] = useState<TableItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

    // Modals
    const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);
    const [editingFloor, setEditingFloor] = useState<FloorItem | null>(null);
    const [editingTable, setEditingTable] = useState<TableItem | null>(null);

    // Forms
    const [floorName, setFloorName] = useState("");
    const [tableName, setTableName] = useState("");

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedFloorId) {
            loadTables(selectedFloorId);
        } else {
            setTables([]);
        }
    }, [selectedFloorId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await getFloors();
            if (result.success && result.data) {
                setFloors(result.data);
                if (result.data.length > 0 && !selectedFloorId) {
                    setSelectedFloorId(result.data[0].id);
                }
            } else {
                toast.error("Failed to load floors");
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to load floors");
        } finally {
            setLoading(false);
        }
    };

    const loadTables = async (floorId: string) => {
        try {
            const result = await getTablesByFloor(floorId);
            if (result.success && result.data) {
                setTables(result.data);
            }
        } catch (error) {
            console.error(error);
        }
    };

    // FLOOR ACTIONS
    const handleSaveFloor = async () => {
        if (!floorName) return;
        try {
            if (editingFloor) {
                await updateFloor(editingFloor.id, { name: floorName });
                toast.success("Floor updated");
            } else {
                await createFloor({ name: floorName });
                toast.success("Floor created");
            }
            setIsFloorModalOpen(false);
            loadData();
        } catch (error) {
            toast.error("Failed to save floor");
        }
    };

    const handleDeleteFloor = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure? This will delete all tables on this floor.")) return;
        try {
            await deleteFloor(id);
            toast.success("Floor deleted");
            if (selectedFloorId === id) setSelectedFloorId(null);
            loadData();
        } catch (error) {
            toast.error("Failed to delete floor");
        }
    };

    // TABLE ACTIONS
    const handleSaveTable = async () => {
        if (!tableName || !selectedFloorId) return;
        try {
            if (editingTable) {
                await updateTable(editingTable.id, { name: tableName });
                toast.success("Table updated");
            } else {
                await createTable({ name: tableName, floorId: selectedFloorId });
                toast.success("Table created");
            }
            setIsTableModalOpen(false);
            loadTables(selectedFloorId);
        } catch (error) {
            toast.error("Failed to save table");
        }
    };

    const handleDeleteTable = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            await deleteTable(id);
            toast.success("Table deleted");
            if (selectedFloorId) loadTables(selectedFloorId);
        } catch (error) {
            toast.error("Failed to delete table");
        }
    };

    if (loading) {
        return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-cyan-500 w-8 h-8" /></div>;
    }

    return (
        <div className="max-w-5xl space-y-3 animate-in fade-in duration-500">
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto pr-1 custom-scrollbar space-y-3">
                {/* Floors Bar Header */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-card/40 border border-border/40">
                    <div>
                        <h2 className="text-sm font-bold text-foreground">طوابق وصالات المطعم (Floors)</h2>
                        <p className="text-[10px] text-muted-foreground">تنظيم وتوزيع الطاولات حسب الصالة أو الطابق</p>
                    </div>
                    <button
                        onClick={() => {
                            setEditingFloor(null);
                            setFloorName("");
                            setIsFloorModalOpen(true);
                        }}
                        className="h-8 flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 px-3 rounded-lg text-white font-bold text-xs transition-all cursor-pointer"
                    >
                        <Plus className="w-3.5 h-3.5" /> إضافة صالة/طابق
                    </button>
                </div>

                {/* Floors List */}
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    {floors.map(floor => (
                        <div
                            key={floor.id}
                            onClick={() => setSelectedFloorId(floor.id)}
                            className={`min-w-[130px] p-2.5 rounded-xl border cursor-pointer transition-all flex justify-between items-center ${selectedFloorId === floor.id ? 'bg-cyan-500/20 border-cyan-500 shadow-xs' : 'bg-card/40 border-border/40 hover:border-border/80'}`}
                        >
                            <span className="font-bold text-xs text-foreground">{floor.name}</span>
                            <div className="flex gap-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingFloor(floor);
                                        setFloorName(floor.name);
                                        setIsFloorModalOpen(true);
                                    }}
                                    className="text-muted-foreground hover:text-cyan-400 p-1 cursor-pointer"
                                >
                                    <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={(e) => handleDeleteFloor(floor.id, e)}
                                    className="text-muted-foreground hover:text-rose-400 p-1 cursor-pointer"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                    {floors.length === 0 && <span className="text-xs text-muted-foreground py-2">لا توجد صالات مضافة بعد.</span>}
                </div>

                {/* Tables Area */}
                {selectedFloorId && (
                    <div className="space-y-2.5 border-t border-border/40 pt-2.5 animate-in fade-in">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xs font-bold text-foreground">طاولات الصالة المحددة</h2>
                            <button
                                onClick={() => {
                                    setEditingTable(null);
                                    setTableName("");
                                    setIsTableModalOpen(true);
                                }}
                                className="h-7 flex items-center gap-1 bg-purple-600 hover:bg-purple-500 px-2.5 rounded-lg text-white font-bold text-[11px] transition-all cursor-pointer"
                            >
                                <Plus className="w-3 h-3" /> إضافة طاولة
                            </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {tables.map(table => (
                                <div key={table.id} className="relative group p-3 rounded-xl border border-border/40 bg-card/40 hover:bg-card/70 transition-all text-center">
                                    <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${table.status === 'AVAILABLE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {table.status}
                                    </span>
                                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button
                                            onClick={() => {
                                                setEditingTable(table);
                                                setTableName(table.name);
                                                setIsTableModalOpen(true);
                                            }}
                                            className="text-muted-foreground hover:text-cyan-400 p-0.5 cursor-pointer"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTable(table.id)}
                                            className="text-muted-foreground hover:text-rose-400 p-0.5 cursor-pointer"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="mt-3 text-lg font-black text-foreground">{table.name}</div>
                                </div>
                            ))}
                        </div>
                        {tables.length === 0 && <div className="text-muted-foreground text-xs text-center py-4">لا توجد طاولات في هذا الطابق بعد.</div>}
                    </div>
                )}
            </div>

            {/* Floor Modal */}
            <GlassModal isOpen={isFloorModalOpen} onClose={() => setIsFloorModalOpen(false)} title={editingFloor ? "تعديل الصالة / الطابق" : "إضافة صالة جديدة"}>
                <div className="p-3 space-y-3 max-h-[80vh] overflow-y-auto pr-1 custom-scrollbar">
                    <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold block">اسم الصالة أو الطابق</label>
                        <input
                            className="w-full h-8 text-xs bg-background/50 border border-border/50 rounded-lg px-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500"
                            value={floorName}
                            onChange={e => setFloorName(e.target.value)}
                            placeholder="مثال: الصالة الرئيسية، الدور الأرضي"
                        />
                    </div>
                    <button
                        onClick={handleSaveFloor}
                        className="w-full h-8 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl flex justify-center items-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Save className="w-3.5 h-3.5" /> حفظ الصالة
                    </button>
                </div>
            </GlassModal>

            {/* Table Modal */}
            <GlassModal isOpen={isTableModalOpen} onClose={() => setIsTableModalOpen(false)} title={editingTable ? "تعديل الطاولة" : "إضافة طاولة جديدة"}>
                <div className="p-3 space-y-3 max-h-[80vh] overflow-y-auto pr-1 custom-scrollbar">
                    <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold block">رقم أو اسم الطاولة</label>
                        <input
                            className="w-full h-8 text-xs bg-background/50 border border-border/50 rounded-lg px-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500"
                            value={tableName}
                            onChange={e => setTableName(e.target.value)}
                            placeholder="مثال: T-01, طاولة العائلات 3"
                        />
                    </div>
                    <button
                        onClick={handleSaveTable}
                        className="w-full h-8 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl flex justify-center items-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Save className="w-3.5 h-3.5" /> حفظ الطاولة
                    </button>
                </div>
            </GlassModal>
        </div>
    );
}
