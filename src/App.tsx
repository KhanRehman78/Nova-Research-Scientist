import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { RunProvider } from "./context/RunContext";
import { AuthScreen } from "./components/AuthScreen";
import { Shell } from "./components/Shell";
import { Spinner } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Planning } from "./pages/Planning";
import { KnowledgeExplorer } from "./pages/KnowledgeExplorer";
import { LiteratureRoom } from "./pages/LiteratureRoom";
import { GapFinder } from "./pages/GapFinder";
import { HypothesisStudio } from "./pages/HypothesisStudio";
import { ExperimentDesigner } from "./pages/ExperimentDesigner";
import { ReportGenerator } from "./pages/ReportGenerator";
import { WritingStudio } from "./pages/WritingStudio";

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-foreground/60">
          <Spinner size={28} className="text-primary" />
          <span className="text-sm">Waking up NOVA…</span>
        </div>
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RunProvider>
          <Routes>
            <Route path="/auth" element={<AuthScreen />} />
            <Route
              path="/"
              element={<Shell />}
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="writing" element={<RequireAuth><WritingStudio /></RequireAuth>} />
              <Route path="plan/:runId" element={<RequireAuth><Planning /></RequireAuth>} />
              <Route path="knowledge/:runId" element={<RequireAuth><KnowledgeExplorer /></RequireAuth>} />
              <Route path="literature/:runId" element={<RequireAuth><LiteratureRoom /></RequireAuth>} />
              <Route path="gap/:runId" element={<RequireAuth><GapFinder /></RequireAuth>} />
              <Route path="hypothesis/:runId" element={<RequireAuth><HypothesisStudio /></RequireAuth>} />
              <Route path="experiment/:runId" element={<RequireAuth><ExperimentDesigner /></RequireAuth>} />
              <Route path="report/:runId" element={<RequireAuth><ReportGenerator /></RequireAuth>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </RunProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
