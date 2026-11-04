import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { MiniPlayer } from "./miniplayer/MiniPlayer";

import "./styles/tokens.css";
import "./styles/glass.css";
import "./styles/mini.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Falta el contenedor #root");
}

ReactDOM.createRoot(root).render(
  <StrictMode>
    <MiniPlayer />
  </StrictMode>,
);
