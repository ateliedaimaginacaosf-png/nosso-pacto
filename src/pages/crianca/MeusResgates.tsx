import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Coins, Loader2, ShoppingBag, XCircle, Clock, CheckCircle2, Ban } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FiltroPeriodo = "dia" | "semana" | "mes" | "todos";
type FiltroStatus = "todos" | "pendente" | "aprovada" | "rejeitada" | "cancelada" | "cancelamento_solicitado";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pendente: { label: "Aguardando aprovação", variant: "secondary", icon: Clock },
  aprovada: { label: "Aprovada", variant: "default", icon: CheckCircle2 },
  rejeitada: { label: "Rejeitada", variant: "destructive", icon: XCircle },
  cancelada: { label: "Cancelada", variant: "outline", icon: Ban },
  cancelamento_solicitado: { label: "Cancelamento solicitado", variant: "secondary", icon: Clock },
  revertida: { label: "Revertida", variant: "outline", icon: Ban },
};

export default function MeusResgates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("mes");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [confirmAction, setConfirmAction] = useState<{ id: string; type: "cancelar" | "solicitar_cancelamento" } | null>(null);

  const now = new Date();
  const dateRange = useMemo(() => {
    if (filtroPeriodo === "todos") return null;
    if (filtroPeriodo === "dia") return { start: startOfDay(now), end: endOfDay(now) };
    if (filtroPeriodo === "semana") return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [filtroPeriodo]);

  const { data: saldo } = useQuery({
    queryKey: ["saldo-crianca", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("calcular_saldo", { _user_id: profile!.user_id });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!profile,
  });

  const { data: provisionado } = useQuery({
    queryKey: ["saldo-provisionado", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resgate_recompensa")
        .select("custo_moedas")
        .eq("crianca_id", profile!.user_id)
        .eq("status", "pendente");
      if (error) throw error;
      return data.reduce((sum, r) => sum + r.custo_moedas, 0);
    },
    enabled: !!profile,
  });

  const { data: resgates, isLoading } = useQuery({
    queryKey: ["meus-resgates", profile?.user_id, filtroPeriodo],
    queryFn: async () => {
      let query = supabase
        .from("resgate_recompensa")
        .select("*, recompensa(nome)")
        .eq("crianca_id", profile!.user_id)
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

  const cancelarMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: "cancelar" | "solicitar_cancelamento" }) => {
      const resgate = resgates?.find(r => r.id === id);
      if (!resgate) throw new Error("Resgate não encontrado");

      if (type === "cancelar") {
        // Cancel pending request - no coins to refund since they weren't debited
        const { error } = await supabase
          .from("resgate_recompensa")
          .update({ status: "cancelada" })
          .eq("id", id);
        if (error) throw error;
      } else {
        // Request cancellation of approved redemption
        const { error } = await supabase
          .from("resgate_recompensa")
          .update({ status: "cancelamento_solicitado" })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meus-resgates"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-provisionado"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-crianca"] });
      if (vars.type === "cancelar") {
        toast({ title: "Resgate cancelado ❌", description: "Suas moedas continuam disponíveis." });
      } else {
        toast({ title: "Cancelamento solicitado 📩", description: "Aguardando aprovação do responsável." });
      }
      setConfirmAction(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível processar.", variant: "destructive" });
      setConfirmAction(null);
    },
  });

  const currentSaldo = saldo ?? 0;
  const currentProvisionado = provisionado ?? 0;
  const saldoDisponivel = currentSaldo - currentProvisionado;

  const filtered = useMemo(() => {
    if (!resgates) return [];
    if (filtroStatus === "todos") return resgates;
    return resgates.filter(r => r.status === filtroStatus);
  }, [resgates, filtroStatus]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Meus Resgates 🎁</h1>
          <p className="text-muted-foreground">Acompanhe seus pedidos de recompensa</p>
        </motion.div>

        {/* Balance */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5">
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center gap-3">
                <Coins className="h-6 w-6 text-coin" />
                <span className="text-sm font-medium text-muted-foreground">Saldo total:</span>
                <span className="font-display text-2xl font-bold text-coin-foreground">{currentSaldo}</span>
              </div>
              {currentProvisionado > 0 && (
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Provisionado:</span>
                    <span className="font-semibold text-muted-foreground">{currentProvisionado}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Disponível:</span>
                    <span className="font-semibold text-primary">{saldoDisponivel}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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
              <SelectItem value="pendente">Aguardando</SelectItem>
              <SelectItem value="aprovada">Aprovadas</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
              <SelectItem value="cancelamento_solicitado">Cancel. solicitado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !filtered.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingBag className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhum resgate encontrado</p>
              <p className="text-sm text-muted-foreground">Visite a loja para resgatar recompensas!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((r, i) => {
                const config = statusConfig[r.status] ?? statusConfig.pendente;
                const StatusIcon = config.icon;
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card className={`border-2 ${r.status === "pendente" ? "border-accent/30" : ""}`}>
                      <CardContent className="flex items-center gap-3 py-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10">
                          <Gift className="h-5 w-5 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-display font-semibold text-sm truncate">
                              {(r.recompensa as any)?.nome ?? "Recompensa"}
                            </p>
                            <Badge variant={config.variant} className="gap-1 text-[10px]">
                              <StatusIcon className="h-3 w-3" />
                              {config.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                              <Coins className="h-3 w-3 text-coin" /> {r.custo_moedas}
                            </span>
                            <span>• {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {r.status === "pendente" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-destructive hover:text-destructive"
                              onClick={() => setConfirmAction({ id: r.id, type: "cancelar" })}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Cancelar
                            </Button>
                          )}
                          {r.status === "aprovada" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              onClick={() => setConfirmAction({ id: r.id, type: "solicitar_cancelamento" })}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Pedir cancelamento
                            </Button>
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

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "cancelar" ? "Cancelar resgate?" : "Solicitar cancelamento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "cancelar"
                ? "O pedido de resgate será cancelado e suas moedas continuarão disponíveis."
                : "O responsável precisará aprovar o cancelamento. Se aprovado, suas moedas serão devolvidas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && cancelarMutation.mutate(confirmAction)}
              disabled={cancelarMutation.isPending}
            >
              {cancelarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
