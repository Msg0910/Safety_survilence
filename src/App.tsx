import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Home from './pages/Home';
import CameraGrid from './pages/CameraGrid';
import AddCamera from './pages/AddCamera';
import Employees from './pages/Employees';

function App() {
  return (
    <Router>
      <Toaster position="top-right" />
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/camera-grid" element={<CameraGrid />} />
          <Route path="/add-camera" element={<AddCamera />} />
          <Route path="/employees" element={<Employees />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;