import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Board from './pages/Board';
import { migrateInlineImagesToIndexedDB } from './store/boardsStore';

export default function App() {
  useEffect(() => {
    migrateInlineImagesToIndexedDB().catch((e) => console.error('Image migration failed', e));
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board/:id" element={<Board />} />
      </Routes>
    </HashRouter>
  );
}
