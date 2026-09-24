import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Stage,
  Layer,
  Rect,
  Ellipse,
  RegularPolygon,
  Star,
  Text,
  Arrow,
  Line,
  Transformer,
  Image as KonvaImage,
} from 'react-konva';
import type Konva from 'konva';
import { useBoardsStore } from '../store/boardsStore';
import type { BoardElement, ElementType, ImageElement, ShapeElement } from '../types/board';
import { makeId } from '../utils/id';
import './Board.css';

const STICKY_COLORS = ['#FFE066', '#FF9F6B', '#8CE99A', '#74C0FC', '#FFA8CC', '#B197FC'];
const GRID_SIZE = 32;
const FONT_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];
const FALLBACK_FONTS = [
  'Inter',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Palatino',
  'Garamond',
  'Segoe UI',
  'Calibri',
  'Cambria',
  'Consolas',
  'Tahoma',
  'Comic Sans MS',
  'Impact',
];

function stepFontSize(current: number, dir: 1 | -1): number {
  if (dir === 1) {
    const next = FONT_SIZE_STEPS.find((s) => s > current);
    return next ?? FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1];
  }
  const next = [...FONT_SIZE_STEPS].reverse().find((s) => s < current);
  return next ?? FONT_SIZE_STEPS[0];
}
const SHAPE_TYPES = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'star']);
const CENTERED_TYPES = new Set(['ellipse', 'triangle', 'diamond', 'star']);

type Tool = 'select' | 'sticky' | 'text' | 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'star' | 'arrow' | 'pen';

function hexToRgba(hex: string | undefined, alpha: number): string {
  if (!hex || hex === 'transparent') return 'rgba(0,0,0,0)';
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getFillProps(el: ShapeElement, centered: boolean) {
  const alpha = el.fillOpacity ?? 1;
  if (el.fillGradient) {
    const start = centered ? { x: -el.width / 2, y: -el.height / 2 } : { x: 0, y: 0 };
    const end = centered ? { x: el.width / 2, y: el.height / 2 } : { x: el.width, y: el.height };
    return {
      fillPriority: 'linear-gradient' as const,
      fillLinearGradientStartPoint: start,
      fillLinearGradientEndPoint: end,
      fillLinearGradientColorStops: [
        0,
        hexToRgba(el.fillGradient.from, alpha),
        1,
        hexToRgba(el.fillGradient.to, alpha),
      ],
    };
  }
  return { fill: hexToRgba(el.fill, alpha) };
}

function useImageEl(src: string): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    const el = new window.Image();
    el.src = src;
    el.onload = () => setImg(el);
  }, [src]);
  return img;
}

