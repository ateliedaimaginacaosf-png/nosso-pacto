import { Suspense, lazy, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, ClipboardList, Gift, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

const GerenciarMembros = lazy(() => import("./GerenciarMembros"));
const GerenciarTarefas = lazy(() => import("./GerenciarTarefas"));
const GerenciarRecompensas = lazy(() => import("./GerenciarRecompensas"));

const TabLoader = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

export default function Configuracoes() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "membros";
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Configurações</h1>
          <p className="text-muted-foreground">Gerencie membros, modelos de tarefas e recompensas</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="membros" className="gap-1.5">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Membros</span>
            </TabsTrigger>
            <TabsTrigger value="tarefas" className="gap-1.5">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Tarefas</span>
            </TabsTrigger>
            <TabsTrigger value="recompensas" className="gap-1.5">
              <Gift className="h-4 w-4" />
              <span className="hidden sm:inline">Recompensas</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="membros">
            <Suspense fallback={<TabLoader />}>
              <GerenciarMembros embedded />
            </Suspense>
          </TabsContent>
          <TabsContent value="tarefas">
            <Suspense fallback={<TabLoader />}>
              <GerenciarTarefas embedded />
            </Suspense>
          </TabsContent>
          <TabsContent value="recompensas">
            <Suspense fallback={<TabLoader />}>
              <GerenciarRecompensas embedded />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
