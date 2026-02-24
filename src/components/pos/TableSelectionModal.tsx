"use client";

import { useState, useEffect } from "react";
import { X, Search, Plus, Loader2, PlayCircle, PlusCircle, Edit2, Trash2, Check } from "lucide-react";
import { createFloor, createTable, updateFloor, deleteFloor, updateTable, deleteTable } from "@/actions/tables-management";
import { toast } from "sonner";

interface Table {
    id: string;
    name: string;
    status: string;
}

interface Floor {
    id: string;
    name: string;
    tables: Table[];
}

interface TableSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    floors: Floor[];
    onSelectTable: (tableId: string, tableName: string, action?: 'resume' | 'new') => void;
    currentTableId?: string;
    heldCarts: any[];
    activeCartItems: any[];
    t: any;
}

export default function TableSelectionModal({
    isOpen,
    onClose,
    floors,
    onSelectTable,
    currentTableId,
    heldCarts,
    activeCartItems,
    t
}: TableSelectionModalProps) {
    const [selectedFloorId, setSelectedFloorId] = useState<string>("");

    // Inline Creation State
    const [isAddingFloor, setIsAddingFloor] = useState(false);
    const [newFloorName, setNewFloorName] = useState("");
    const [isAddingFloorLoading, setIsAddingFloorLoading] = useState(false);

    const [isAddingTable, setIsAddingTable] = useState(false);
    const [newTableName, setNewTableName] = useState("");
    const [isAddingTableLoading, setIsAddingTableLoading] = useState(false);

    // Edit states
    const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
    const [editFloorName, setEditFloorName] = useState("");
    const [isEditingFloorLoading, setIsEditingFloorLoading] = useState(false);

    const [editingTableId, setEditingTableId] = useState<string | null>(null);
    const [editTableName, setEditTableName] = useState("");
    const [isEditingTableLoading, setIsEditingTableLoading] = useState(false);

    // Action popup for occupied tables
    const [actionTable, setActionTable] = useState<Table | null>(null);

    // Local clone of floors to allow instant UX updates without waiting for parent Server Component to reload
    const [localFloors, setLocalFloors] = useState<Floor[]>(floors);

    useEffect(() => {
        setLocalFloors(floors);
    }, [floors]);

    useEffect(() => {
        if (isOpen && localFloors.length > 0 && !selectedFloorId) {
            setSelectedFloorId(localFloors[0].id);
        }
        if (!isOpen) {
            setActionTable(null);
        }
    }, [isOpen, localFloors, selectedFloorId]);

    if (!isOpen) return null;

    const currentFloor = localFloors.find(f => f.id === selectedFloorId) || localFloors[0];

    const handleCreateFloor = async () => {
        if (!newFloorName.trim()) return;
        setIsAddingFloorLoading(true);
        const res = await createFloor({ name: newFloorName });
        if (res.success && res.data) {
            setLocalFloors(prev => [...prev, { ...res.data, tables: [] }]);
            setNewFloorName("");
            setIsAddingFloor(false);
            setSelectedFloorId(res.data.id);
        }
        setIsAddingFloorLoading(false);
    };

    const handleCreateTable = async () => {
        if (!newTableName.trim() || !currentFloor) return;
        setIsAddingTableLoading(true);
        const res = await createTable({ name: newTableName, floorId: currentFloor.id });
        if (res.success && res.data) {
            setLocalFloors(prev => prev.map(f => {
                if (f.id === currentFloor.id) {
                    return { ...f, tables: [...f.tables, res.data] };
                }
                return f;
            }));
            setNewTableName("");
            setIsAddingTable(false);
        }
        setIsAddingTableLoading(false);
    };

    const handleUpdateFloor = async (id: string) => {
        if (!editFloorName.trim()) return;
        setIsEditingFloorLoading(true);
        const res = await updateFloor(id, editFloorName);
        if (res.success && res.data) {
            setLocalFloors(prev => prev.map(f => f.id === id ? { ...f, name: res.data.name } : f));
            setEditingFloorId(null);
        } else {
            toast.error(res.error || "Failed to update floor");
        }
        setIsEditingFloorLoading(false);
    };

    const handleDeleteFloor = async (id: string) => {
        const floor = localFloors.find(f => f.id === id);
        if (!floor) return;

        if (floor.tables.length > 0) {
            toast.error(t('cannotDeleteFloorWithTables') || "Cannot delete floor with tables. Remove tables first.");
            return;
        }

        // Check if any table on this floor is occupied
        const hasOccupiedTables = floor.tables.some(table => {
            return table.status === 'OCCUPIED' ||
                heldCarts.some(c => c.tableId === table.id && c.items.length > 0) ||
                (currentTableId === table.id && activeCartItems.length > 0);
        });

        if (hasOccupiedTables) {
            toast.error(t('cannotDeleteOccupiedFloor') || "Cannot delete floor while it has occupied tables.");
            return;
        }

        if (!confirm(t('confirmDeleteFloor') || "Are you sure you want to delete this floor?")) return;
        const res = await deleteFloor(id);
        if (res.success) {
            setLocalFloors(prev => prev.filter(f => f.id !== id));
            if (selectedFloorId === id) {
                setSelectedFloorId(localFloors.find(f => f.id !== id)?.id || "");
            }
        } else {
            toast.error(res.error || "Failed to delete floor");
        }
    };

    const handleUpdateTable = async (id: string, floorId: string) => {
        if (!editTableName.trim()) return;
        setIsEditingTableLoading(true);
        const res = await updateTable(id, editTableName);
        if (res.success && res.data) {
            setLocalFloors(prev => prev.map(f => {
                if (f.id === floorId) {
                    return { ...f, tables: f.tables.map(t => t.id === id ? { ...t, name: res.data.name } : t) };
                }
                return f;
            }));
            setEditingTableId(null);
        } else {
            toast.error(res.error || "Failed to update table");
        }
        setIsEditingTableLoading(false);
    };

    const handleDeleteTable = async (id: string, floorId: string) => {
        if (!confirm(t('confirmDeleteTable') || "Are you sure you want to delete this table?")) return;
        const res = await deleteTable(id);
        if (res.success) {
            setLocalFloors(prev => prev.map(f => {
                if (f.id === floorId) {
                    return { ...f, tables: f.tables.filter(t => t.id !== id) };
                }
                return f;
            }));
        } else {
            toast.error(res.error || "Failed to delete table");
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-card w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-border relative"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50">
                    <h2 className="text-xl font-bold text-foreground">{t('selectTable') || 'Select a Table'}</h2>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar - Floors */}
                    <div className="w-48 border-r border-border bg-muted/20 overflow-y-auto w-full md:w-auto flex flex-row md:flex-col">
                        {localFloors.map(floor => (
                            <div key={floor.id} className={`group relative border-b border-border transition-colors ${selectedFloorId === floor.id ? 'bg-cyan-500/10 border-l-4 border-l-cyan-500' : 'hover:bg-white/5 border-l-4 border-l-transparent'}`}>
                                {editingFloorId === floor.id ? (
                                    <div className="p-3 flex items-center gap-2">
                                        <input
                                            autoFocus
                                            type="text"
                                            className="w-full bg-black/50 border border-cyan-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none"
                                            value={editFloorName}
                                            onChange={(e) => setEditFloorName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleUpdateFloor(floor.id);
                                                if (e.key === 'Escape') setEditingFloorId(null);
                                            }}
                                        />
                                        <button onClick={() => handleUpdateFloor(floor.id)} disabled={isEditingFloorLoading} className="text-cyan-400 hover:text-cyan-300">
                                            {isEditingFloorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        </button>
                                        <button onClick={() => setEditingFloorId(null)} className="text-zinc-500 hover:text-white">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setSelectedFloorId(floor.id)}
                                            className={`w-full p-4 text-left font-bold pr-16 ${selectedFloorId === floor.id ? 'text-cyan-400' : 'text-zinc-400 group-hover:text-white'}`}
                                        >
                                            {floor.name}
                                        </button>
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {(() => {
                                                const hasOccupiedTables = floor.tables.some(table => {
                                                    return table.status === 'OCCUPIED' ||
                                                        heldCarts.some(c => c.tableId === table.id && c.items.length > 0) ||
                                                        (currentTableId === table.id && activeCartItems.length > 0);
                                                });
                                                if (!hasOccupiedTables) {
                                                    return (
                                                        <>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditFloorName(floor.name);
                                                                    setEditingFloorId(floor.id);
                                                                }}
                                                                className="p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-white/10 rounded-md"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteFloor(floor.id);
                                                                }}
                                                                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-white/10 rounded-md"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}

                        {/* Add Floor Button/Form */}
                        <div className="p-3 border-b border-border">
                            {isAddingFloor ? (
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder={t('floorName') || "Floor name..."}
                                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                        value={newFloorName}
                                        onChange={(e) => setNewFloorName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreateFloor();
                                            if (e.key === 'Escape') setIsAddingFloor(false);
                                        }}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={handleCreateFloor} disabled={isAddingFloorLoading} className="flex-1 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 text-xs font-bold py-1.5 rounded-md flex items-center justify-center">
                                            {isAddingFloorLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : (t('save') || 'Save')}
                                        </button>
                                        <button onClick={() => setIsAddingFloor(false)} className="px-2 text-zinc-500 hover:text-white">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsAddingFloor(true)}
                                    className="w-full text-zinc-500 hover:text-cyan-400 font-bold text-sm flex items-center gap-2 px-1 py-2 transition-colors border border-dashed border-white/10 rounded-lg hover:border-cyan-500/30 hover:bg-cyan-500/10 justify-center"
                                >
                                    <Plus className="w-4 h-4" /> {t('addFloor') || 'Add Floor'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Main Content - Tables Grid */}
                    <div className="flex-1 p-6 overflow-y-auto relative">
                        {currentFloor ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-12">
                                {currentFloor.tables.map(table => {
                                    const isOccupied = table.status === 'OCCUPIED' ||
                                        heldCarts.some(c => c.tableId === table.id && c.items.length > 0) ||
                                        (currentTableId === table.id && activeCartItems.length > 0);
                                    const isSelected = currentTableId === table.id;

                                    return (
                                        <div key={table.id} className="relative group aspect-square">
                                            {editingTableId === table.id ? (
                                                <div className="absolute inset-0 z-10 bg-card border-2 border-cyan-500 rounded-xl flex flex-col items-center justify-center p-4 gap-3 shadow-xl">
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-center text-sm font-bold text-white focus:outline-none focus:border-cyan-500"
                                                        value={editTableName}
                                                        onChange={(e) => setEditTableName(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleUpdateTable(table.id, currentFloor.id);
                                                            if (e.key === 'Escape') setEditingTableId(null);
                                                        }}
                                                    />
                                                    <div className="flex gap-2 w-full">
                                                        <button onClick={() => handleUpdateTable(table.id, currentFloor.id)} disabled={isEditingTableLoading} className="flex-1 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 text-xs font-bold py-1.5 rounded-md flex items-center justify-center transition-colors">
                                                            {isEditingTableLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (t('save') || 'Save')}
                                                        </button>
                                                        <button onClick={() => setEditingTableId(null)} className="px-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-md transition-colors">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : null}
                                            <button
                                                onClick={() => {
                                                    const fullTableName = `${currentFloor.name} - ${table.name}`;
                                                    if (isSelected) {
                                                        onSelectTable(table.id, fullTableName, 'resume');
                                                        onClose();
                                                    } else if (isOccupied) {
                                                        setActionTable(table);
                                                    } else {
                                                        onSelectTable(table.id, fullTableName, 'new');
                                                        onClose();
                                                    }
                                                }}
                                                className={`
                                                    w-full h-full relative p-6 rounded-xl flex flex-col items-center justify-center gap-2 transition-all
                                                    ${isSelected
                                                        ? 'bg-cyan-500/20 text-cyan-400 border-2 border-cyan-500 shadow-[0_0_15px_rgba(0,255,255,0.2)]'
                                                        : isOccupied
                                                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20'
                                                            : 'bg-muted/50 text-foreground border border-border hover:bg-white/5 hover:border-white/20'
                                                    }
                                                `}
                                            >
                                                <div className="text-3xl font-black mb-1">{table.name}</div>
                                                <div className="text-xs font-bold uppercase tracking-wider opacity-70">
                                                    {isOccupied ? t('occupied') : t('available')}
                                                </div>
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(0,255,255,0.8)]" />
                                                )}
                                            </button>

                                            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {!isOccupied && (
                                                    <button onClick={(e) => { e.stopPropagation(); setEditTableName(table.name); setEditingTableId(table.id); }} className="p-1.5 bg-black/60 text-zinc-300 hover:text-cyan-400 rounded-md backdrop-blur-md border border-white/10 hover:border-cyan-500/50">
                                                        <Edit2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                                {!isOccupied && !isSelected && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.id, currentFloor.id); }} className="p-1.5 bg-black/60 text-zinc-300 hover:text-red-400 rounded-md backdrop-blur-md border border-white/10 hover:border-red-500/50">
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {isAddingTable ? (
                                    <div className="relative p-4 rounded-xl flex flex-col items-center justify-center gap-3 aspect-square bg-muted/30 border border-dashed border-cyan-500/50">
                                        <input
                                            type="text"
                                            autoFocus
                                            placeholder={t('tableName') || "Table Name"}
                                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-center text-sm font-bold text-white focus:outline-none focus:border-cyan-500"
                                            value={newTableName}
                                            onChange={(e) => setNewTableName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleCreateTable();
                                                if (e.key === 'Escape') setIsAddingTable(false);
                                            }}
                                        />
                                        <div className="flex gap-2 w-full">
                                            <button onClick={handleCreateTable} disabled={isAddingTableLoading} className="flex-1 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 text-xs font-bold py-2 rounded-md flex items-center justify-center transition-colors">
                                                {isAddingTableLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (t('save') || 'Save')}
                                            </button>
                                            <button onClick={() => setIsAddingTable(false)} className="px-3 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-md transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setIsAddingTable(true)}
                                        className="relative p-6 rounded-xl flex flex-col items-center justify-center gap-2 aspect-square border-2 border-dashed border-white/10 text-zinc-500 hover:text-cyan-400 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all"
                                    >
                                        <Plus className="w-8 h-8 mb-2 opacity-50" />
                                        <div className="text-sm font-bold uppercase tracking-widest">{t('addTable') || 'Add Table'}</div>
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                                <p>{t('selectFloorToViewTables') || 'Please select a floor to view or add tables.'}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Popup overlay for occupied tables */}
                {actionTable && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in rounded-2xl">
                        <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center shadow-2xl max-w-sm w-full mx-4 animate-in zoom-in-95">
                            <h3 className="text-xl font-bold mb-2">{actionTable.name}</h3>
                            <p className="text-muted-foreground text-sm text-center mb-6">
                                {t('occupiedTableMessage') || 'This table is currently occupied. Do you want to resume an existing order or add a new one?'}
                            </p>
                            <div className="flex flex-col gap-3 w-full">
                                <button
                                    onClick={() => {
                                        onSelectTable(actionTable.id, `${currentFloor.name} - ${actionTable.name}`, 'resume');
                                        setActionTable(null);
                                        onClose();
                                    }}
                                    className="w-full flex items-center justify-center gap-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg transition-colors"
                                >
                                    <PlayCircle className="w-5 h-5" />
                                    {t('resumeOrder') || 'Resume Order'}
                                </button>
                                <button
                                    onClick={() => {
                                        onSelectTable(actionTable.id, `${currentFloor.name} - ${actionTable.name}`, 'new');
                                        setActionTable(null);
                                        onClose();
                                    }}
                                    className="w-full flex items-center justify-center gap-3 bg-muted hover:bg-muted/80 text-foreground font-bold py-3 border border-border rounded-lg transition-colors"
                                >
                                    <PlusCircle className="w-5 h-5" />
                                    {t('addNew') || 'Add New'}
                                </button>
                                <button
                                    onClick={() => setActionTable(null)}
                                    className="w-full mt-2 text-zinc-500 hover:text-white text-sm font-bold py-2 transition-colors"
                                >
                                    {t('cancel') || 'Cancel'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
