'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface PatternLockCanvasProps {
    value?: string; // Current pattern as comma-separated node IDs: "0,1,2,5,8"
    onChange?: (pattern: string) => void;
    disabled?: boolean;
    size?: number; // Canvas size in pixels
    showNumbers?: boolean;
    className?: string;
}

// 3x3 grid node positions (0-8)
// 0 1 2
// 3 4 5
// 6 7 8

export default function PatternLockCanvas({
    value = '',
    onChange,
    disabled = false,
    size = 200,
    showNumbers = false,
    className
}: PatternLockCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [selectedNodes, setSelectedNodes] = useState<number[]>([]);
    const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);

    // Node positions calculated based on canvas size
    const nodeRadius = size * 0.08;
    const padding = size * 0.2;
    const spacing = (size - 2 * padding) / 2;

    const getNodePosition = useCallback((index: number) => {
        const row = Math.floor(index / 3);
        const col = index % 3;
        return {
            x: padding + col * spacing,
            y: padding + row * spacing
        };
    }, [padding, spacing]);

    // Parse value prop to selectedNodes
    useEffect(() => {
        if (value) {
            const nodes = value.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            setSelectedNodes(nodes);
        } else {
            setSelectedNodes([]);
        }
    }, [value]);

    // Draw the grid and pattern
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, size, size);

        // Draw grid dots
        for (let i = 0; i < 9; i++) {
            const pos = getNodePosition(i);
            const isSelected = selectedNodes.includes(i);

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);

            if (isSelected) {
                // Selected node - cyan fill
                ctx.fillStyle = disabled ? '#4b5563' : '#06b6d4';
                ctx.fill();
                ctx.strokeStyle = disabled ? '#6b7280' : '#22d3ee';
                ctx.lineWidth = 2;
                ctx.stroke();
            } else {
                // Unselected node - dark outline
                ctx.fillStyle = '#27272a';
                ctx.fill();
                ctx.strokeStyle = '#52525b';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Draw numbers if enabled
            if (showNumbers) {
                ctx.fillStyle = isSelected ? '#000' : '#71717a';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(i + 1), pos.x, pos.y);
            }
        }

        // Draw lines between selected nodes
        if (selectedNodes.length >= 2) {
            ctx.beginPath();
            ctx.strokeStyle = disabled ? '#4b5563' : '#06b6d4';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const first = getNodePosition(selectedNodes[0]);
            ctx.moveTo(first.x, first.y);

            for (let i = 1; i < selectedNodes.length; i++) {
                const pos = getNodePosition(selectedNodes[i]);
                ctx.lineTo(pos.x, pos.y);
            }

            ctx.stroke();
        }

        // Draw line to current cursor position while drawing
        if (isDrawing && currentPos && selectedNodes.length > 0) {
            const lastNode = getNodePosition(selectedNodes[selectedNodes.length - 1]);
            ctx.beginPath();
            ctx.strokeStyle = '#0891b2';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.setLineDash([5, 5]);
            ctx.moveTo(lastNode.x, lastNode.y);
            ctx.lineTo(currentPos.x, currentPos.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }, [selectedNodes, isDrawing, currentPos, size, nodeRadius, disabled, showNumbers, getNodePosition]);

    const getNodeAtPosition = useCallback((x: number, y: number): number | null => {
        for (let i = 0; i < 9; i++) {
            const pos = getNodePosition(i);
            const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
            if (distance <= nodeRadius * 1.5) {
                return i;
            }
        }
        return null;
    }, [getNodePosition, nodeRadius]);

    const getEventPosition = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();

        if ('touches' in e) {
            const touch = e.touches[0] || e.changedTouches[0];
            return {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        }

        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }, []);

    const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (disabled) return;
        e.preventDefault();

        const pos = getEventPosition(e);
        const node = getNodeAtPosition(pos.x, pos.y);

        setIsDrawing(true);
        setCurrentPos(pos);

        if (node !== null) {
            setSelectedNodes([node]);
        } else {
            setSelectedNodes([]);
        }
    }, [disabled, getEventPosition, getNodeAtPosition]);

    const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || disabled) return;
        e.preventDefault();

        const pos = getEventPosition(e);
        setCurrentPos(pos);

        const node = getNodeAtPosition(pos.x, pos.y);
        if (node !== null && !selectedNodes.includes(node)) {
            setSelectedNodes(prev => [...prev, node]);
        }
    }, [isDrawing, disabled, getEventPosition, getNodeAtPosition, selectedNodes]);

    const handleEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        e.preventDefault();

        setIsDrawing(false);
        setCurrentPos(null);

        // Emit the pattern
        if (selectedNodes.length > 0) {
            const pattern = selectedNodes.join(',');
            onChange?.(pattern);
        }
    }, [isDrawing, selectedNodes, onChange]);

    const handleClear = () => {
        setSelectedNodes([]);
        onChange?.('');
    };

    return (
        <div className={cn("relative inline-block", className)}>
            <canvas
                ref={canvasRef}
                width={size}
                height={size}
                className={cn(
                    "rounded-lg border-2 cursor-pointer",
                    disabled
                        ? "border-zinc-700 bg-zinc-900/50 cursor-not-allowed"
                        : "border-white/20 bg-zinc-900/80 hover:border-cyan-500/50"
                )}
                style={{ touchAction: 'none' }} // Prevent scroll on touch
                onMouseDown={handleStart}
                onMouseMove={handleMove}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                onTouchStart={handleStart}
                onTouchMove={handleMove}
                onTouchEnd={handleEnd}
            />

            {/* Clear button */}
            {selectedNodes.length > 0 && !disabled && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold hover:bg-red-400 transition-colors flex items-center justify-center shadow-lg"
                    title="Clear pattern"
                >
                    ✕
                </button>
            )}

            {/* Pattern preview text */}
            {selectedNodes.length > 0 && (
                <div className="mt-2 text-xs text-center text-zinc-500 font-mono">
                    Pattern: {selectedNodes.map(n => n + 1).join(' → ')}
                </div>
            )}
        </div>
    );
}
