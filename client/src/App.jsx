import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HealthPage } from './pages/HealthPage.jsx';

export function App() {
  return (
    <BrowserRouter>
      <header>
        <strong>FieldOps</strong>
        <nav>
          <Link to="/">Status</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HealthPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
