import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Archive, ClipboardList, MessageSquare, Calendar, User, Coins, X } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;
type Profile = Tables<"profiles">;

type Periodo = "hoje" | "semana" | "mes";
type StatusFiltro = "todos" | "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "dispensa_solicitada" | "arquivada";

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A fazer", icon: ClipboardList, color: "text-primary", badgeVariant: "default" },
  pendente_aprovacao: { label: "Aguardando", icon: Clock, color: "text-yellow-600", badgeVariant: "outline" },
  concluida: { label: "Concluída", icon: CheckCircle2, color: "text-success", badgeVariant: "secondary" },
  rejeitada: { label: "Rejeitada", icon: AlertTriangle, color: "text-destructive", badgeVariant: "destructive" },
  dispensa_solicitada: { label: "Dispensa", icon: Clock, color: "text-orange-500", badgeVariant: "outline" },
  arquivada: { label: "Dispensada", icon: Archive, color: "text-muted-foreground", badgeVariant: "secondary" },
};

function getDateRange(periodo: Periodo): { start: string; end: string } {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  switch (periodo) {
    case "hoje":
      return { start: todayStr, end: todayStr };
    case "semana": {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      return { start: format(s, "yyyy-MM-dd"), end: todayStr };
    }
    case "mes": {
      const s = startOfMonth(now);
      return { start: format(s, "yyyy-MM-dd"), end: todayStr };
    }
  }
}

export default function AcompanharTarefas() {
  const { profile } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [criancaId, setCriancaId] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);

  const { data: criancas } = useQuery({
    queryKey: ["criancas-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("tipo_perfil", "crianca");
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  const dateRange = getDateRange(periodo);

  const { data: tarefas, isLoading } = useQuery({
    queryKey: ["acompanhar-tarefas", profile?.familia_id, dateRange.start, dateRange.end, criancaId],
    queryFn: async () => {
      let query = supabase
        .from("tarefa")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .gte("data_prevista", dateRange.start)
        .lte("data_prevista", dateRange.end)
        .order("data_prevista", { ascending: true });

      if (criancaId !== "todos") {
        query = query.eq("atribuida_a", criancaId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  const filtradas = (tarefas ?? []).filter((t) => {
    if (statusFiltro !== "todos" && t.status !== statusFiltro) return false;
    return true;
  });

  const getNomeCrianca = (userId: string | null) => {
    if (!userId) return "Sem atribuição";
    return criancas?.find((c) => c.user_id === userId)?.nome ?? "Desconhecido";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Acompanhar Tarefas 📋</h1>
          <p className="text-muted-foreground">Visualize as tarefas diárias dos filhos</p>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <TabsList>
              <TabsTrigger value="hoje">Hoje</TabsTrigger>
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="mes">Mês</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={criancaId} onValueChange={setCriancaId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Criança" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os filhos</SelectItem>
              {criancas?.map((c) => (
                <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="a_fazer">A fazer</SelectItem>
              <SelectItem value="pendente_aprovacao">Aguardando</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="rejeitada">Rejeitada</SelectItem>
              <SelectItem value="dispensa_solicitada">Dispensa solicitada</SelectItem>
              <SelectItem value="arquivada">Dispensada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !filtradas.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhuma tarefa encontrada</p>
              <p className="text-sm text-muted-foreground">Ajuste os filtros para ver mais resultados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtradas.map((t, i) => {
              const cfg = statusConfig[t.status] ?? statusConfig.a_fazer;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedTarefa(t)}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-muted ${cfg.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{t.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {getNomeCrianca(t.atribuida_a)} • {t.data_prevista ? format(new Date(t.data_prevista + "T00:00:00"), "dd MMM", { locale: ptBR }) : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.status === "arquivada" || t.status === "dispensa_solicitada" ? (
                          <span className="text-xs text-muted-foreground/60 line-through">{t.valor_moedas} 🪙</span>
                        ) : (
                          <span className="text-xs font-medium text-coin">{t.valor_moedas} 🪙</span>
                        )}
                        <Badge variant={cfg.badgeVariant} className="text-xs">
                          {cfg.label}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Task Detail Sheet */}
        <Sheet open={!!selectedTarefa} onOpenChange={(open) => !open && setSelectedTarefa(null)}>
          <SheetContent className="overflow-y-auto">
            {selectedTarefa && (() => {
              const t = selectedTarefa;
              const cfg = statusConfig[t.status] ?? statusConfig.a_fazer;
              const StatusIcon = cfg.icon;
              const categoriaLabels: Record<string, string> = {
                limpeza: "Limpeza", estudos: "Estudos", exercicio: "Exercício",
                higiene: "Higiene", alimentacao: "Alimentação", organizacao: "Organização", outros: "Outros",
              };
              return (
                <>
                  <SheetHeader>
                    <SheetTitle className="text-left">{t.nome}</SheetTitle>
                  </SheetHeader>

                  <div className="mt-4 space-y-4">
                    {/* Status & Value */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={cfg.badgeVariant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                      <Badge variant="outline" className={`gap-1 ${t.status === "arquivada" || t.status === "dispensa_solicitada" || t.status === "rejeitada" ? "line-through opacity-50" : ""}`}>
                        <Coins className="h-3 w-3" />
                        {t.valor_moedas} moedas
                      </Badge>
                      <Badge variant="outline">{categoriaLabels[t.categoria] ?? t.categoria}</Badge>
                    </div>

                    {t.descricao && (
                      <p className="text-sm text-muted-foreground">{t.descricao}</p>
                    )}

                    <Separator />

                    {/* Info grid */}
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Atribuída a</p>
                          <p className="text-sm font-medium">{getNomeCrianca(t.atribuida_a)}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Data prevista</p>
                          <p className="text-sm font-medium">
                            {t.data_prevista ? format(new Date(t.data_prevista + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "—"}
                          </p>
                        </div>
                      </div>

                      {t.data_conclusao && (
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 text-success" />
                          <div>
                            <p className="text-xs text-muted-foreground">Concluída em</p>
                            <p className="text-sm font-medium">
                              {format(new Date(t.data_conclusao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      )}

                      {t.data_aprovacao && (
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t.status === "concluida" ? "Aprovada em" : t.status === "arquivada" ? "Dispensa aceita em" : "Decisão em"}
                            </p>
                            <p className="text-sm font-medium">
                              {format(new Date(t.data_aprovacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2">
                        <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Criada em</p>
                          <p className="text-sm font-medium">
                            {format(new Date(t.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Messages */}
                    {(t.justificativa || t.comentario_responsavel) && (
                      <>
                        <Separator />
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <MessageSquare className="h-4 w-4" /> Mensagens
                          </h4>

                          {t.justificativa && (
                            <div className="rounded-lg bg-muted p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                {getNomeCrianca(t.atribuida_a)} {t.status === "dispensa_solicitada" || t.status === "arquivada" ? "(pedido de dispensa)" : "(conclusão)"}
                              </p>
                              <p className="text-sm">{t.justificativa}</p>
                            </div>
                          )}

                          {t.comentario_responsavel && (
                            <div className="rounded-lg bg-primary/10 p-3">
                              <p className="text-xs font-medium text-primary mb-1">Responsável (feedback)</p>
                              <p className="text-sm">{t.comentario_responsavel}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}
