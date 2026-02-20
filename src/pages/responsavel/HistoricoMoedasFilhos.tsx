import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, TrendingUp, TrendingDown, ArrowRightLeft, Loader2, History, Gift } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { ResgateHistoricoSheet } from "@/components/ResgateHistoricoSheet";

type Transacao = Tables<"transacao">;
type Profile = Tables<"profiles">;

type Periodo = "hoje" | "semana" | "mes" | "todos";
type TipoFiltro = "todos" | "credito" | "debito";

const tipoConfig: Record<string, { label: string; icon: typeof TrendingUp; color: string; sign: string; grupo: "credito" | "debito" }> = {
  ganho_tarefa: { label: "Tarefa concluída", icon: TrendingUp, color: "text-success", sign: "+", grupo: "credito" },
  bonus: { label: "Bônus", icon: TrendingUp, color: "text-success", sign: "+", grupo: "credito" },
  resgate_recompensa: { label: "Resgate", icon: TrendingDown, color: "text-destructive", sign: "-", grupo: "debito" },
  penalidade: { label: "Penalidade", icon: TrendingDown, color: "text-destructive", sign: "-", grupo: "debito" },
  reversao: { label: "Reversão", icon: ArrowRightLeft, color: "text-muted-foreground", sign: "", grupo: "debito" },
};

function getDataInicio(periodo: Periodo): Date | null {
  const now = new Date();
  switch (periodo) {
    case "hoje": return startOfDay(now);
    case "semana": return startOfWeek(now, { weekStartsOn: 1 });
    case "mes": return startOfMonth(now);
    case "todos": return null;
  }
}

