import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import AppLayout from "./layouts/AppLayout";
import AIClips from "./pages/AIClips";
import Campaigns from "./pages/Campaigns";
import Dashboard from "./pages/Dashboard";
import Earnings from "./pages/Earnings";
import Editor from "./pages/Editor";
import NewProject from "./pages/NewProject";
import ProjectDetail from "./pages/ProjectDetail";
import Projects from "./pages/Projects";
import SettingsPage from "./pages/Settings";
import Templates from "./pages/Templates";
import { Empty } from "./components/ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<NewProject />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="clips" element={<AIClips />} />
          <Route path="editor" element={<Editor />} />
          <Route path="editor/:id" element={<Editor />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="earnings" element={<Earnings />} />
          <Route path="templates" element={<Templates />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Empty title="Page not found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
