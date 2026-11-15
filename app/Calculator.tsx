"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (el: HTMLElement, options?: Record<string, unknown>) => { destroy: () => void };
      ScientificCalculator: (el: HTMLElement, options?: Record<string, unknown>) => { destroy: () => void };
    };
  }
}

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 460;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 320;

type Mode = "graphing" | "scientific";

export default function Calculator({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("graphing");
  const [pos, setPos] = useState(() => ({
    x: Math.max(20, window.innerWidth / 2 - DEFAULT_WIDTH / 2),
    y: 80,
  }));
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  useEffect(() => {
    let calculator: { destroy: () => void } | undefined;
    let cancelled = false;

    function mount() {
      // The script may still be loading from a previous mode: bail out if
      // this effect was cleaned up (mode changed again) before it fired.
      if (cancelled) return;
      if (containerRef.current && window.Desmos) {
        containerRef.current.innerHTML = "";
        const factory = mode === "graphing" ? window.Desmos.GraphingCalculator : window.Desmos.ScientificCalculator;
        calculator = factory(
          containerRef.current,
          mode === "graphing" ? { keypad: true, expressions: true, settingsMenu: false } : undefined
        );
      }
    }

    if (window.Desmos) {
      mount();
    } else {
      const script = document.createElement("script");
      script.src = "https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6";
      script.onload = mount;
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      calculator?.destroy();
    };
  }, [mode]);

  function onDragPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDragPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  }
  function onDragPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.width, origH: size.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    setSize({
      width: Math.max(MIN_WIDTH, resizeRef.current.origW + (e.clientX - resizeRef.current.startX)),
      height: Math.max(MIN_HEIGHT, resizeRef.current.origH + (e.clientY - resizeRef.current.startY)),
    });
  }
  function onResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      className="fixed bg-white border rounded-lg shadow-2xl z-40 flex flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}
    >
      <div
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        className="flex items-center justify-between px-3 py-2 bg-black text-white cursor-move select-none touch-none shrink-0"
      >
        <div className="flex bg-gray-700 rounded overflow-hidden text-xs font-semibold">
          <button
            onClick={() => setMode("graphing")}
            onPointerDown={(e) => e.stopPropagation()}
            className={`px-3 py-1.5 ${mode === "graphing" ? "bg-white text-black" : "text-gray-200 hover:bg-gray-600"}`}
          >
            Graphing
          </button>
          <button
            onClick={() => setMode("scientific")}
            onPointerDown={(e) => e.stopPropagation()}
            className={`px-3 py-1.5 ${mode === "scientific" ? "bg-white text-black" : "text-gray-200 hover:bg-gray-600"}`}
          >
            Scientific
          </button>
        </div>
        <span className="text-gray-400 text-xs tracking-widest">⋮⋮⋮</span>
        <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} className="text-white text-lg px-1">✕</button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none flex items-end justify-end p-0.5 text-gray-400"
        title="Resize"
      >
        ⤡
      </div>
    </div>
  );
}
