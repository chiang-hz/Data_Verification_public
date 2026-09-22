// src/index.js
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";
import { JiebaProvider } from "./contexts/JiebaContext";
import { FileManagerProvider } from "./contexts/FileManagerContext";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <FileManagerProvider>
      <JiebaProvider>
        <App />
      </JiebaProvider>
    </FileManagerProvider>
  </StrictMode>
);
