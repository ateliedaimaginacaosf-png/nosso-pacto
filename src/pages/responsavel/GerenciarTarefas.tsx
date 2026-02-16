import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ClipboardList, Coins, Loader2, Trash2, Pencil, CalendarClock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

const categoriasLabel: Record<string, string> = {
  limpeza: "Limpeza", estudos: "Estudos", exercicio: "Exercício", higiene: "Higiene",
  alimentacao: "Alimentação", organizacao: "Organização", outros: "Outros",
};

const periodicidadeLabel: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

export default function GerenciarTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTarefa, setEditingTarefa] = useState<Tarefa | null>(null);

  // Form state
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<string>("outros");
  const [valorMoedas, setValorMoedas] = useState("5");
  const [periodicidade, setPeriodicidade] = useState<string>("diaria");

  const { data: tarefas, isLoading } = useQuery({
    queryKey: ["tarefas-catalogo", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  // Deduplicate tasks by name+categoria+valor_moedas to show unique "templates"
  const uniqueTarefas = tarefas?.reduce((acc, t) => {
    const key = `${t.nome}|${t.categoria}|${t.valor_moedas}|${(t as any).periodicidade ?? 'diaria'}`;
    if (!acc.map.has(key)) {
      acc.map.set(key, true);
      acc.list.push(t);
    }
    return acc;
  }, { map: new Map<string, boolean>(), list: [] as Tarefa[] }).list;

  const openCreateDialog = () => {
    setEditingTarefa(null);
    setNome(""); setDescricao(""); setCategoria("outros"); setValorMoedas("5"); setPeriodicidade("diaria");
    setDialogOpen(true);
  };

  const openEditDialog = (tarefa: Tarefa) => {
    setEditingTarefa(tarefa);
    setNome(tarefa.nome);
    setDescricao(tarefa.descricao ?? "");
    setCategoria(tarefa.categoria);
    setValorMoedas(String(tarefa.valor_moedas));
    setPeriodicidade((tarefa as any).periodicidade ?? "diaria");
    setDialogOpen(true);
  };

  const salvarTarefa = useMutation({
    mutationFn: async () => {
      const base = {
        nome,
        descricao: descricao || null,
        categoria: categoria as Tarefa["categoria"],
        valor_moedas: parseInt(valorMoedas) || 1,
        periodicidade: periodicidade as any,
      };

      if (editingTarefa) {
        const { error } = await supabase.from("tarefa").update(base).eq("id", editingTarefa.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefa").insert({
          ...base,
          familia_id: profile!.familia_id,
          criada_por: profile!.user_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-catalogo"] });
      toast({ title: editingTarefa ? "Tarefa atualizada! ✏️" : "Tarefa cadastrada! ✅" });
      setDialogOpen(false);
      setEditingTarefa(null);
    },
    onError: () => toast({ title: "Erro ao salvar tarefa", variant: "destructive" }),
  });

  const deletarTarefa = useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase.from("tarefa").delete().eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-catalogo"] });
      toast({ title: "Tarefa removida" });
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Cadastro de Tarefas 📋</h1>
            <p className="text-muted-foreground">Configure as tarefas disponíveis para a família</p>
          </div>
          <Button onClick={openCreateDialog}><Plus className="h-4 w-4" /> Nova Tarefa</Button>
        </motion.div>

        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditingTarefa(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editingTarefa ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
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
                <Label>Periodicidade</Label>
                <Select value={periodicidade} onValueChange={setPeriodicidade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(periodicidadeLabel).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => salvarTarefa.mutate()} disabled={!nome.trim() || salvarTarefa.isPending}>
                {salvarTarefa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingTarefa ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !uniqueTarefas?.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhuma tarefa cadastrada</p>
              <p className="text-sm text-muted-foreground">Cadastre a primeira tarefa da família!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {uniqueTarefas.map((tarefa, i) => (
                <motion.div key={tarefa.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -100 }} transition={{ delay: i * 0.03 }}>
                  <Card className="border-2 transition-shadow hover:shadow-md">
                    <CardContent className="flex items-start gap-4 py-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                        {categoriasEmoji[tarefa.categoria] ?? "⭐"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-display font-semibold truncate">{tarefa.nome}</p>
                          <Badge variant="outline">{categoriasLabel[tarefa.categoria]}</Badge>
                        </div>
                        {tarefa.descricao && <p className="text-sm text-muted-foreground line-clamp-1">{tarefa.descricao}</p>}
                        <div className="mt-1 flex items-center gap-3 text-sm">
                          <span className="flex items-center gap-1 font-semibold text-coin-foreground">
                            <Coins className="h-3.5 w-3.5 text-coin" /> {tarefa.valor_moedas}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <CalendarClock className="h-3.5 w-3.5" /> {periodicidadeLabel[(tarefa as any).periodicidade ?? "diaria"]}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(tarefa)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deletarTarefa.mutate(tarefa.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
