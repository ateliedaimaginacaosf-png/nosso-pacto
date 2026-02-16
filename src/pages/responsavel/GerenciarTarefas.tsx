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
import { Plus, ClipboardList, Coins, Loader2, Trash2, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";

interface TarefaPadrao {
  id: string;
  familia_id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  valor_moedas: number;
  criada_por: string;
  created_at: string;
  updated_at: string;
}

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

const categoriasLabel: Record<string, string> = {
  limpeza: "Limpeza", estudos: "Estudos", exercicio: "Exercício", higiene: "Higiene",
  alimentacao: "Alimentação", organizacao: "Organização", outros: "Outros",
};

export default function GerenciarTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TarefaPadrao | null>(null);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<string>("outros");
  const [valorMoedas, setValorMoedas] = useState("5");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["tarefa-padrao", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa_padrao")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TarefaPadrao[];
    },
    enabled: !!profile,
  });

  const openCreate = () => {
    setEditing(null);
    setNome(""); setDescricao(""); setCategoria("outros"); setValorMoedas("5");
    setDialogOpen(true);
  };

  const openEdit = (t: TarefaPadrao) => {
    setEditing(t);
    setNome(t.nome);
    setDescricao(t.descricao ?? "");
    setCategoria(t.categoria);
    setValorMoedas(String(t.valor_moedas));
    setDialogOpen(true);
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const base = {
        nome,
        descricao: descricao || null,
        categoria: categoria as "limpeza" | "estudos" | "exercicio" | "higiene" | "alimentacao" | "organizacao" | "outros",
        valor_moedas: parseInt(valorMoedas) || 1,
      };
      if (editing) {
        const { error } = await supabase.from("tarefa_padrao").update(base).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefa_padrao").insert([{
          ...base,
          familia_id: profile!.familia_id,
          criada_por: profile!.user_id,
        }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefa-padrao"] });
      toast({ title: editing ? "Modelo atualizado! ✏️" : "Modelo cadastrado! ✅" });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  const deletar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefa_padrao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefa-padrao"] });
      toast({ title: "Modelo removido" });
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Modelos de Tarefas 📋</h1>
            <p className="text-muted-foreground">Configure os modelos de tarefas da família. Use o Calendário para atribuir.</p>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Novo Modelo</Button>
        </motion.div>

        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditing(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editing ? "Editar Modelo" : "Novo Modelo de Tarefa"}</DialogTitle>
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
            </div>
            <DialogFooter>
              <Button onClick={() => salvar.mutate()} disabled={!nome.trim() || salvar.isPending}>
                {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !templates?.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhum modelo cadastrado</p>
              <p className="text-sm text-muted-foreground">Cadastre o primeiro modelo de tarefa!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {templates.map((t, i) => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -100 }} transition={{ delay: i * 0.03 }}>
                  <Card className="border-2 transition-shadow hover:shadow-md">
                    <CardContent className="flex items-start gap-4 py-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                        {categoriasEmoji[t.categoria] ?? "⭐"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-display font-semibold truncate">{t.nome}</p>
                          <Badge variant="outline">{categoriasLabel[t.categoria]}</Badge>
                        </div>
                        {t.descricao && <p className="text-sm text-muted-foreground line-clamp-1">{t.descricao}</p>}
                        <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-coin-foreground">
                          <Coins className="h-3.5 w-3.5 text-coin" /> {t.valor_moedas} moedas
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deletar.mutate(t.id)}>
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
