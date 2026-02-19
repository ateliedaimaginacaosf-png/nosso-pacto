import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Registro from "./pages/Registro";
import AcessoPendente from "./pages/AcessoPendente";
import ResponsavelDashboard from "./pages/ResponsavelDashboard";
import CriancaDashboard from "./pages/CriancaDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Registro />} />
            <Route path="/acesso-pendente" element={<AcessoPendente />} />
            <Route
              path="/responsavel/*"
              element={
                <ProtectedRoute requiredRole="responsavel">
                  <ResponsavelDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/crianca/*"
              element={
                <ProtectedRoute requiredRole="crianca">
                  <CriancaDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
