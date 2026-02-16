import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Coins, UserPlus, UserMinus, ClipboardList, CalendarClock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;
type Profile = Tables<"profiles">;

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A Fazer", variant: "outline" },
  pendente_aprovacao: { label: "Pendente", variant: "secondary" },
  concluida: { label: "Concluída", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
  arquivada: { label: "Arquivada", variant: "outline" },
};

const periodicidadeLabel: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

export default function AtribuirTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("todas");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [selectedCriancas, setSelectedCriancas] = useState<string[]>([]);

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

  const { data: tarefas, isLoading } = useQuery({
    queryKey: ["tarefas-atribuicao", profile?.familia_id, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from("tarefa")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("created_at", { ascending: false });

      if (filterStatus !== "todas") {
        query = query.eq("status", filterStatus as Tarefa["status"]);
      } else {
        query = query.in("status", ["a_fazer", "pendente_aprovacao", "rejeitada"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  // Get unassigned tasks (unique templates without assignment)
  const unassignedTarefas = tarefas?.filter(t => !t.atribuida_a && t.status === "a_fazer");
  const assignedTarefas = tarefas?.filter(t => t.atribuida_a);

  const openAssignDialog = (tarefa: Tarefa) => {
    setSelectedTarefa(tarefa);
    setSelectedCriancas([]);
    setAssignDialogOpen(true);
  };

  const atribuirTarefa = useMutation({
    mutationFn: async () => {
      if (!selectedTarefa || selectedCriancas.length === 0) throw new Error("Seleção inválida");

      // For first child, update existing task; for others, insert copies
      const [first, ...rest] = selectedCriancas;

      const { error: updateError } = await supabase
        .from("tarefa")
        .update({ atribuida_a: first })
        .eq("id", selectedTarefa.id);
      if (updateError) throw updateError;

      if (rest.length > 0) {
        const rows = rest.map(userId => ({
          nome: selectedTarefa.nome,
          descricao: selectedTarefa.descricao,
          categoria: selectedTarefa.categoria,
          valor_moedas: selectedTarefa.valor_moedas,
          periodicidade: (selectedTarefa as any).periodicidade ?? "diaria",
          atribuida_a: userId,
          familia_id: profile!.familia_id,
          criada_por: profile!.user_id,
        }));
        const { error } = await supabase.from("tarefa").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-atribuicao"] });
      toast({ title: "Tarefa atribuída! ✅" });
      setAssignDialogOpen(false);
      setSelectedTarefa(null);
    },
    onError: () => toast({ title: "Erro ao atribuir", variant: "destructive" }),
  });

  const removerAtribuicao = useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase
        .from("tarefa")
        .update({ atribuida_a: null })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-atribuicao"] });
      toast({ title: "Atribuição removida" });
    },
    onError: () => toast({ title: "Erro ao remover atribuição", variant: "destructive" }),
  });

  const aprovarTarefa = useMutation({
    mutationFn: async (tarefaId: string) => {
      const tarefa = tarefas?.find(t => t.id === tarefaId);
      if (!tarefa || !tarefa.atribuida_a) throw new Error("Tarefa inválida");

      const { error: taskError } = await supabase
        .from("tarefa")
        .update({ status: "concluida", data_aprovacao: new Date().toISOString() })
        .eq("id", tarefaId);
      if (taskError) throw taskError;

      const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: tarefa.atribuida_a });
      const anterior = (saldoAtual as number) ?? 0;

      const { error: txError } = await supabase.from("transacao").insert({
        user_id: tarefa.atribuida_a,
        familia_id: profile!.familia_id,
        tipo: "ganho_tarefa",
        quantidade_moedas: tarefa.valor_moedas,
        saldo_anterior: anterior,
        saldo_posterior: anterior + tarefa.valor_moedas,
        referencia_id: tarefaId,
        descricao: `Tarefa: ${tarefa.nome}`,
      });
      if (txError) throw txError;

      await supabase
        .from("profiles")
        .update({ saldo_moedas: anterior + tarefa.valor_moedas })
        .eq("user_id", tarefa.atribuida_a);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-atribuicao"] });
      toast({ title: "Tarefa aprovada! 🎉", description: "Moedas creditadas." });
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejeitarTarefa = useMutation({
    mutationFn: async ({ tarefaId, comentario }: { tarefaId: string; comentario: string }) => {
      const { error } = await supabase
        .from("tarefa")
        .update({ status: "rejeitada", comentario_responsavel: comentario || null })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-atribuicao"] });
      toast({ title: "Tarefa devolvida" });
      setRejectId(null);
      setRejectComment("");
    },
    onError: () => toast({ title: "Erro ao rejeitar", variant: "destructive" }),
  });

  const getCriancaNome = (userId: string | null) => {
    if (!userId) return "Sem atribuição";
    return criancas?.find(c => c.user_id === userId)?.nome ?? "Criança";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Atribuição de Tarefas 👥</h1>
            <p className="text-muted-foreground">Atribua e gerencie tarefas para as crianças</p>
          </div>
        </motion.div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "todas", label: "Ativas" },
            { value: "pendente_aprovacao", label: "⏳ Pendentes" },
            { value: "a_fazer", label: "📝 A Fazer" },
            { value: "concluida", label: "✅ Concluídas" },
          ].map(f => (
            <Button key={f.value} variant={filterStatus === f.value ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(f.value)}>
              {f.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-6">
            {/* Unassigned tasks */}
            {unassignedTarefas && unassignedTarefas.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-display text-lg font-semibold text-muted-foreground">Sem atribuição</h2>
                <AnimatePresence>
                  {unassignedTarefas.map((tarefa, i) => (
                    <motion.div key={tarefa.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                      <Card className="border-2 border-dashed transition-shadow hover:shadow-md">
                        <CardContent className="flex items-start gap-4 py-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                            {categoriasEmoji[tarefa.categoria] ?? "⭐"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-display font-semibold truncate">{tarefa.nome}</p>
                            <div className="mt-1 flex items-center gap-3 text-sm">
                              <span className="flex items-center gap-1 font-semibold text-coin-foreground">
                                <Coins className="h-3.5 w-3.5 text-coin" /> {tarefa.valor_moedas}
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <CalendarClock className="h-3.5 w-3.5" /> {periodicidadeLabel[(tarefa as any).periodicidade ?? "diaria"]}
                              </span>
                            </div>
                          </div>
                          <Button size="sm" onClick={() => openAssignDialog(tarefa)}>
                            <UserPlus className="h-4 w-4" /> Atribuir
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Assigned tasks */}
            {assignedTarefas && assignedTarefas.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-display text-lg font-semibold text-muted-foreground">Tarefas atribuídas</h2>
                <AnimatePresence>
                  {assignedTarefas.map((tarefa, i) => (
                    <motion.div key={tarefa.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                      <Card className={`border-2 transition-shadow hover:shadow-md ${tarefa.status === "pendente_aprovacao" ? "border-accent/40" : ""}`}>
                        <CardContent className="flex items-start gap-4 py-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                            {categoriasEmoji[tarefa.categoria] ?? "⭐"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-display font-semibold truncate">{tarefa.nome}</p>
                              <Badge variant={statusConfig[tarefa.status]?.variant ?? "outline"}>
                                {statusConfig[tarefa.status]?.label ?? tarefa.status}
                              </Badge>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-sm">
                              <span className="flex items-center gap-1 font-semibold text-coin-foreground">
                                <Coins className="h-3.5 w-3.5 text-coin" /> {tarefa.valor_moedas}
                              </span>
                              <span className="text-muted-foreground">→ {getCriancaNome(tarefa.atribuida_a)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {tarefa.status === "pendente_aprovacao" && (
                              <>
                                <Button size="sm" onClick={() => aprovarTarefa.mutate(tarefa.id)} disabled={aprovarTarefa.isPending}>
                                  <CheckCircle2 className="h-4 w-4" /> Aprovar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setRejectId(tarefa.id)}>
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {tarefa.status === "a_fazer" && (
                              <Button size="sm" variant="ghost" onClick={() => removerAtribuicao.mutate(tarefa.id)} disabled={removerAtribuicao.isPending}>
                                <UserMinus className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {!unassignedTarefas?.length && !assignedTarefas?.length && (
              <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
                  <p className="font-display text-lg font-semibold">Nenhuma tarefa encontrada</p>
                  <p className="text-sm text-muted-foreground">Cadastre tarefas primeiro na seção de Tarefas.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Assign dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={(o) => { if (!o) { setAssignDialogOpen(false); setSelectedTarefa(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Atribuir "{selectedTarefa?.nome}"</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Selecione as crianças</Label>
              {!criancas?.length ? (
                <p className="text-sm text-muted-foreground">Nenhuma criança cadastrada</p>
              ) : (
                <div className="space-y-2">
                  {criancas.map(c => (
                    <label key={c.user_id} className="flex items-center gap-2 cursor-pointer rounded-lg border p-2 transition hover:bg-muted/50">
                      <Checkbox
                        checked={selectedCriancas.includes(c.user_id)}
                        onCheckedChange={(v) =>
                          setSelectedCriancas(prev =>
                            v ? [...prev, c.user_id] : prev.filter(id => id !== c.user_id)
                          )
                        }
                      />
                      <span className="text-sm font-medium">{c.nome}</span>
                    </label>
                  ))}
                  {criancas.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        setSelectedCriancas(prev =>
                          prev.length === criancas.length ? [] : criancas.map(c => c.user_id)
                        )
                      }
                    >
                      {selectedCriancas.length === criancas.length ? "Desmarcar todas" : "Selecionar todas"}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => atribuirTarefa.mutate()} disabled={!selectedCriancas.length || atribuirTarefa.isPending}>
                {atribuirTarefa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atribuir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject dialog */}
        <Dialog open={!!rejectId} onOpenChange={(o) => { if (!o) { setRejectId(null); setRejectComment(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Rejeitar Tarefa</DialogTitle>
            </DialogHeader>
            <div>
              <Label>Comentário (opcional)</Label>
              <Textarea placeholder="Explique o motivo..." value={rejectComment} onChange={e => setRejectComment(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="destructive" onClick={() => rejectId && rejeitarTarefa.mutate({ tarefaId: rejectId, comentario: rejectComment })} disabled={rejeitarTarefa.isPending}>
                Rejeitar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
