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
import { ProfessionalStudio } from "./pages/ProfessionalStudio";
import { LandingPage } from "./pages/LandingPage";
import { OwnerAdmin } from "./pages/OwnerAdmin";
import { OwnerPortalShell } from "./components/OwnerPortalShell";

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

function RequireOwnerAdmin({ children }: { children: ReactNode }) {
  const { session, isOwnerAdmin, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><Spinner size={28} className="text-primary" /></div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (!isOwnerAdmin) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function MainRoutes() {
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/auth" element={<AuthScreen />} />
    <Route element={<RequireAuth><Shell /></RequireAuth>}>
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="writing" element={<WritingStudio />} />
      <Route path="professional" element={<ProfessionalStudio />} />
      <Route path="plan/:runId" element={<Planning />} />
      <Route path="knowledge/:runId" element={<KnowledgeExplorer />} />
      <Route path="literature/:runId" element={<LiteratureRoom />} />
      <Route path="gap/:runId" element={<GapFinder />} />
      <Route path="hypothesis/:runId" element={<HypothesisStudio />} />
      <Route path="experiment/:runId" element={<ExperimentDesigner />} />
      <Route path="report/:runId" element={<ReportGenerator />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

function OwnerRoutes() {
  return <Routes>
    <Route path="/auth" element={<AuthScreen ownerOnly />} />
    <Route path="/admin" element={<RequireOwnerAdmin><OwnerPortalShell><OwnerAdmin /></OwnerPortalShell></RequireOwnerAdmin>} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes>;
}

export default function App() {
  const ownerPortal = import.meta.env.VITE_APP_SURFACE === "owner";
  return <AuthProvider><BrowserRouter><RunProvider>
    {ownerPortal ? <OwnerRoutes /> : <MainRoutes />}
  </RunProvider></BrowserRouter></AuthProvider>;
}
