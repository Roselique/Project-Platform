import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Board from './pages/Board';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board/:id" element={<Board />} />
      </Routes>
    </HashRouter>
  );
}
