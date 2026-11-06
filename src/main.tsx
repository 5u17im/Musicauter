import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./services/diagnostics";

// Importación explícita de todos los módulos CSS para empaquetado en bundle único
import "./styles/tokens.css";
import "./styles/glass.css";
import "./styles/app.css";
import "./styles/sidebar.css";
import "./styles/topbar.css";
import "./styles/playerbar.css";
import "./styles/rows.css";
import "./styles/modals.css";
import "./styles/logviewer.css";
import "./styles/animations.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Falta el contenedor #root");
}

installGlobalErrorHandlers();

ReactDOM.createRoot(root).render(
  <StrictMode>
    <ErrorBoundary scope="la aplicacion" level="root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);