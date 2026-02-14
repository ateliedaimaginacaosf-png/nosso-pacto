import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ClipboardList, CheckCircle2, XCircle, Coins, Loader2, Trash2, Clock } from "lucide-react";
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

const categoriasLabel: Record<string, string> = {
  limpeza: "Limpeza", estudos: "Estudos", exercicio: "Exercício", higiene: "Higiene",
  alimentacao: "Alimentação", organizacao: "Organização", outros: "Outros",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A Fazer", variant: "outline" },
  pendente_aprovacao: { label: "Pendente", variant: "secondary" },
  concluida: { label: "Concluída", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
  arquivada: { label: "Arquivada", variant: "outline" },
};

export default function GerenciarTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("todas");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  // Form state
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<string>("outros");
  const [valorMoedas, setValorMoedas] = useState("5");
  const [atribuidaA, setAtribuidaA] = useState<string>("");

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
    queryKey: ["tarefas-responsavel", profile?.familia_id, filterStatus],
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

  const criarTarefa = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tarefa").insert({
        nome,
        descricao: descricao || null,
        categoria: categoria as Tarefa["categoria"],
        valor_moedas: parseInt(valorMoedas) || 1,
        atribuida_a: atribuidaA || null,
        familia_id: profile!.familia_id,
        criada_por: profile!.user_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-responsavel"] });
      toast({ title: "Tarefa criada! ✅" });
      setDialogOpen(false);
      setNome(""); setDescricao(""); setCategoria("outros"); setValorMoedas("5"); setAtribuidaA("");
    },
    onError: () => toast({ title: "Erro ao criar tarefa", variant: "destructive" }),
  });

  const aprovarTarefa = useMutation({
    mutationFn: async (tarefaId: string) => {
      const tarefa = tarefas?.find(t => t.id === tarefaId);
      if (!tarefa || !tarefa.atribuida_a) throw new Error("Tarefa inválida");

      // Update task
      const { error: taskError } = await supabase
        .from("tarefa")
        .update({ status: "concluida", data_aprovacao: new Date().toISOString() })
        .eq("id", tarefaId);
      if (taskError) throw taskError;

      // Get current balance
      const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: tarefa.atribuida_a });
      const anterior = (saldoAtual as number) ?? 0;

      // Create transaction
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

      // Update cached balance
      await supabase
        .from("profiles")
        .update({ saldo_moedas: anterior + tarefa.valor_moedas })
        .eq("user_id", tarefa.atribuida_a);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-responsavel"] });
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
      queryClient.invalidateQueries({ queryKey: ["tarefas-responsavel"] });
      toast({ title: "Tarefa devolvida" });
      setRejectId(null);
      setRejectComment("");
    },
    onError: () => toast({ title: "Erro ao rejeitar", variant: "destructive" }),
  });

  const deletarTarefa = useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase.from("tarefa").delete().eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-responsavel"] });
      toast({ title: "Tarefa removida" });
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
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
            <h1 className="font-display text-2xl font-bold md:text-3xl">Tarefas 📋</h1>
            <p className="text-muted-foreground">Crie e gerencie tarefas da família</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Nova Tarefa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Criar Tarefa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input placeholder="Ex: Arrumar o quarto" value={nome} onChange={e => setNome(e.target.value)} />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea placeholder="Detalhes da tarefa..." value={descricao} onChange={e => setDescricao(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={categoria} onValueChange={setCategoria}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoriasLabel).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{categoriasEmoji[key]} {label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Moedas</Label>
                    <Input type="number" min="1" max="100" value={valorMoedas} onChange={e => setValorMoedas(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Atribuir a</Label>
                  <Select value={atribuidaA} onValueChange={setAtribuidaA}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma criança" /></SelectTrigger>
                    <SelectContent>
                      {criancas?.map(c => (
                        <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                      ))}
                      {!criancas?.length && (
                        <SelectItem value="none" disabled>Nenhuma criança cadastrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => criarTarefa.mutate()} disabled={!nome.trim() || criarTarefa.isPending}>
                  {criarTarefa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Tarefa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
        ) : !tarefas?.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhuma tarefa encontrada</p>
              <p className="text-sm text-muted-foreground">Crie a primeira tarefa da família!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {tarefas.map((tarefa, i) => (
                <motion.div key={tarefa.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -100 }} transition={{ delay: i * 0.03 }}>
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
                        {tarefa.descricao && <p className="text-sm text-muted-foreground line-clamp-1">{tarefa.descricao}</p>}
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
                          <Button size="sm" variant="ghost" onClick={() => deletarTarefa.mutate(tarefa.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
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
