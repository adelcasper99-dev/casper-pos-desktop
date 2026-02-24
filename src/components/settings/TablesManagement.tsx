"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Loader2, Save } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";
import { toast } from "sonner";
import GlassModal from "@/components/ui/GlassModal";
import { getFloors, createFloor, deleteFloor, updateFloor, getTablesByFloor, createTable, deleteTable, updateTable } from "@/actions/tables-actions";

export default function TablesManagement() {
    const t = useTranslations("TablesManagement");
    const [floors, setFloors] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

    // Modals
    const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);
    const [editingFloor, setEditingFloor] = useState<any>(null);
    const [editingTable, setEditingTable] = useState<any>(null);

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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Floors</h2>
                <button
                    onClick={() => {
                        setEditingFloor(null);
                        setFloorName("");
                        setIsFloorModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg text-white font-bold transition-all"
                >
                    <Plus className="w-4 h-4" /> Add Floor
                </button>
            </div>

            {/* Floors List */}
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                {floors.map(floor => (
                    <div
                        key={floor.id}
                        onClick={() => setSelectedFloorId(floor.id)}
                        className={`min-w-[150px] p-4 rounded-xl border cursor-pointer transition-all flex justify-between items-center ${selectedFloorId === floor.id ? 'bg-cyan-500/20 border-cyan-500' : 'bg-black/40 border-white/10 hover:border-white/30'}`}
                    >
                        <span className="font-bold text-white">{floor.name}</span>
                        <div className="flex gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingFloor(floor);
                                    setFloorName(floor.name);
                                    setIsFloorModalOpen(true);
                                }}
                                className="text-zinc-500 hover:text-cyan-400 p-1"
                            >
                                <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                                onClick={(e) => handleDeleteFloor(floor.id, e)}
                                className="text-zinc-500 hover:text-red-400 p-1"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                ))}
                {floors.length === 0 && <span className="text-zinc-500">No floors found.</span>}
            </div>

            {/* Tables Area */}
            {selectedFloorId && (
                <div className="mt-8 space-y-6 border-t border-white/10 pt-8 animate-in fade-in">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-white">Tables on Floor</h2>
                        <button
                            onClick={() => {
                                setEditingTable(null);
                                setTableName("");
                                setIsTableModalOpen(true);
                            }}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-white font-bold transition-all"
                        >
                            <Plus className="w-4 h-4" /> Add Table
                        </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {tables.map(table => (
                            <div key={table.id} className="relative group p-6 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 transition-all text-center">
                                <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${table.status === 'AVAILABLE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {table.status}
                                </span>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                    <button
                                        onClick={() => {
                                            setEditingTable(table);
                                            setTableName(table.name);
                                            setIsTableModalOpen(true);
                                        }}
                                        className="text-zinc-500 hover:text-cyan-400"
                                    >
                                        <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTable(table.id)}
                                        className="text-zinc-500 hover:text-red-400"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="mt-4 text-2xl font-black text-white">{table.name}</div>
                            </div>
                        ))}
                    </div>
                    {tables.length === 0 && <div className="text-zinc-500 text-center py-8">No tables found on this floor.</div>}
                </div>
            )}

            {/* Floor Modal */}
            <GlassModal isOpen={isFloorModalOpen} onClose={() => setIsFloorModalOpen(false)} title={editingFloor ? "Edit Floor" : "Add Floor"}>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">Floor Name</label>
                        <input
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            value={floorName}
                            onChange={e => setFloorName(e.target.value)}
                            placeholder="e.g. Ground Floor"
                        />
                    </div>
                    <button
                        onClick={handleSaveFloor}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2 transition-colors"
                    >
                        <Save className="w-4 h-4" /> Save
                    </button>
                </div>
            </GlassModal>

            {/* Table Modal */}
            <GlassModal isOpen={isTableModalOpen} onClose={() => setIsTableModalOpen(false)} title={editingTable ? "Edit Table" : "Add Table"}>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-xs text-zinc-400 uppercase font-bold mb-1 block">Table Name / Number</label>
                        <input
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            value={tableName}
                            onChange={e => setTableName(e.target.value)}
                            placeholder="e.g. T-12, Area B1"
                        />
                    </div>
                    <button
                        onClick={handleSaveTable}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2 transition-colors"
                    >
                        <Save className="w-4 h-4" /> Save
                    </button>
                </div>
            </GlassModal>
        </div>
    );
}
