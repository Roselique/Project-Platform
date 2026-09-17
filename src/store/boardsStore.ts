import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Board, BoardElement } from '../types/board';

const STORAGE_KEY = 'canvasly.boards.v1';

function loadBoards(): Record<string, Board> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persist(boards: Record<string, Board>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch (e) {
    console.error('Failed to save boards', e);
  }
}

interface BoardsState {
  boards: Record<string, Board>;
  createBoard: (name?: string) => string;
  deleteBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;
  duplicateBoard: (id: string) => string;
  getBoard: (id: string) => Board | undefined;
  updateElements: (id: string, elements: BoardElement[]) => void;
  updateCamera: (id: string, camera: Board['camera']) => void;
  updateThumbnail: (id: string, thumbnail: string) => void;
}

export const useBoardsStore = create<BoardsState>((set, get) => ({
  boards: loadBoards(),

  createBoard: (name) => {
    const id = nanoid(10);
    const now = Date.now();
    const board: Board = {
      id,
      name: name?.trim() || 'Untitled board',
      createdAt: now,
      updatedAt: now,
      elements: [],
      camera: { x: 0, y: 0, scale: 1 },
    };
    const boards = { ...get().boards, [id]: board };
    set({ boards });
    persist(boards);
    return id;
  },

  deleteBoard: (id) => {
    const boards = { ...get().boards };
    delete boards[id];
    set({ boards });
    persist(boards);
  },

  renameBoard: (id, name) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], name: name.trim() || 'Untitled board', updatedAt: Date.now() };
    set({ boards });
    persist(boards);
  },

  duplicateBoard: (id) => {
    const src = get().boards[id];
    if (!src) return '';
    const newId = nanoid(10);
    const now = Date.now();
    const boards = {
      ...get().boards,
      [newId]: { ...src, id: newId, name: `${src.name} copy`, createdAt: now, updatedAt: now },
    };
    set({ boards });
    persist(boards);
    return newId;
  },

  getBoard: (id) => get().boards[id],

  updateElements: (id, elements) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], elements, updatedAt: Date.now() };
    set({ boards });
    persist(boards);
  },

  updateCamera: (id, camera) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], camera };
    set({ boards });
    persist(boards);
  },

  updateThumbnail: (id, thumbnail) => {
    const boards = { ...get().boards };
    if (!boards[id]) return;
    boards[id] = { ...boards[id], thumbnail };
    set({ boards });
    persist(boards);
  },
}));
