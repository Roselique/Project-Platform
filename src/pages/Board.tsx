import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Stage, Layer, Rect, Ellipse, Text, Arrow, Line, Transformer, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useBoardsStore } from '../store/boardsStore';
import type { BoardElement, ElementType, ImageElement } from '../types/board';
import { makeId } from '../utils/id';
import './Board.css';

const STICKY_COLORS = ['#FFE066', '#FF9F6B', '#8CE99A', '#74C0FC', '#FFA8CC', '#B197FC'];
const GRID_SIZE = 32;

type Tool = 'select' | 'sticky' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'pen';

function useImageEl(src: string): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    const el = new window.Image();
    el.src = src;
    el.onload = () => setImg(el);
  }, [src]);
  return img;
}

function CanvasImage({ el, isSelected, onSelect, onChange }: any) {
  const image = useImageEl(el.src);
  const shapeRef = useRef<Konva.Image>(null);
  return (
    <KonvaImage
      ref={shapeRef}
      image={image}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ ...el, x: e.target.x(), y: e.target.y() })}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(board?.camera.scale ?? 1);
  const [pos, setPos] = useState({ x: board?.camera.x ?? 0, y: board?.camera.y ?? 0 });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [nameValue, setNameValue] = useState(board?.name ?? '');
  const [isPanning, setIsPanning] = useState(false);

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorIndexRef = useRef(0);
  const drawingLineRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (board) {
      setElements(board.elements);
      setScale(board.camera.scale);
      setPos({ x: board.camera.x, y: board.camera.y });
      setNameValue(board.name);
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
    (updater: (prev: BoardElement[]) => BoardElement[]) => {
      setElements((prev) => {
        const next = updater(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  useEffect(() => {
    if (!id) return;
    updateCamera(id, { x: pos.x, y: pos.y, scale });
  }, [pos, scale, id, updateCamera]);

  useEffect(() => {
    if (trRef.current && layerRef.current) {
      if (selectedId) {
        const node = layerRef.current.findOne(`#${selectedId}`);
        if (node) {
          trRef.current.nodes([node]);
          trRef.current.getLayer()?.batchDraw();
          return;
        }
      }
      trRef.current.nodes([]);
    }
  }, [selectedId, elements]);

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
        el = { ...common, type: 'rect', width: 180, height: 120, fill: '#74C0FC', strokeWidth: 0 } as any;
        break;
      case 'ellipse':
        el = { ...common, type: 'ellipse', width: 160, height: 160, fill: '#B197FC', strokeWidth: 0 } as any;
        break;
      default:
        return;
    }
    applyElements((prev) => [...prev, el]);
    setSelectedId(idNew);
    setTool('select');
    if (type === 'sticky' || type === 'text') {
      setEditingTextId(idNew);
      setEditingValue(type === 'text' ? 'Text' : '');
    }
  }

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = stageRef.current;
    if (!stage) return;
    const clickedOnEmpty = e.target === stage;

    if (tool === 'select') {
      if (clickedOnEmpty) {
        setSelectedId(null);
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
      applyElements((prev) =>
        prev.map((el) =>
          el.id === drawingLineRef.current && (el.type === 'arrow' || el.type === 'line')
            ? { ...el, points: [el.points[0], el.points[1], world.x, world.y] }
            : el
        )
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
    if (!selectedId) return;
    applyElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selectedId) return;
    const el = elements.find((e) => e.id === selectedId);
    if (!el) return;
    const copy = { ...el, id: makeId(8), x: el.x + 24, y: el.y + 24 };
    applyElements((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'v') setTool('select');
      else if (e.key === 's') setTool('sticky');
      else if (e.key === 't') setTool('text');
      else if (e.key === 'r') setTool('rect');
      else if (e.key === 'o') setTool('ellipse');
      else if (e.key === 'a') setTool('arrow');
      else if (e.key === 'Escape') setSelectedId(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 320;
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const idNew = makeId(8);
        const el: ImageElement = {
          id: idNew,
          type: 'image',
          x: (window.innerWidth / 2 - pos.x) / scale - (img.width * ratio) / 2,
          y: (window.innerHeight / 2 - pos.y) / scale - (img.height * ratio) / 2,
          width: img.width * ratio,
          height: img.height * ratio,
          rotation: 0,
          fill: 'transparent',
          draggable: true,
          src,
        };
        applyElements((prev) => [...prev, el]);
        setSelectedId(idNew);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

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
        <button className="board-toolbar__btn" onClick={duplicateSelected} disabled={!selectedId} title="Duplicate (Cmd+D)">
          ⧉
        </button>
        <button className="board-toolbar__btn" onClick={deleteSelected} disabled={!selectedId} title="Delete">
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
            const isSelected = el.id === selectedId;
            const common = {
              key: el.id,
              id: el.id,
              onClick: () => tool === 'select' && setSelectedId(el.id),
              onTap: () => tool === 'select' && setSelectedId(el.id),
            };

            if (el.type === 'sticky') {
              return (
                <StickyNote
                  {...common}
                  el={el}
                  isSelected={isSelected}
                  onChange={updateElement}
                  hidden={editingTextId === el.id}
                  onDblClick={() => {
                    setEditingTextId(el.id);
                    setEditingValue(el.text);
                  }}
                />
              );
            }
            if (el.type === 'text') {
              return (
                <Text
                  {...common}
                  x={el.x}
                  y={el.y}
                  text={el.text || 'Text'}
                  fontSize={el.fontSize}
                  fill={el.color}
                  fontFamily="'Inter', sans-serif"
                  draggable
                  rotation={el.rotation}
                  onDblClick={() => {
                    setEditingTextId(el.id);
                    setEditingValue(el.text);
                  }}
                  onDragEnd={(e) => updateElement({ ...el, x: e.target.x(), y: e.target.y() })}
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
                  fill={el.fill}
                  cornerRadius={10}
                  rotation={el.rotation}
                  draggable
                  onDragEnd={(e) => updateElement({ ...el, x: e.target.x(), y: e.target.y() })}
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
                  fill={el.fill}
                  rotation={el.rotation}
                  draggable
                  onDragEnd={(e) =>
                    updateElement({ ...el, x: e.target.x() - el.width / 2, y: e.target.y() - el.height / 2 })
                  }
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
              return <CanvasImage key={el.id} el={el} isSelected={isSelected} onSelect={common.onClick} onChange={updateElement} />;
            }
            return null;
          })}
          <Transformer
            ref={trRef}
            rotateEnabled
            flipEnabled={false}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>

      {editingTextId &&
        (() => {
          const el = elements.find((e) => e.id === editingTextId);
          if (!el) return null;
          const screenX = el.x * scale + pos.x;
          const screenY = el.y * scale + pos.y;
          const isSticky = el.type === 'sticky';
          return (
            <textarea
              autoFocus
              className={isSticky ? 'board-editor board-editor--sticky' : 'board-editor'}
              style={{
                left: screenX,
                top: screenY,
                width: el.width * scale,
                height: (isSticky ? el.height : 60) * scale,
                fontSize: (el as any).fontSize * scale,
                background: isSticky ? (el as any).fill : 'transparent',
                color: isSticky ? '#1a1a1a' : (el as any).color,
              }}
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={() => {
                updateElement({ ...(el as any), text: editingValue });
                setEditingTextId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingTextId(null);
                if (e.key === 'Enter' && !isSticky && !e.shiftKey) {
                  e.preventDefault();
                  updateElement({ ...(el as any), text: editingValue });
                  setEditingTextId(null);
                }
              }}
            />
          );
        })()}
    </div>
  );
}

function StickyNote({ el, isSelected, onChange, onDblClick, onClick, onTap, id, hidden }: any) {
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
        onDragEnd={(e: any) => onChange({ ...el, x: e.target.x(), y: e.target.y() })}
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
          fontFamily="'Inter', sans-serif"
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
