"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = [
  { name: "yellow", value: "#fde68a" },
  { name: "blue", value: "#bfdbfe" },
  { name: "pink", value: "#fbcfe8" },
];

export default function HighlightableHTML({ html, className }: { html: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      if (containerRef.current?.contains(e.target as Node)) return;
      setToolbarPos(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !containerRef.current) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;
    savedRangeRef.current = range.cloneRange();
    const rect = range.getBoundingClientRect();
    setToolbarPos({ x: rect.left + rect.width / 2, y: rect.top });
  }

  function applyColor(color: string) {
    const range = savedRangeRef.current;
    if (!range) return;
    // Undo any existing highlights this range overlaps before applying the new color.
    unwrapOverlapping(range);
    const mark = document.createElement("mark");
    mark.style.backgroundColor = color;
    mark.className = "sat-highlight";
    try {
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    } catch {
      // Selection crossed an awkward node boundary — skip rather than corrupt the DOM.
    }
    window.getSelection()?.removeAllRanges();
    setToolbarPos(null);
    savedRangeRef.current = null;
  }

  function unwrapOverlapping(range: Range) {
    if (!containerRef.current) return;
    const marks = containerRef.current.querySelectorAll("mark.sat-highlight");
    marks.forEach((mark) => {
      if (!range.intersectsNode(mark)) return;
      const parent = mark.parentNode;
      while (mark.firstChild) parent?.insertBefore(mark.firstChild, mark);
      parent?.removeChild(mark);
    });
  }

  function removeHighlight() {
    const range = savedRangeRef.current;
    if (!range) return;
    unwrapOverlapping(range);
    window.getSelection()?.removeAllRanges();
    setToolbarPos(null);
    savedRangeRef.current = null;
  }

  return (
    <>
      {toolbarPos && (
        <div
          ref={toolbarRef}
          className="fixed z-50 flex items-center gap-1 bg-white border rounded-full shadow-lg px-2 py-1.5"
          style={{ left: toolbarPos.x, top: toolbarPos.y - 8, transform: "translate(-50%, -100%)" }}
        >
          {COLORS.map((c) => (
            <button
              key={c.name}
              onClick={() => applyColor(c.value)}
              className="w-6 h-6 rounded-full border border-gray-300"
              style={{ backgroundColor: c.value }}
              title={`Highlight ${c.name}`}
            />
          ))}
          <span className="w-px h-5 bg-gray-200" />
          <button
            onClick={removeHighlight}
            className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 text-xs hover:bg-gray-50"
            title="Remove highlight"
          >
            ✕
          </button>
        </div>
      )}
      <div ref={containerRef} className={className} onMouseUp={handleMouseUp} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
