import React from "react";
import { createRoot } from "react-dom/client";
import ViewerApp from "./ui/ViewerApp.tsx";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ViewerApp />
  </React.StrictMode>,
);
