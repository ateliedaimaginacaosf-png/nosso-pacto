import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Coins, Loader2, ShoppingBag, XCircle, Clock, CheckCircle2, Ban, PackageCheck, History } from "lucide-react";
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
import { ResgateHistoricoSheet } from "@/components/ResgateHistoricoSheet";

type FiltroPeriodo = "dia" | "semana" | "mes" | "todos";
type FiltroStatus = "todos" | "pendente" | "aprovada" | "rejeitada" | "cancelada" | "cancelamento_solicitado" | "utilizada";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pendente: { label: "Aguardando aprovação", variant: "secondary", icon: Clock },
  aprovada: { label: "Aprovada", variant: "default", icon: CheckCircle2 },
  rejeitada: { label: "Rejeitada", variant: "destructive", icon: XCircle },
  cancelada: { label: "Cancelada", variant: "outline", icon: Ban },
  cancelamento_solicitado: { label: "Cancelamento solicitado", variant: "outline", icon: Clock },
  revertida: { label: "Revertida", variant: "outline", icon: Ban },
  utilizada: { label: "Utilizada ✅", variant: "default", icon: PackageCheck },
};

export default function MeusResgates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("mes");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [confirmAction, setConfirmAction] = useState<{ id: string; type: "cancelar" | "solicitar_cancelamento" | "marcar_utilizada" } | null>(null);
  const [mensagemCancelamento, setMensagemCancelamento] = useState("");
  const [historicoResgate, setHistoricoResgate] = useState<any>(null);

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

  const { data: membros } = useQuery({
    queryKey: ["membros-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome")
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const getNomeUsuario = (userId: string) => membros?.find(m => m.user_id === userId)?.nome ?? "Usuário";

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
    mutationFn: async ({ id, type, mensagem }: { id: string; type: "cancelar" | "solicitar_cancelamento" | "marcar_utilizada"; mensagem?: string }) => {
      const { data: current, error: fetchError } = await supabase
        .from("resgate_recompensa")
        .select("status")
        .eq("id", id)
        .single();
      if (fetchError) throw fetchError;

      if (type === "cancelar" && current.status !== "pendente") throw new Error("Este resgate já não está pendente.");
      if (type === "solicitar_cancelamento" && current.status !== "aprovada") throw new Error("Cancelamento já foi solicitado ou o status mudou.");
      if (type === "marcar_utilizada" && current.status !== "aprovada") throw new Error("Este resgate não pode ser marcado como utilizado.");

      const newStatus = type === "cancelar" ? "cancelada" : type === "marcar_utilizada" ? "utilizada" : "cancelamento_solicitado";
      const { error } = await supabase
        .from("resgate_recompensa")
        .update({ status: newStatus as any })
        .eq("id", id);
      if (error) throw error;

      // Record interaction
      await supabase.from("resgate_interacao").insert({
        resgate_id: id,
        familia_id: profile!.familia_id,
        user_id: profile!.user_id,
        status_anterior: current.status,
        status_novo: newStatus,
        mensagem: mensagem?.trim() || null,
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meus-resgates"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-provisionado"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-crianca"] });
      if (vars.type === "cancelar") {
        toast({ title: "Resgate cancelado ❌", description: "Suas moedas continuam disponíveis." });
      } else if (vars.type === "marcar_utilizada") {
        toast({ title: "Recompensa utilizada ✅", description: "Aproveite!" });
      } else {
        toast({ title: "Cancelamento solicitado 📩", description: "Aguardando aprovação do responsável." });
      }
      setConfirmAction(null);
      setMensagemCancelamento("");
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível processar.", variant: "destructive" });
      setConfirmAction(null);
      setMensagemCancelamento("");
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

  const showMensagemField = confirmAction?.type === "solicitar_cancelamento" || confirmAction?.type === "cancelar";

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Meus Resgates 🎁</h1>
          <p className="text-muted-foreground">Acompanhe seus pedidos de recompensa</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5">
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center gap-3">
                <Coins className="h-6 w-6 text-coin" />
                <span className="text-sm font-medium text-muted-foreground">Disponível:</span>
                <span className="font-display text-2xl font-bold text-coin-foreground">{saldoDisponivel}</span>
                <span className="text-sm text-muted-foreground">moedas</span>
              </div>
              {currentProvisionado > 0 && (
                <p className="text-xs text-muted-foreground ml-9">
                  ({currentProvisionado} provisionadas para resgates pendentes • total: {currentSaldo})
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

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
              <SelectItem value="utilizada">Utilizadas</SelectItem>
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
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 cursor-pointer hover:bg-accent/20 transition-colors"
                          onClick={() => setHistoricoResgate(r)}
                        >
                          <Gift className="h-5 w-5 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setHistoricoResgate(r)}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-display font-semibold text-sm truncate">
                              {(r.recompensa as any)?.nome ?? "Recompensa"}
                            </p>
                            <Badge variant={config.variant} className={`gap-1 text-[10px] ${r.status === "cancelamento_solicitado" ? "border-orange-400 text-orange-600 bg-orange-50" : ""}`}>
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
                        <div className="shrink-0 flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setHistoricoResgate(r)}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {r.status === "pendente" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-destructive hover:text-destructive"
                              onClick={() => { setConfirmAction({ id: r.id, type: "cancelar" }); setMensagemCancelamento(""); }}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Cancelar
                            </Button>
                          )}
                          {r.status === "aprovada" && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="text-xs"
                                onClick={() => setConfirmAction({ id: r.id, type: "marcar_utilizada" })}
                              >
                                <PackageCheck className="h-4 w-4 mr-1" /> Usei!
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs"
                                onClick={() => { setConfirmAction({ id: r.id, type: "solicitar_cancelamento" }); setMensagemCancelamento(""); }}
                              >
                                <XCircle className="h-4 w-4 mr-1" /> Cancelar
                              </Button>
                            </div>
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

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) { setConfirmAction(null); setMensagemCancelamento(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "cancelar" ? "Cancelar resgate?" : confirmAction?.type === "marcar_utilizada" ? "Marcar como utilizada?" : "Solicitar cancelamento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "cancelar"
                ? "O pedido de resgate será cancelado e suas moedas continuarão disponíveis."
                : confirmAction?.type === "marcar_utilizada"
                ? "Ao confirmar, a recompensa será marcada como utilizada e não poderá ser cancelada."
                : "O responsável precisará aprovar o cancelamento. Se aprovado, suas moedas serão devolvidas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {showMensagemField && (
            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                placeholder="Escreva o motivo do cancelamento..."
                value={mensagemCancelamento}
                onChange={(e) => setMensagemCancelamento(e.target.value)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && cancelarMutation.mutate({ ...confirmAction, mensagem: mensagemCancelamento })}
              disabled={cancelarMutation.isPending}
            >
              {cancelarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResgateHistoricoSheet
        resgate={historicoResgate}
        onClose={() => setHistoricoResgate(null)}
        getNomeUsuario={getNomeUsuario}
      />
    </AppLayout>
  );
}
