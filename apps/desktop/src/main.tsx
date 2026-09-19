import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { I18nProvider } from "./i18n/useTranslation.js";
import { ThemeProvider } from "./theme/ThemeContext.js";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>
);
