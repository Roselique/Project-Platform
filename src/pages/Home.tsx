import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBoardsStore } from '../store/boardsStore';
import './Home.css';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Home() {
  const boards = useBoardsStore((s) => s.boards);
  const createBoard = useBoardsStore((s) => s.createBoard);
  const deleteBoard = useBoardsStore((s) => s.deleteBoard);
  const renameBoard = useBoardsStore((s) => s.renameBoard);
  const duplicateBoard = useBoardsStore((s) => s.duplicateBoard);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const boardList = useMemo(
    () =>
      Object.values(boards)
        .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [boards, query]
  );

  function handleCreate() {
    const id = createBoard();
    navigate(`/board/${id}`);
  }

  function commitRename(id: string) {
    if (renameValue.trim()) renameBoard(id, renameValue);
    setRenamingId(null);
  }

  return (
    <div className="home">
      <div className="home__aurora" aria-hidden="true" />

      <header className="home__header">
        <div className="home__brand">
          <span className="home__logo">◆</span>
          <span className="home__brand-name">Canvasly</span>
        </div>
        <div className="home__search">
          <input
            type="text"
            placeholder="Search boards…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="home__new-btn" onClick={handleCreate}>
          <span className="home__new-btn-icon">+</span> New board
        </button>
      </header>

      <main className="home__main">
        <div className="home__intro">
          <h1>
            Your <em>infinite</em> canvas, always at hand.
          </h1>
          <p>Sketch ideas, drop sticky notes, and map out anything — then pick up exactly where you left off.</p>
        </div>

        {boardList.length === 0 ? (
          <div className="home__empty">
            <div className="home__empty-illustration">
              <div className="home__empty-note home__empty-note--a" />
              <div className="home__empty-note home__empty-note--b" />
              <div className="home__empty-note home__empty-note--c" />
            </div>
            <h2>{query ? 'No boards match your search' : 'No boards yet'}</h2>
            {!query && (
              <>
                <p>Create your first board to start sketching, planning, or brainstorming.</p>
                <button className="home__new-btn home__new-btn--large" onClick={handleCreate}>
                  <span className="home__new-btn-icon">+</span> Create a board
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="home__grid">
            <button className="board-card board-card--create" onClick={handleCreate}>
              <div className="board-card--create-icon">+</div>
              <span>New board</span>
            </button>

            {boardList.map((board) => (
              <div
                className="board-card"
                key={board.id}
                onClick={() => navigate(`/board/${board.id}`)}
              >
                <div className="board-card__thumb">
                  {board.thumbnail ? (
                    <img src={board.thumbnail} alt="" />
                  ) : (
                    <div className="board-card__thumb-placeholder">
                      <span>{board.name.slice(0, 1).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <div className="board-card__footer">
                  {renamingId === board.id ? (
                    <input
                      className="board-card__rename-input"
                      autoFocus
                      value={renameValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(board.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(board.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span className="board-card__name">{board.name}</span>
                  )}
                  <span className="board-card__time">Edited {timeAgo(board.updatedAt)}</span>
                </div>

                <div className="board-card__menu" onClick={(e) => e.stopPropagation()}>
                  <details>
                    <summary>⋯</summary>
                    <div className="board-card__menu-items">
                      <button
                        onClick={() => {
                          setRenamingId(board.id);
                          setRenameValue(board.name);
                        }}
                      >
                        Rename
                      </button>
                      <button onClick={() => navigate(`/board/${duplicateBoard(board.id)}`)}>
                        Duplicate
                      </button>
                      <button
                        className="board-card__menu-danger"
                        onClick={() => {
                          if (confirm(`Delete "${board.name}"? This can't be undone.`)) {
                            deleteBoard(board.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
