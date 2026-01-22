import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Landing, Room } from "./pages";
import { UserProvider } from "./contexts";
import "./App.css";

function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}

export default App;