export default function HistoricoMoedasFilhos() {
  const { profile } = useAuth();
  const { selectedChildId: criancaId, setSelectedChildId: setCriancaId } = useSelectedChild();
  const [giftChildId, setGiftChildId] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [historicoResgate, setHistoricoResgate] = useState<any>(null);
  const queryClient = useQueryClient();

  const presentearMutation = useMutation({
    mutationFn: async () => {
      const amount = parseInt(giftAmount);
      if (!giftChildId || !amount || amount <= 0) throw new Error("Preencha todos os campos corretamente.");

      // Get current balance
      const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: giftChildId });
      const saldo = saldoAtual ?? 0;

      const { error } = await supabase.from("transacao").insert({
        user_id: giftChildId,
        familia_id: profile!.familia_id,
        tipo: "bonus" as const,
        quantidade_moedas: amount,
        saldo_anterior: saldo,
        saldo_posterior: saldo + amount,
        descricao: giftMessage.trim() || "Presente de moedas 🎁",
      });
      if (error) throw error;

      // Update cached balance
      await supabase.from("profiles").update({ saldo_moedas: saldo + amount }).eq("user_id", giftChildId);
    },
    onSuccess: () => {
      toast.success("Moedas presenteadas com sucesso! 🎁");
      queryClient.invalidateQueries({ queryKey: ["transacoes-filhos"] });
      queryClient.invalidateQueries({ queryKey: ["criancas-saldos"] });
      setGiftAmount("");
      setGiftMessage("");
      setGiftChildId("");
      setGiftOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: membros } = useQuery({
    queryKey: ["membros-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  // Derive criancas with real saldo
  const { data: criancas } = useQuery({
    queryKey: ["criancas-saldos", profile?.familia_id],
    queryFn: async () => {
      const children = (membros ?? []).filter(m => m.tipo_perfil === "crianca");
      const withSaldo = await Promise.all(
        children.map(async (p) => {
          const { data: saldo } = await supabase.rpc("calcular_saldo", { _user_id: p.user_id });
          return { ...p, saldo_moedas: saldo ?? 0 };
        })
      );
      return withSaldo;
    },
    enabled: !!membros && membros.length > 0,
  });

  const getNomeUsuario = (userId: string) => membros?.find(m => m.user_id === userId)?.nome ?? "Usuário";

  const { data: transacoes, isLoading } = useQuery({
    queryKey: ["transacoes-filhos", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transacao")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Transacao[];
    },
    enabled: !!profile,
  });

  const filtradas = (transacoes ?? []).filter((t) => {
    if (criancaId !== "todos" && t.user_id !== criancaId) return false;
    const cfg = tipoConfig[t.tipo] ?? tipoConfig.reversao;
    if (tipoFiltro !== "todos" && cfg.grupo !== tipoFiltro) return false;
    const dataInicio = getDataInicio(periodo);
    if (dataInicio && new Date(t.created_at) < dataInicio) return false;
    return true;
  });

  const getNomeCrianca = (userId: string) => {
    return criancas?.find((c) => c.user_id === userId)?.nome ?? "Desconhecido";
  };

  const handleTransacaoClick = async (t: Transacao) => {
    if ((t.tipo === "resgate_recompensa" || t.tipo === "reversao") && t.referencia_id) {
      const { data } = await supabase
        .from("resgate_recompensa")
        .select("*, recompensa(nome)")
        .eq("id", t.referencia_id)
        .single();
      if (data) setHistoricoResgate(data);
    }
  };

  const isClickable = (t: Transacao) => (t.tipo === "resgate_recompensa" || t.tipo === "reversao") && !!t.referencia_id;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Moedas dos Filhos 💰</h1>
            <p className="text-muted-foreground">Acompanhe os ganhos e gastos de cada criança</p>
          </div>
          <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0 gap-2">
                <Gift className="h-4 w-4" /> Presentear
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Presentear Moedas 🎁</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Criança</Label>
                  <Select value={giftChildId} onValueChange={setGiftChildId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o filho" />
                    </SelectTrigger>
                    <SelectContent>
                      {criancas?.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade de moedas</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Ex: 10"
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem (opcional)</Label>
                  <Textarea
                    placeholder="Ex: Parabéns pelo bom comportamento!"
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button
                  onClick={() => presentearMutation.mutate()}
                  disabled={presentearMutation.isPending || !giftChildId || !giftAmount || parseInt(giftAmount) <= 0}
                >
                  {presentearMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Gift className="h-4 w-4 mr-1" />}
                  Enviar presente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Saldo cards */}
        {criancas && criancas.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {criancas.map((c) => (
              <motion.div key={c.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="border-2 border-coin/20">
                  <CardContent className="flex items-center gap-3 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coin/20">
                      <Coins className="h-5 w-5 text-coin" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{c.nome}</p>
                      <p className="font-display text-xl font-bold text-coin-foreground">{c.saldo_moedas} moedas</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <Tabs value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as TipoFiltro)}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="credito">Créditos</TabsTrigger>
              <TabsTrigger value="debito">Débitos</TabsTrigger>
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

          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mês</SelectItem>
              <SelectItem value="todos">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transaction list */}
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Histórico</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !filtradas.length ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <History className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="font-display text-lg font-semibold">Sem movimentações</p>
                <p className="text-sm text-muted-foreground">Nenhuma transação encontrada para este filtro.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtradas.map((t, i) => {
                const cfg = tipoConfig[t.tipo] ?? tipoConfig.reversao;
                const Icon = cfg.icon;
                const clickable = isClickable(t);
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <Card
                      className={clickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
                      onClick={() => clickable && handleTransacaoClick(t)}
                    >
                      <CardContent className="flex items-center gap-3 py-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-muted ${cfg.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{t.descricao ?? cfg.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {getNomeCrianca(t.user_id)} • {format(new Date(t.created_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <span className={`font-display font-bold ${cfg.color}`}>
                          {cfg.sign}{t.quantidade_moedas}
                        </span>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ResgateHistoricoSheet
        resgate={historicoResgate}
        onClose={() => setHistoricoResgate(null)}
        getNomeUsuario={getNomeUsuario}
      />
    </AppLayout>
  );
}
