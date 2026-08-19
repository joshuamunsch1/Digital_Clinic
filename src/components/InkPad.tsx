"use client";
import React, { useEffect, useRef, useState } from "react";
import { C } from "@/lib/theme";
import { tr, T, type Lang } from "@/lib/i18n";
import { GhostButton } from "./ui";
import {
  inkIsEmpty, parseInk, serializeInk, strokePath,
  type InkNote, type InkStroke,
} from "@/lib/ink";

const PAD_HEIGHT = 200; // CSS px drawing height for new notes
const INK_COLOR = "#1d2722";

/// Read-only rendering of a stored ink note — plain React SVG built from
/// validated numbers (parseInk), never innerHTML.
export function InkPreview({ ink, maxWidth }: { ink: InkNote; maxWidth?: number }) {
  return (
    <svg
      viewBox={`0 0 ${ink.w} ${ink.h}`}
      style={{
        width: "100%", maxWidth: maxWidth ?? ink.w, height: "auto", display: "block",
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8,
      }}
    >
      {ink.strokes.map((st, i) => (
        <path key={i} d={strokePath(st)} fill="none" stroke={INK_COLOR}
          strokeWidth={st.w} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/// The drawing surface. Strokes live in note-space coordinates (the note's
/// stored w/h), so a note begun on one device re-renders and re-edits
/// undistorted on another viewport width — the canvas merely scales.
function InkPadEditor({ initial, lang, onChange, onClose }: {
  initial: InkNote | null;
  lang: Lang;
  onChange: (serialized: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noteRef = useRef<InkNote>(initial ?? { v: 1, w: 600, h: PAD_HEIGHT, strokes: [] });
  const liveRef = useRef<{ x: number[]; y: number[]; p: number[] } | null>(null);
  const scaleRef = useRef(1);
  const [strokeCount, setStrokeCount] = useState(noteRef.current.strokes.length);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, 0, 0);
    const n = noteRef.current;
    ctx.clearRect(0, 0, n.w, n.h);
    ctx.strokeStyle = INK_COLOR;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const st of n.strokes) {
      ctx.lineWidth = st.w;
      ctx.stroke(new Path2D(strokePath(st)));
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.parentElement?.clientWidth || 600;
    const n = noteRef.current;
    if (n.strokes.length === 0) n.w = cssW; // new note adopts the live width
    scaleRef.current = cssW / n.w;
    const cssH = n.h * scaleRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toNoteSpace = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scaleRef.current,
      y: (e.clientY - rect.top) / scaleRef.current,
    };
  };

  const emit = () => {
    const n = noteRef.current;
    onChange(inkIsEmpty(n) ? "" : serializeInk(n));
    setStrokeCount(n.strokes.length);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // a pen lifted between event and capture must not abort the stroke
    }
    const { x, y } = toNoteSpace(e);
    liveRef.current = { x: [x], y: [y], p: [e.pressure || 0.5] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const live = liveRef.current;
    if (!live) return;
    e.preventDefault();
    const { x, y } = toNoteSpace(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      // Live feedback as plain segments; the smoothed path replaces it on redraw.
      ctx.lineWidth = 1.4 + 2.2 * (e.pressure || 0.5);
      ctx.beginPath();
      ctx.moveTo(live.x[live.x.length - 1], live.y[live.y.length - 1]);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    live.x.push(x);
    live.y.push(y);
    live.p.push(e.pressure || 0.5);
  };

  const onPointerEnd = () => {
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = null;
    const avg = live.p.reduce((a, b) => a + b, 0) / live.p.length;
    const stroke: InkStroke = {
      x: live.x.map((v) => Math.round(v * 10) / 10),
      y: live.y.map((v) => Math.round(v * 10) / 10),
      w: Math.min(4.5, Math.max(1.2, 1.4 + 2.2 * avg)),
    };
    noteRef.current.strokes.push(stroke);
    redraw();
    emit();
  };

  const undo = () => {
    noteRef.current.strokes.pop();
    redraw();
    emit();
  };
  const clear = () => {
    noteRef.current.strokes = [];
    redraw();
    emit();
  };

  return (
    <div>
      <p className="text-xs mb-1" style={{ color: C.muted }}>{tr(T.inkHint, lang)}</p>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          // touchAction none: finger/pen strokes must draw, not scroll the form
          touchAction: "none", display: "block", width: "100%",
          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8,
          cursor: "crosshair",
        }}
      />
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <GhostButton small onClick={undo} disabled={strokeCount === 0}>{tr(T.inkUndo, lang)}</GhostButton>
        <GhostButton small onClick={clear} disabled={strokeCount === 0}>{tr(T.inkClear, lang)}</GhostButton>
        <GhostButton small onClick={onClose}>{tr(T.inkDone, lang)}</GhostButton>
      </div>
    </div>
  );
}

/// Per-field entry point: shows the stored handwriting (if any) with an edit
/// button, or a low-prominence "add" button; open = the drawing pad. The
/// serialized note travels through the ordinary string answer map.
export function InkControl({ value, onChange, lang }: {
  value: string | undefined;
  onChange: (serialized: string) => void;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const ink = parseInk(value);

  if (open) {
    return (
      <div className="mt-2">
        <InkPadEditor initial={ink} lang={lang} onChange={onChange} onClose={() => setOpen(false)} />
      </div>
    );
  }
  if (ink && !inkIsEmpty(ink)) {
    return (
      <div className="mt-2">
        <span className="text-xs font-semibold block mb-1" style={{ color: C.muted }}>{tr(T.inkLabel, lang)}</span>
        <InkPreview ink={ink} />
        <div className="mt-1">
          <GhostButton small onClick={() => setOpen(true)}>{tr(T.inkEdit, lang)}</GhostButton>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <GhostButton small onClick={() => setOpen(true)}>✎ {tr(T.inkAdd, lang)}</GhostButton>
    </div>
  );
}