function CanvasImage({ el, isSelected, onSelect, onChange, dragSync }: any) {
  const image = useImageEl(el.src);
  const shapeRef = useRef<Konva.Image>(null);
  return (
    <KonvaImage
      ref={shapeRef}
      id={el.id}
      image={image}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={dragSync.onStart}
      onDragMove={dragSync.onMove}
      onDragEnd={(e) => {
        if (dragSync.active) {
          dragSync.onEnd();
          return;
        }
        onChange({ ...el, x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={() => {
        const node = shapeRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          ...el,
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(20, node.width() * scaleX),
          height: Math.max(20, node.height() * scaleY),
        });
      }}
      name={isSelected ? 'selected-node' : undefined}
    />
  );
}

export default function Board() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const board = useBoardsStore((s) => (id ? s.boards[id] : undefined));
  const updateElements = useBoardsStore((s) => s.updateElements);
  const updateCamera = useBoardsStore((s) => s.updateCamera);
  const updateThumbnail = useBoardsStore((s) => s.updateThumbnail);
  const renameBoard = useBoardsStore((s) => s.renameBoard);

  const [elements, setElements] = useState<BoardElement[]>(board?.elements ?? []);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scale, setScale] = useState(board?.camera.scale ?? 1);
  const [pos, setPos] = useState({ x: board?.camera.x ?? 0, y: board?.camera.y ?? 0 });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [nameValue, setNameValue] = useState(board?.name ?? '');
  const [isPanning, setIsPanning] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsStatus, setFontsStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorIndexRef = useRef(0);
  const drawingLineRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pastRef = useRef<BoardElement[][]>([]);
  const futureRef = useRef<BoardElement[][]>([]);
  const elementsRef = useRef<BoardElement[]>(elements);
  const dragBaselineRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (board) {
      setElements(board.elements);
      elementsRef.current = board.elements;
      pastRef.current = [];
      futureRef.current = [];
      setScale(board.camera.scale);
      setPos({ x: board.camera.x, y: board.camera.y });
      setNameValue(board.name);
      setSelectedIds([]);
    }
  }, [board?.id]);

  const scheduleSave = useCallback(
    (next: BoardElement[]) => {
      if (!id) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        updateElements(id, next);
        const stage = stageRef.current;
        if (stage) {
          try {
            const uri = stage.toDataURL({ pixelRatio: 0.3 });
            updateThumbnail(id, uri);
          } catch {
            /* ignore canvas taint errors */
          }
        }
      }, 400);
    },
    [id, updateElements, updateThumbnail]
  );

  const applyElements = useCallback(
    (updater: (prev: BoardElement[]) => BoardElement[], recordHistory = true) => {
      setElements((prev) => {
        const next = updater(prev);
        if (recordHistory) {
          pastRef.current = [...pastRef.current.slice(-49), prev];
          futureRef.current = [];
        }
        elementsRef.current = next;
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, elementsRef.current];
    elementsRef.current = previous;
    setElements(previous);
    scheduleSave(previous);
  }, [scheduleSave]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, elementsRef.current];
    elementsRef.current = next;
    setElements(next);
    scheduleSave(next);
  }, [scheduleSave]);

  useEffect(() => {
    if (!id) return;
    updateCamera(id, { x: pos.x, y: pos.y, scale });
  }, [pos, scale, id, updateCamera]);

  useEffect(() => {
    if (trRef.current && layerRef.current) {
      const nodes = selectedIds
        .map((sid) => layerRef.current!.findOne(`#${sid}`))
        .filter((n): n is Konva.Node => !!n);
      trRef.current.nodes(nodes);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selectedIds, elements]);

  if (!id || !board) {
    return (
      <div className="board-missing">
        <p>This board doesn't exist.</p>
        <button onClick={() => navigate('/')}>Back to home</button>
      </div>
    );
  }

  function screenToWorld(x: number, y: number) {
    return { x: (x - pos.x) / scale, y: (y - pos.y) / scale };
  }

  function addElement(type: ElementType, worldPos: { x: number; y: number }) {
    const idNew = makeId(8);
    let el: BoardElement;
    const common = {
      id: idNew,
      x: worldPos.x,
      y: worldPos.y,
      rotation: 0,
      draggable: true,
    };
    switch (type) {
      case 'sticky': {
        const color = STICKY_COLORS[colorIndexRef.current % STICKY_COLORS.length];
        colorIndexRef.current += 1;
        el = { ...common, type: 'sticky', width: 200, height: 200, fill: color, text: '', fontSize: 20 };
        break;
      }
      case 'text':
        el = { ...common, type: 'text', width: 240, height: 40, fill: 'transparent', text: 'Text', fontSize: 28, color: '#1a1a1a' };
        break;
      case 'rect':
        el = {
          ...common,
          type: 'rect',
          width: 180,
          height: 120,
          fill: '#74C0FC',
          stroke: '#1a1a1a',
          strokeWidth: 0,
          cornerRadius: 10,
        } as any;
        break;
      case 'ellipse':
        el = { ...common, type: 'ellipse', width: 160, height: 160, fill: '#B197FC', stroke: '#1a1a1a', strokeWidth: 0 } as any;
        break;
      case 'triangle':
        el = { ...common, type: 'triangle', width: 160, height: 150, fill: '#FFA8CC', stroke: '#1a1a1a', strokeWidth: 0 } as any;
        break;
      case 'diamond':
        el = { ...common, type: 'diamond', width: 160, height: 160, fill: '#8CE99A', stroke: '#1a1a1a', strokeWidth: 0 } as any;
        break;
      case 'star':
        el = { ...common, type: 'star', width: 160, height: 160, fill: '#FFE066', stroke: '#1a1a1a', strokeWidth: 0 } as any;
        break;
      default:
        return;
    }
    applyElements((prev) => [...prev, el]);
    setSelectedIds([idNew]);
    setTool('select');
    if (type === 'sticky' || type === 'text') {
      setEditingTextId(idNew);
      setEditingValue(type === 'text' ? 'Text' : '');
    }
  }

  function selectElement(elId: string, additive: boolean) {
    const target = elementsRef.current.find((e) => e.id === elId);
    if (!target) return;
    const groupIds = target.groupId
      ? elementsRef.current.filter((e) => e.groupId === target.groupId).map((e) => e.id)
      : [elId];
    setSelectedIds((prev) => {
      if (additive) {
        const allIn = groupIds.every((gid) => prev.includes(gid));
        if (allIn) return prev.filter((pid) => !groupIds.includes(pid));
        return Array.from(new Set([...prev, ...groupIds]));
      }
      return groupIds;
    });
  }

  function handleGroupDragStart(activeId: string) {
    const layer = layerRef.current;
    if (!layer || selectedIds.length < 2 || !selectedIds.includes(activeId)) return;
    const map = new Map<string, { x: number; y: number }>();
    for (const sid of selectedIds) {
      const node = layer.findOne(`#${sid}`);
      if (node) map.set(sid, { x: node.x(), y: node.y() });
    }
    dragBaselineRef.current = map;
  }

  function handleGroupDragMove(activeId: string, node: Konva.Node) {
    if (selectedIds.length < 2 || !selectedIds.includes(activeId)) return;
    const baseline = dragBaselineRef.current;
    const activeBase = baseline.get(activeId);
    const layer = layerRef.current;
    if (!activeBase || !layer) return;
    const dx = node.x() - activeBase.x;
    const dy = node.y() - activeBase.y;
    for (const sid of selectedIds) {
      if (sid === activeId) continue;
      const base = baseline.get(sid);
      const n = layer.findOne(`#${sid}`);
      if (base && n) n.position({ x: base.x + dx, y: base.y + dy });
    }
    layer.batchDraw();
  }

  function handleGroupDragEnd() {
    const layer = layerRef.current;
    if (!layer || selectedIds.length < 2) return;
    const updates = new Map<string, BoardElement>();
    for (const sid of selectedIds) {
      const el = elementsRef.current.find((e) => e.id === sid);
      const node = layer.findOne(`#${sid}`);
      if (!el || !node) continue;
      if (el.type === 'arrow' || el.type === 'line') {
        const dx = node.x();
        const dy = node.y();
        node.position({ x: 0, y: 0 });
        updates.set(sid, { ...el, points: el.points.map((p, i) => (i % 2 === 0 ? p + dx : p + dy)) });
      } else if (CENTERED_TYPES.has(el.type)) {
        updates.set(sid, { ...el, x: node.x() - el.width / 2, y: node.y() - el.height / 2 });
      } else {
        updates.set(sid, { ...el, x: node.x(), y: node.y() });
      }
    }
    applyElements((prev) => prev.map((e) => updates.get(e.id) ?? e));
    dragBaselineRef.current = new Map();
  }

  function groupSelected() {
    if (selectedIds.length < 2) return;
    const gid = makeId(8);
    applyElements((prev) => prev.map((e) => (selectedIds.includes(e.id) ? { ...e, groupId: gid } : e)));
  }

  function ungroupSelected() {
    if (selectedIds.length === 0) return;
    applyElements((prev) => prev.map((e) => (selectedIds.includes(e.id) ? { ...e, groupId: null } : e)));
  }

  function reorderSelection(mode: 'forward' | 'backward' | 'front' | 'back') {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    applyElements((prev) => {
      const arr = [...prev];
      if (mode === 'front') {
        const sel = arr.filter((e) => ids.has(e.id));
        const rest = arr.filter((e) => !ids.has(e.id));
        return [...rest, ...sel];
      }
      if (mode === 'back') {
        const sel = arr.filter((e) => ids.has(e.id));
        const rest = arr.filter((e) => !ids.has(e.id));
        return [...sel, ...rest];
      }
      if (mode === 'forward') {
        for (let i = arr.length - 2; i >= 0; i--) {
          if (ids.has(arr[i].id) && !ids.has(arr[i + 1].id)) {
            [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          }
        }
        return arr;
      }
      for (let i = 1; i < arr.length; i++) {
        if (ids.has(arr[i].id) && !ids.has(arr[i - 1].id)) {
          [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        }
      }
      return arr;
    });
  }

  function updateSelected(patch: (el: BoardElement) => Partial<BoardElement>) {
    if (selectedIds.length === 0) return;
    applyElements((prev) =>
      prev.map((e) => (selectedIds.includes(e.id) ? ({ ...e, ...patch(e) } as BoardElement) : e))
    );
  }

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = stageRef.current;
    if (!stage) return;
    const clickedOnEmpty = e.target === stage;

    if (tool === 'select') {
      if (clickedOnEmpty) {
        setSelectedIds([]);
        setIsPanning(true);
      }
      return;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const world = screenToWorld(pointer.x, pointer.y);

    if (tool === 'arrow' || tool === 'pen') {
      const idNew = makeId(8);
      const el: BoardElement = {
        id: idNew,
        type: tool === 'arrow' ? 'arrow' : 'line',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        fill: '#1a1a1a',
        stroke: '#1a1a1a',
        draggable: true,
        strokeWidth: 3,
        points: [world.x, world.y, world.x, world.y],
      } as any;
      drawingLineRef.current = idNew;
      applyElements((prev) => [...prev, el]);
      return;
    }

    addElement(tool as ElementType, world);
  }

  function handleStageMouseMove() {
    const stage = stageRef.current;
    if (!stage) return;
    if (drawingLineRef.current) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const world = screenToWorld(pointer.x, pointer.y);
      applyElements(
        (prev) =>
          prev.map((el) =>
            el.id === drawingLineRef.current && (el.type === 'arrow' || el.type === 'line')
              ? { ...el, points: [el.points[0], el.points[1], world.x, world.y] }
              : el
          ),
        false
      );
    }
  }

  function handleStageMouseUp() {
    if (drawingLineRef.current) {
      drawingLineRef.current = null;
      setTool('select');
    }
    setIsPanning(false);
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (e.evt.ctrlKey || e.evt.metaKey) {
      const scaleBy = 1.05;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = Math.min(4, Math.max(0.1, direction > 0 ? oldScale * scaleBy : oldScale / scaleBy));
      const mousePointTo = { x: (pointer.x - pos.x) / oldScale, y: (pointer.y - pos.y) / oldScale };
      setScale(newScale);
      setPos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
    } else {
      setPos((p) => ({ x: p.x - e.evt.deltaX, y: p.y - e.evt.deltaY }));
    }
  }

  function zoomBy(factor: number) {
    const stage = stageRef.current;
    const center = stage ? { x: stage.width() / 2, y: stage.height() / 2 } : { x: 0, y: 0 };
    const newScale = Math.min(4, Math.max(0.1, scale * factor));
    const mousePointTo = { x: (center.x - pos.x) / scale, y: (center.y - pos.y) / scale };
    setScale(newScale);
    setPos({ x: center.x - mousePointTo.x * newScale, y: center.y - mousePointTo.y * newScale });
  }

  function updateElement(updated: BoardElement) {
    applyElements((prev) => prev.map((el) => (el.id === updated.id ? updated : el)));
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    applyElements((prev) => prev.filter((el) => !ids.has(el.id)));
    setSelectedIds([]);
  }

  function duplicateSelected() {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    const idMap = new Map<string, string>();
    const groupIdMap = new Map<string, string>();
    const copies = elements
      .filter((e) => ids.has(e.id))
      .map((el) => {
        const newId = makeId(8);
        idMap.set(el.id, newId);
        let newGroupId: string | null | undefined = el.groupId;
        if (el.groupId) {
          if (!groupIdMap.has(el.groupId)) groupIdMap.set(el.groupId, makeId(8));
          newGroupId = groupIdMap.get(el.groupId);
        }
        return { ...el, id: newId, x: el.x + 24, y: el.y + 24, groupId: newGroupId };
      });
    applyElements((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'BracketRight') {
        e.preventDefault();
        reorderSelection(e.shiftKey ? 'front' : 'forward');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === 'BracketLeft') {
        e.preventDefault();
        reorderSelection(e.shiftKey ? 'back' : 'backward');
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        deleteSelected();
      } else if (e.key === 'v') setTool('select');
      else if (e.key === 's') setTool('sticky');
      else if (e.key === 't') setTool('text');
      else if (e.key === 'r') setTool('rect');
      else if (e.key === 'o') setTool('ellipse');
      else if (e.key === 'a') setTool('arrow');
      else if (e.key === 'Escape') setSelectedIds([]);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const addImageElement = useCallback(
    (src: string, loadImg: HTMLImageElement) => {
      const maxDim = 320;
      const ratio = Math.min(maxDim / loadImg.width, maxDim / loadImg.height, 1);
      const idNew = makeId(8);
      const el: ImageElement = {
        id: idNew,
        type: 'image',
        x: (window.innerWidth / 2 - pos.x) / scale - (loadImg.width * ratio) / 2,
        y: (window.innerHeight / 2 - pos.y) / scale - (loadImg.height * ratio) / 2,
        width: loadImg.width * ratio,
        height: loadImg.height * ratio,
        rotation: 0,
        fill: 'transparent',
        draggable: true,
        src,
      };
      applyElements((prev) => [...prev, el]);
      setSelectedIds([idNew]);
    },
    [pos, scale, applyElements]
  );

  const placeImageFromSrc = useCallback(
    (src: string) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => addImageElement(src, img);
      img.onerror = () => {
        const fallback = new window.Image();
        fallback.onload = () => addImageElement(src, fallback);
        fallback.onerror = () => console.error('Could not load pasted image:', src);
        fallback.src = src;
      };
      img.src = src;
    },
    [addImageElement]
  );

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => placeImageFromSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function loadSystemFonts() {
    const w = window as any;
    if (typeof w.queryLocalFonts !== 'function') {
      setFontsStatus('error');
      return;
    }
    setFontsStatus('loading');
    try {
      const fonts: any[] = await w.queryLocalFonts();
      const families = Array.from(new Set(fonts.map((f) => f.family as string))).sort((a, b) =>
        a.localeCompare(b)
      );
      setSystemFonts(families);
      setFontsStatus('idle');
    } catch {
      setFontsStatus('error');
    }
  }

  useEffect(() => {
    function isImageUrl(str: string) {
      if (str.startsWith('data:image')) return true;
      try {
        const u = new URL(str);
        return /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(u.pathname);
      } catch {
        return false;
      }
    }

    function handlePaste(e: ClipboardEvent) {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              const reader = new FileReader();
              reader.onload = () => placeImageFromSrc(reader.result as string);
              reader.readAsDataURL(file);
              return;
            }
          }
        }
      }

      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text && isImageUrl(text)) {
        e.preventDefault();
        placeImageFromSrc(text);
        return;
      }

      const html = e.clipboardData?.getData('text/html');
      if (html) {
        const match = html.match(/<img[^>]+src="([^"]+)"/i);
        if (match) {
          e.preventDefault();
          placeImageFromSrc(match[1]);
        }
      }
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [placeImageFromSrc]);

  const cursor = useMemo(() => {
    if (tool === 'select') return isPanning ? 'grabbing' : 'default';
    return 'crosshair';
  }, [tool, isPanning]);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <button className="board-icon-btn" onClick={() => navigate('/')} title="Back to home">
          ←
        </button>
        <input
          className="board-title-input"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={() => renameBoard(id, nameValue)}
          onKeyDown={(e) => (e.key === 'Enter' ? (e.target as HTMLInputElement).blur() : null)}
        />
        <div className="board-topbar__spacer" />
        <div className="board-zoom">
          <button onClick={() => zoomBy(0.85)}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => zoomBy(1.15)}>+</button>
        </div>
      </header>

      <div className="board-toolbar">
        {([
          ['select', '↖', 'Select (V)'],
          ['sticky', '▧', 'Sticky note (S)'],
          ['text', 'T', 'Text (T)'],
          ['rect', '▭', 'Rectangle (R)'],
          ['ellipse', '◯', 'Ellipse (O)'],
          ['triangle', '▲', 'Triangle'],
          ['diamond', '◆', 'Diamond'],
          ['star', '★', 'Star'],
          ['arrow', '↗', 'Arrow (A)'],
        ] as [Tool, string, string][]).map(([t, icon, label]) => (
          <button
            key={t}
            className={`board-toolbar__btn ${tool === t ? 'is-active' : ''}`}
            onClick={() => setTool(t)}
            title={label}
          >
            {icon}
          </button>
        ))}
        <div className="board-toolbar__divider" />
        <button className="board-toolbar__btn" onClick={() => fileInputRef.current?.click()} title="Upload image">
          🖼
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
        <div className="board-toolbar__divider" />
        <button className="board-toolbar__btn" onClick={undo} title="Undo (Cmd+Z)">
          ↺
        </button>
        <button className="board-toolbar__btn" onClick={redo} title="Redo (Cmd+Shift+Z)">
          ↻
        </button>
        <div className="board-toolbar__divider" />
        <button className="board-toolbar__btn" onClick={duplicateSelected} disabled={selectedIds.length === 0} title="Duplicate (Cmd+D)">
          ⧉
        </button>
        <button className="board-toolbar__btn" onClick={deleteSelected} disabled={selectedIds.length === 0} title="Delete">
          🗑
        </button>
      </div>

      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        x={pos.x}
        y={pos.y}
        scaleX={scale}
        scaleY={scale}
        draggable={tool === 'select'}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setPos({ x: e.target.x(), y: e.target.y() });
        }}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchStart={handleStageMouseDown}
        onTouchMove={handleStageMouseMove}
        onTouchEnd={handleStageMouseUp}
        onWheel={handleWheel}
        style={{ cursor, background: '#eef0f4' }}
      >
        <Layer listening={false}>
          <GridBackground pos={pos} scale={scale} />
        </Layer>
        <Layer ref={layerRef}>
          {elements.map((el) => {
            const isSelected = selectedIds.includes(el.id);
            const isMultiActive = selectedIds.length > 1 && isSelected;
            const dragSync = {
              active: isMultiActive,
              onStart: () => handleGroupDragStart(el.id),
              onMove: (e: Konva.KonvaEventObject<DragEvent>) => handleGroupDragMove(el.id, e.target),
              onEnd: () => handleGroupDragEnd(),
            };
            const common = {
              key: el.id,
              id: el.id,
              onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
                tool === 'select' && selectElement(el.id, e.evt.shiftKey),
              onTap: () => tool === 'select' && selectElement(el.id, false),
              onDragStart: dragSync.onStart,
              onDragMove: dragSync.onMove,
            };

            if (el.type === 'sticky') {
              return (
                <StickyNote
                  {...common}
                  el={el}
                  isSelected={isSelected}
                  onChange={updateElement}
                  hidden={editingTextId === el.id}
                  dragSync={dragSync}
                  onDblClick={() => {
                    selectElement(el.id, false);
                    setEditingTextId(el.id);
                    setEditingValue(el.text);
                  }}
                />
              );
            }
            if (el.type === 'text') {
              const fontStyle = [el.bold ? 'bold' : '', el.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal';
              return (
                <Text
                  {...common}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  text={el.text || 'Text'}
                  fontSize={el.fontSize}
                  fontStyle={fontStyle}
                  textDecoration={el.underline ? 'underline' : ''}
                  fill={el.color}
                  fontFamily={`'${el.fontFamily || 'Inter'}', sans-serif`}
                  wrap="word"
                  draggable
                  rotation={el.rotation}
                  visible={editingTextId !== el.id}
                  onDblClick={() => {
                    selectElement(el.id, false);
                    setEditingTextId(el.id);
                    setEditingValue(el.text);
                  }}
                  onDragEnd={(e) => {
                    if (dragSync.active) {
                      dragSync.onEnd();
                      return;
                    }
                    updateElement({ ...el, x: e.target.x(), y: e.target.y() });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Text;
                    const scaleX = node.scaleX();
                    node.scaleX(1);
                    node.scaleY(1);
                    updateElement({
                      ...el,
                      x: node.x(),
                      y: node.y(),
                      rotation: node.rotation(),
                      width: Math.max(40, el.width * scaleX),
                    });
                  }}
                />
              );
            }
            if (el.type === 'rect') {
              return (
                <Rect
                  {...common}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  {...getFillProps(el, false)}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                  cornerRadius={el.cornerRadius ?? 0}
                  rotation={el.rotation}
                  draggable
                  onDragEnd={(e) => {
                    if (dragSync.active) {
                      dragSync.onEnd();
                      return;
                    }
                    updateElement({ ...el, x: e.target.x(), y: e.target.y() });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Rect;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    updateElement({
                      ...el,
                      x: node.x(),
                      y: node.y(),
                      rotation: node.rotation(),
                      width: Math.max(20, node.width() * scaleX),
                      height: Math.max(20, node.height() * scaleY),
                    });
                  }}
                />
              );
            }
            if (el.type === 'ellipse') {
              return (
                <Ellipse
                  {...common}
                  x={el.x + el.width / 2}
                  y={el.y + el.height / 2}
                  radiusX={el.width / 2}
                  radiusY={el.height / 2}
                  {...getFillProps(el, true)}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                  rotation={el.rotation}
                  draggable
                  onDragEnd={(e) => {
                    if (dragSync.active) {
                      dragSync.onEnd();
                      return;
                    }
                    updateElement({ ...el, x: e.target.x() - el.width / 2, y: e.target.y() - el.height / 2 });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Ellipse;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    const w = Math.max(20, el.width * scaleX);
                    const h = Math.max(20, el.height * scaleY);
                    updateElement({
                      ...el,
                      x: node.x() - w / 2,
                      y: node.y() - h / 2,
                      rotation: node.rotation(),
                      width: w,
                      height: h,
                    });
                  }}
                />
              );
            }
            if (el.type === 'triangle') {
              return (
                <RegularPolygon
                  {...common}
                  x={el.x + el.width / 2}
                  y={el.y + el.height / 2}
                  sides={3}
                  radius={el.width / 2}
                  scaleY={el.height / el.width}
                  {...getFillProps(el, true)}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                  rotation={el.rotation}
                  draggable
                  onDragEnd={(e) => {
                    if (dragSync.active) {
                      dragSync.onEnd();
                      return;
                    }
                    updateElement({ ...el, x: e.target.x() - el.width / 2, y: e.target.y() - el.height / 2 });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.RegularPolygon;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    const w = Math.max(20, el.width * scaleX);
                    const h = Math.max(20, el.width * scaleY);
                    updateElement({
                      ...el,
                      x: node.x() - w / 2,
                      y: node.y() - h / 2,
                      rotation: node.rotation(),
                      width: w,
                      height: h,
                    });
                  }}
                />
              );
            }
            if (el.type === 'diamond') {
              return (
                <RegularPolygon
                  {...common}
                  x={el.x + el.width / 2}
                  y={el.y + el.height / 2}
                  sides={4}
                  radius={el.width / 2}
                  scaleY={el.height / el.width}
                  {...getFillProps(el, true)}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                  rotation={el.rotation}
                  draggable
                  onDragEnd={(e) => {
                    if (dragSync.active) {
                      dragSync.onEnd();
                      return;
                    }
                    updateElement({ ...el, x: e.target.x() - el.width / 2, y: e.target.y() - el.height / 2 });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.RegularPolygon;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    const w = Math.max(20, el.width * scaleX);
                    const h = Math.max(20, el.width * scaleY);
                    updateElement({
                      ...el,
                      x: node.x() - w / 2,
                      y: node.y() - h / 2,
                      rotation: node.rotation(),
                      width: w,
                      height: h,
                    });
                  }}
                />
              );
            }
            if (el.type === 'star') {
              return (
                <Star
                  {...common}
                  x={el.x + el.width / 2}
                  y={el.y + el.height / 2}
                  numPoints={5}
                  innerRadius={el.width / 4}
                  outerRadius={el.width / 2}
                  scaleY={el.height / el.width}
                  {...getFillProps(el, true)}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                  rotation={el.rotation}
                  draggable
                  onDragEnd={(e) => {
                    if (dragSync.active) {
                      dragSync.onEnd();
                      return;
                    }
                    updateElement({ ...el, x: e.target.x() - el.width / 2, y: e.target.y() - el.height / 2 });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Star;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    const w = Math.max(20, el.width * scaleX);
                    const h = Math.max(20, el.width * scaleY);
                    updateElement({
                      ...el,
                      x: node.x() - w / 2,
                      y: node.y() - h / 2,
                      rotation: node.rotation(),
                      width: w,
                      height: h,
                    });
                  }}
                />
              );
            }
            if (el.type === 'arrow') {
              return (
                <Arrow
                  {...common}
                  points={el.points}
                  stroke={el.stroke}
                  fill={el.stroke}
                  strokeWidth={el.strokeWidth}
                  draggable
                  onDragEnd={(e) => {
                    if (dragSync.active) {
                      dragSync.onEnd();
                      return;
                    }
                    const dx = e.target.x();
                    const dy = e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    updateElement({
                      ...el,
                      points: [el.points[0] + dx, el.points[1] + dy, el.points[2] + dx, el.points[3] + dy],
                    });
                  }}
                />
              );
            }
            if (el.type === 'line') {
              return (
                <Line
                  {...common}
                  points={el.points}
                  stroke={el.stroke}
                  strokeWidth={el.strokeWidth}
                  lineCap="round"
                  lineJoin="round"
                  draggable
                  onDragEnd={(e) => {
                    if (dragSync.active) {
                      dragSync.onEnd();
                      return;
                    }
                    const dx = e.target.x();
                    const dy = e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    updateElement({
                      ...el,
                      points: [el.points[0] + dx, el.points[1] + dy, el.points[2] + dx, el.points[3] + dy],
                    });
                  }}
                />
              );
            }
            if (el.type === 'image') {
              return (
                <CanvasImage
                  key={el.id}
                  el={el}
                  isSelected={isSelected}
                  onSelect={common.onClick}
                  onChange={updateElement}
                  dragSync={dragSync}
                />
              );
            }
            return null;
          })}
          <Transformer
            ref={trRef}
            rotateEnabled
            flipEnabled={false}
            enabledAnchors={
              elements.find((e) => e.id === selectedId)?.type === 'text'
                ? ['middle-left', 'middle-right']
                : undefined
            }
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>

      {editingTextId &&
        (() => {
          const el = elements.find((e) => e.id === editingTextId);
          if (!el || (el.type !== 'sticky' && el.type !== 'text')) return null;
          const screenX = el.x * scale + pos.x;
          const screenY = el.y * scale + pos.y;
          const isSticky = el.type === 'sticky';

          function toggleStyle(key: 'bold' | 'italic' | 'underline') {
            if (!el) return;
            updateElement({ ...(el as any), [key]: !(el as any)[key] });
          }

          function commitAndClose() {
            if (!el) return;
            updateElement({ ...(el as any), text: editingValue });
            setEditingTextId(null);
          }

          const fontOptions = Array.from(
            new Set([el.fontFamily || 'Inter', ...(systemFonts.length ? systemFonts : FALLBACK_FONTS)])
          );

          return (
            <>
              <div
                className="board-format-toolbar"
                style={{ left: screenX, top: screenY - 46 }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <select
                  className="board-format-font-select"
                  value={el.fontFamily || 'Inter'}
                  onChange={(ev) => updateElement({ ...(el as any), fontFamily: ev.target.value })}
                  title="Font family"
                >
                  {fontOptions.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </option>
                  ))}
                </select>
                <button
                  className="board-format-btn board-format-btn--fonts"
                  onClick={loadSystemFonts}
                  title={
                    fontsStatus === 'error'
                      ? "Couldn't load fonts from this device (try Chrome/Edge and allow the permission)"
                      : 'Load every font installed on this computer'
                  }
                >
                  {fontsStatus === 'loading' ? '…' : '⟳'}
                </button>
                <div className="board-format-size">
                  <button onClick={() => updateElement({ ...(el as any), fontSize: stepFontSize(el.fontSize, -1) })} title="Smaller">
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={400}
                    value={el.fontSize}
                    onChange={(ev) => {
                      const v = Number(ev.target.value);
                      if (!Number.isNaN(v) && v > 0) updateElement({ ...(el as any), fontSize: v });
                    }}
                  />
                  <button onClick={() => updateElement({ ...(el as any), fontSize: stepFontSize(el.fontSize, 1) })} title="Bigger">
                    +
                  </button>
                </div>
                <button
                  className={`board-format-btn ${el.bold ? 'is-active' : ''}`}
                  onClick={() => toggleStyle('bold')}
                  title="Bold"
                >
                  B
                </button>
                <button
                  className={`board-format-btn board-format-btn--italic ${el.italic ? 'is-active' : ''}`}
                  onClick={() => toggleStyle('italic')}
                  title="Italic"
                >
                  I
                </button>
                <button
                  className={`board-format-btn board-format-btn--underline ${el.underline ? 'is-active' : ''}`}
                  onClick={() => toggleStyle('underline')}
                  title="Underline"
                >
                  U
                </button>
              </div>
              <textarea
                autoFocus
                className={isSticky ? 'board-editor board-editor--sticky' : 'board-editor'}
                style={{
                  left: screenX,
                  top: screenY,
                  width: el.width * scale,
                  height: (isSticky ? el.height : Math.max(el.height, 60)) * scale,
                  fontSize: (el as any).fontSize * scale,
                  fontFamily: `'${el.fontFamily || 'Inter'}', sans-serif`,
                  fontWeight: el.bold ? 700 : 400,
                  fontStyle: el.italic ? 'italic' : 'normal',
                  textDecoration: el.underline ? 'underline' : 'none',
                  background: isSticky ? (el as any).fill : 'transparent',
                  color: isSticky ? '#1a1a1a' : (el as any).color,
                }}
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={commitAndClose}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingTextId(null);
                  if (e.key === 'Enter' && !isSticky && !e.shiftKey) {
                    e.preventDefault();
                    commitAndClose();
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
                    e.preventDefault();
                    toggleStyle('bold');
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
                    e.preventDefault();
                    toggleStyle('italic');
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
                    e.preventDefault();
                    toggleStyle('underline');
                  }
                }}
              />
            </>
          );
        })()}

      {selectedIds.length > 0 &&
        (() => {
          const selectedEls = elements.filter((e) => selectedIds.includes(e.id));
          if (selectedEls.length === 0) return null;
          const isShape = selectedEls.some((e) => SHAPE_TYPES.has(e.type));
          const isLine = selectedEls.some((e) => e.type === 'arrow' || e.type === 'line');
          const shapeRep: any =
            selectedEls.find((e) => SHAPE_TYPES.has(e.type)) ??
            selectedEls.find((e) => e.type === 'arrow' || e.type === 'line');
          const representative = selectedEls[0];
          const allSameGroup =
            selectedEls.length > 1 &&
            !!representative.groupId &&
            selectedEls.every((e) => e.groupId === representative.groupId);
          const canGroup = selectedIds.length > 1 && !allSameGroup;

          return (
            <div className="board-props-panel">
              {(isShape || isLine) && shapeRep && (
                <>
                  {isShape && (
                    <>
                      <div className="board-props-row">
                        <span>Fill</span>
                        <div className="board-props-segmented">
                          <button
                            className={!shapeRep.fillGradient ? 'is-active' : ''}
                            onClick={() => updateSelected((e) => (SHAPE_TYPES.has(e.type) ? { fillGradient: null } : {}))}
                          >
                            Solid
                          </button>
                          <button
                            className={shapeRep.fillGradient ? 'is-active' : ''}
                            onClick={() =>
                              updateSelected((e) =>
                                SHAPE_TYPES.has(e.type)
                                  ? {
                                      fillGradient: (e as any).fillGradient ?? {
                                        from: (e as any).fill && (e as any).fill.startsWith('#') ? (e as any).fill : '#74C0FC',
                                        to: '#1a1a1a',
                                      },
                                    }
                                  : {}
                              )
                            }
                          >
                            Gradient
                          </button>
                        </div>
                      </div>

                      {!shapeRep.fillGradient ? (
                        <label className="board-props-row">
                          <span>Colour</span>
                          <input
                            type="color"
                            value={shapeRep.fill && shapeRep.fill.startsWith('#') ? shapeRep.fill : '#74C0FC'}
                            onChange={(e) =>
                              updateSelected((el2) => (SHAPE_TYPES.has(el2.type) ? { fill: e.target.value } : {}))
                            }
                          />
                          <button
                            className="board-props-transparent-btn"
                            onClick={() =>
                              updateSelected((el2) =>
                                SHAPE_TYPES.has(el2.type)
                                  ? { fillOpacity: (el2 as any).fillOpacity === 0 ? 1 : 0 }
                                  : {}
                              )
                            }
                            title="Toggle transparent fill"
                          >
                            {shapeRep.fillOpacity === 0 ? 'Show' : 'Transparent'}
                          </button>
                        </label>
                      ) : (
                        <>
                          <label className="board-props-row">
                            <span>From</span>
                            <input
                              type="color"
                              value={shapeRep.fillGradient.from}
                              onChange={(e) =>
                                updateSelected((el2) =>
                                  SHAPE_TYPES.has(el2.type) && (el2 as any).fillGradient
                                    ? { fillGradient: { ...(el2 as any).fillGradient, from: e.target.value } }
                                    : {}
                                )
                              }
                            />
                          </label>
                          <label className="board-props-row">
                            <span>To</span>
                            <input
                              type="color"
                              value={shapeRep.fillGradient.to}
                              onChange={(e) =>
                                updateSelected((el2) =>
                                  SHAPE_TYPES.has(el2.type) && (el2 as any).fillGradient
                                    ? { fillGradient: { ...(el2 as any).fillGradient, to: e.target.value } }
                                    : {}
                                )
                              }
                            />
                          </label>
                        </>
                      )}

                      <label className="board-props-row">
                        <span>Opacity</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round((shapeRep.fillOpacity ?? 1) * 100)}
                          onChange={(e) =>
                            updateSelected((el2) =>
                              SHAPE_TYPES.has(el2.type) ? { fillOpacity: Number(e.target.value) / 100 } : {}
                            )
                          }
                        />
                        <span className="board-props-value">{Math.round((shapeRep.fillOpacity ?? 1) * 100)}%</span>
                      </label>
                    </>
                  )}

                  <label className="board-props-row">
                    <span>Outline</span>
                    <input
                      type="color"
                      value={shapeRep.stroke && shapeRep.stroke.startsWith('#') ? shapeRep.stroke : '#1a1a1a'}
                      onChange={(e) =>
                        updateSelected((el2) =>
                          SHAPE_TYPES.has(el2.type) || el2.type === 'arrow' || el2.type === 'line'
                            ? { stroke: e.target.value }
                            : {}
                        )
                      }
                    />
                  </label>
                  <label className="board-props-row">
                    <span>Thickness</span>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      value={shapeRep.strokeWidth ?? 0}
                      onChange={(e) =>
                        updateSelected((el2) =>
                          SHAPE_TYPES.has(el2.type) || el2.type === 'arrow' || el2.type === 'line'
                            ? { strokeWidth: Number(e.target.value) }
                            : {}
                        )
                      }
                    />
                    <span className="board-props-value">{shapeRep.strokeWidth ?? 0}</span>
                  </label>
                  {shapeRep.type === 'rect' && (
                    <label className="board-props-row">
                      <span>Corner radius</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.floor(Math.min(shapeRep.width, shapeRep.height) / 2)}
                        value={shapeRep.cornerRadius ?? 0}
                        onChange={(e) =>
                          updateSelected((el2) => (el2.type === 'rect' ? { cornerRadius: Number(e.target.value) } : {}))
                        }
                      />
                      <span className="board-props-value">{shapeRep.cornerRadius ?? 0}</span>
                    </label>
                  )}
                  <div className="board-props-divider" />
                </>
              )}

              <div className="board-props-row">
                <span>Order</span>
                <div className="board-props-btn-group">
                  <button onClick={() => reorderSelection('back')} title="Send to back (Cmd+Shift+[)">
                    ⇤
                  </button>
                  <button onClick={() => reorderSelection('backward')} title="Send backward (Cmd+[)">
                    ←
                  </button>
                  <button onClick={() => reorderSelection('forward')} title="Bring forward (Cmd+])">
                    →
                  </button>
                  <button onClick={() => reorderSelection('front')} title="Bring to front (Cmd+Shift+])">
                    ⇥
                  </button>
                </div>
              </div>

              {(canGroup || allSameGroup) && (
                <div className="board-props-row">
                  <span>Group</span>
                  {canGroup ? (
                    <button className="board-props-action-btn" onClick={groupSelected}>
                      Group (Cmd+G)
                    </button>
                  ) : (
                    <button className="board-props-action-btn" onClick={ungroupSelected}>
                      Ungroup (Cmd+Shift+G)
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}

function StickyNote({ el, isSelected, onChange, onDblClick, onClick, onTap, id, hidden, dragSync }: any) {
  return (
    <>
      <Rect
        id={id}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        fill={el.fill}
        cornerRadius={4}
        shadowColor="rgba(0,0,0,0.25)"
        shadowBlur={12}
        shadowOffset={{ x: 0, y: 6 }}
        shadowOpacity={isSelected ? 0.4 : 0.2}
        rotation={el.rotation}
        draggable
        onClick={onClick}
        onTap={onTap}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onDragStart={dragSync.onStart}
        onDragMove={dragSync.onMove}
        onDragEnd={(e: any) => {
          if (dragSync.active) {
            dragSync.onEnd();
            return;
          }
          onChange({ ...el, x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={(e: any) => {
          const node = e.target;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...el,
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(60, node.width() * scaleX),
            height: Math.max(60, node.height() * scaleY),
          });
        }}
      />
      {!hidden && el.text && (
        <Text
          x={el.x + 12}
          y={el.y + 12}
          width={el.width - 24}
          height={el.height - 24}
          text={el.text}
          fontSize={el.fontSize}
          fontStyle={[el.bold ? 'bold' : '', el.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'}
          textDecoration={el.underline ? 'underline' : ''}
          fontFamily={`'${el.fontFamily || 'Inter'}', sans-serif`}
          fill="#1a1a1a"
          rotation={el.rotation}
          listening={false}
          wrap="word"
        />
      )}
    </>
  );
}

function GridBackground({ pos, scale }: { pos: { x: number; y: number }; scale: number }) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const size = GRID_SIZE * scale;
  if (size < 8) return null;
  const startX = -((pos.x % size) + size) % size;
  const startY = -((pos.y % size) + size) % size;
  const lines = [];
  for (let x = startX; x < w; x += size) {
    lines.push(<Line key={`v${x}`} points={[x, 0, x, h]} stroke="#dfe3ea" strokeWidth={1} />);
  }
  for (let y = startY; y < h; y += size) {
    lines.push(<Line key={`h${y}`} points={[0, y, w, y]} stroke="#dfe3ea" strokeWidth={1} />);
  }
  return <>{lines}</>;
}
