import { useAuth } from "@/contexts/AuthContext";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Coins, Loader2, CheckCircle2, XCircle, User, Undo2, Ban, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type FiltroPeriodo = "dia" | "semana" | "mes" | "todos";
type FiltroStatus = "todos" | "pendente" | "aprovada" | "rejeitada" | "cancelada" | "cancelamento_solicitado";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  aprovada: { label: "Aprovada", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
  cancelada: { label: "Cancelada", variant: "outline" },
  cancelamento_solicitado: { label: "Cancel. solicitado", variant: "outline" },
  revertida: { label: "Revertida", variant: "outline" },
};

export default function GerenciarResgates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { selectedChildId: filtroCrianca, setSelectedChildId: setFiltroCrianca } = useSelectedChild();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("dia");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");

  const now = new Date();
  const dateRange = useMemo(() => {
    if (filtroPeriodo === "todos") return null;
    if (filtroPeriodo === "dia") return { start: startOfDay(now), end: endOfDay(now) };
    if (filtroPeriodo === "semana") return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [filtroPeriodo]);

  const { data: criancas } = useQuery({
    queryKey: ["criancas-familia-resgates", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("user_id, nome")
        .eq("familia_id", profile!.familia_id)
        .eq("tipo_perfil", "crianca");
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const { data: resgates, isLoading } = useQuery({
    queryKey: ["resgates-gerenciar", profile?.familia_id, filtroPeriodo],
    queryFn: async () => {
      let query = supabase
        .from("resgate_recompensa")
        .select("*, recompensa(nome)")
        .eq("familia_id", profile!.familia_id)
        .order("created_at", { ascending: false });

      if (dateRange) {
        query = query
          .gte("created_at", dateRange.start.toISOString())
          .lte("created_at", dateRange.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const getCriancaNome = (userId: string) => criancas?.find(c => c.user_id === userId)?.nome ?? "Criança";

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["resgates-gerenciar"] });
    queryClient.invalidateQueries({ queryKey: ["responsavel-stats"] });
    queryClient.invalidateQueries({ queryKey: ["saldo-crianca"] });
  };

  const aprovarResgate = useMutation({
    mutationFn: async (resgateId: string) => {
      const resgate = resgates?.find(r => r.id === resgateId);
      if (!resgate) throw new Error("Resgate não encontrado");

      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: "aprovada", aprovado_por: profile!.user_id })
        .eq("id", resgateId);
      if (error) throw error;

      const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: resgate.crianca_id });
      const anterior = (saldoAtual as number) ?? 0;
      const novoSaldo = anterior - resgate.custo_moedas;

      await supabase.from("transacao").insert({
        user_id: resgate.crianca_id,
        familia_id: profile!.familia_id,
        tipo: "resgate_recompensa" as const,
        quantidade_moedas: resgate.custo_moedas,
        saldo_anterior: anterior,
        saldo_posterior: novoSaldo,
        descricao: `Resgate: ${(resgate as any).recompensa?.nome ?? "Recompensa"}`,
      });

      await supabase.from("profiles")
        .update({ saldo_moedas: novoSaldo })
        .eq("user_id", resgate.crianca_id);
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Resgate aprovado! ✅" });
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejeitarResgate = useMutation({
    mutationFn: async (resgateId: string) => {
      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: "rejeitada", aprovado_por: profile!.user_id })
        .eq("id", resgateId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Resgate rejeitado" });
    },
    onError: () => toast({ title: "Erro ao rejeitar", variant: "destructive" }),
  });

  const aprovarCancelamento = useMutation({
    mutationFn: async (resgateId: string) => {
      const resgate = resgates?.find(r => r.id === resgateId);
      if (!resgate) throw new Error("Resgate não encontrado");

      // Refund coins
      const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: resgate.crianca_id });
      const anterior = (saldoAtual as number) ?? 0;
      const novoSaldo = anterior + resgate.custo_moedas;

      await supabase.from("transacao").insert({
        user_id: resgate.crianca_id,
        familia_id: profile!.familia_id,
        tipo: "reversao" as const,
        quantidade_moedas: resgate.custo_moedas,
        saldo_anterior: anterior,
        saldo_posterior: novoSaldo,
        descricao: `Cancelamento aprovado: ${(resgate as any).recompensa?.nome ?? "Recompensa"}`,
      });

      await supabase.from("profiles")
        .update({ saldo_moedas: novoSaldo })
        .eq("user_id", resgate.crianca_id);

      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: "cancelada", aprovado_por: profile!.user_id })
        .eq("id", resgateId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Cancelamento aprovado, moedas devolvidas ↩️" });
    },
    onError: () => toast({ title: "Erro ao aprovar cancelamento", variant: "destructive" }),
  });

  const negarCancelamento = useMutation({
    mutationFn: async (resgateId: string) => {
      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: "aprovada", aprovado_por: profile!.user_id })
        .eq("id", resgateId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Cancelamento negado" });
    },
    onError: () => toast({ title: "Erro", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!resgates) return [];
    let result = resgates;
    if (filtroCrianca && filtroCrianca !== "todos") result = result.filter(r => r.crianca_id === filtroCrianca);
    if (filtroStatus !== "todos") result = result.filter(r => r.status === filtroStatus);
    return result;
  }, [resgates, filtroCrianca, filtroStatus]);

  const pendentesCount = resgates?.filter(r => r.status === "pendente" || r.status === "cancelamento_solicitado").length ?? 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Resgates 🎁</h1>
          <p className="text-muted-foreground">
            Gerencie os pedidos de resgate de recompensas
            {pendentesCount > 0 && <Badge variant="destructive" className="ml-2">{pendentesCount} pendente{pendentesCount > 1 ? "s" : ""}</Badge>}
          </p>
        </motion.div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select value={filtroPeriodo} onValueChange={(v) => setFiltroPeriodo(v as FiltroPeriodo)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dia">Hoje</SelectItem>
              <SelectItem value="semana">Semana</SelectItem>
              <SelectItem value="mes">Mês</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as FiltroStatus)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas situações</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="aprovada">Aprovadas</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
              <SelectItem value="cancelamento_solicitado">Cancel. solicitado</SelectItem>
            </SelectContent>
          </Select>
          {criancas && criancas.length > 1 && (
            <Select value={filtroCrianca ?? "todos"} onValueChange={(v) => setFiltroCrianca(v === "todos" ? "todos" : v)}>
              <SelectTrigger className="w-[160px]">
                <User className="h-4 w-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas crianças</SelectItem>
                {criancas.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !filtered.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Gift className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhum resgate encontrado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((r, i) => {
                const config = statusConfig[r.status] ?? statusConfig.pendente;
                return (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Card className={`border-2 ${r.status === "pendente" || r.status === "cancelamento_solicitado" ? "border-accent/40" : ""}`}>
                      <CardContent className="flex items-center gap-3 py-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10">
                          <Gift className="h-5 w-5 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-display font-semibold text-sm truncate">
                              {(r.recompensa as any)?.nome ?? "Recompensa"}
                            </p>
                            <Badge variant={config.variant} className="text-[10px]">{config.label}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                              <Coins className="h-3 w-3 text-coin" /> {r.custo_moedas}
                            </span>
                            <span>→ {getCriancaNome(r.crianca_id)}</span>
                            <span>• {format(new Date(r.created_at), "dd/MM HH:mm")}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {r.status === "pendente" && (
                            <>
                              <Button size="sm" onClick={() => aprovarResgate.mutate(r.id)} disabled={aprovarResgate.isPending}>
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => rejeitarResgate.mutate(r.id)} disabled={rejeitarResgate.isPending}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {r.status === "cancelamento_solicitado" && (
                            <>
                              <Button size="sm" onClick={() => aprovarCancelamento.mutate(r.id)} disabled={aprovarCancelamento.isPending}>
                                <Undo2 className="h-4 w-4 mr-1" /> Devolver
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => negarCancelamento.mutate(r.id)} disabled={negarCancelamento.isPending}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
