import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Coins, Plus, ChevronLeft, ChevronRight, Trash2, CalendarClock, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, getDay, isSameMonth, isToday, addDays, isWeekend } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;
type Profile = Tables<"profiles">;

interface TarefaPadrao {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  valor_moedas: number;
}

interface TarefaRecorrente {
  id: string;
  tarefa_padrao_id: string;
  atribuida_a: string;
  periodicidade: string;
  dias_semana: number[];
  data_inicio: string;
  data_fim: string | null;
  ativa: boolean;
}

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A Fazer", variant: "outline" },
  pendente_aprovacao: { label: "Pendente", variant: "secondary" },
  concluida: { label: "Concluída", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
};

const diasSemanaLabel = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const periodicidadeLabel: Record<string, string> = {
  unica: "Única",
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

type FiltroDias = "todos" | "uteis" | "nao_uteis";

export default function AtribuirTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [filtroCrianca, setFiltroCrianca] = useState<string>("todas");
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false);

  // Create form state
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedCriancas, setSelectedCriancas] = useState<string[]>([]);
  const [periodicidade, setPeriodicidade] = useState<string>("unica");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [mesesReplicar, setMesesReplicar] = useState("3");
  const [filtroDias, setFiltroDias] = useState<FiltroDias>("todos");
  const [deleteScope, setDeleteScope] = useState<"instancia" | "serie">("instancia");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTarefa, setDeletingTarefa] = useState<Tarefa | null>(null);

  const { data: criancas } = useQuery({
    queryKey: ["criancas-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("tipo_perfil", "crianca");
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  const { data: templates } = useQuery({
    queryKey: ["tarefa-padrao", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa_padrao").select("*")
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data as TarefaPadrao[];
    },
    enabled: !!profile,
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: tarefasMes, isLoading } = useQuery({
    queryKey: ["tarefas-calendario", profile?.familia_id, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .gte("data_prevista", format(monthStart, "yyyy-MM-dd"))
        .lte("data_prevista", format(monthEnd, "yyyy-MM-dd"))
        .in("status", ["a_fazer", "pendente_aprovacao", "concluida", "rejeitada"])
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  const { data: recorrencias } = useQuery({
    queryKey: ["tarefas-recorrentes", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa_recorrente").select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("ativa", true);
      if (error) throw error;
      return data as TarefaRecorrente[];
    },
    enabled: !!profile,
  });

  // Filter tasks by selected child
  const tarefasFiltradas = useMemo(() => {
    if (!tarefasMes) return [];
    if (filtroCrianca === "todas") return tarefasMes;
    return tarefasMes.filter(t => t.atribuida_a === filtroCrianca);
  }, [tarefasMes, filtroCrianca]);

  // Build calendar days
  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);
    return { days, startPadding };
  }, [currentMonth]);

  // Group tasks by date (using filtered tasks)
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Tarefa[]>();
    tarefasFiltradas.forEach(t => {
      if (!t.data_prevista) return;
      const key = t.data_prevista;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tarefasFiltradas]);

  const selectedDateTasks = selectedDate
    ? tasksByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? []
    : [];

  const getCriancaNome = (userId: string | null) => {
    if (!userId) return "Sem atribuição";
    return criancas?.find(c => c.user_id === userId)?.nome ?? "Criança";
  };

  // Check if a date passes the weekday filter
  const passesFiltroDias = (date: Date, filtro: FiltroDias): boolean => {
    if (filtro === "todos") return true;
    const weekend = isWeekend(date);
    if (filtro === "uteis") return !weekend;
    if (filtro === "nao_uteis") return weekend;
    return true;
  };

  // Generate dates based on recurrence pattern
  const generateDates = (inicio: Date, periodicidade: string, diasSemana: number[], meses: number, filtro: FiltroDias): Date[] => {
    // única or meses=0 means single day only
    if (periodicidade === "unica" || meses === 0) {
      return [inicio];
    }

    // meses=1 means current month, meses=2 means current + next, etc.
    const fim = addMonths(inicio, meses);
    const dates: Date[] = [];
    let current = new Date(inicio);

    while (current < fim) {
      if (passesFiltroDias(current, filtro)) {
        if (periodicidade === "diaria") {
          dates.push(new Date(current));
        } else if (periodicidade === "semanal") {
          if (diasSemana.includes(getDay(current))) {
            dates.push(new Date(current));
          }
        } else if (periodicidade === "quinzenal") {
          if (diasSemana.includes(getDay(current))) {
            const weekNum = Math.floor((current.getTime() - inicio.getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (weekNum % 2 === 0) dates.push(new Date(current));
          }
        } else if (periodicidade === "mensal") {
          if (current.getDate() === inicio.getDate()) {
            dates.push(new Date(current));
          }
        }
      }
      current = addDays(current, 1);
    }
    return dates;
  };

  // Check for duplicate tasks
  const checkDuplicates = (): boolean => {
    if (!selectedDate || !selectedTemplate || !selectedCriancas.length) return false;
    const template = templates?.find(t => t.id === selectedTemplate);
    if (!template) return false;

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const existingTasks = tasksByDate.get(dateStr) ?? [];

    return selectedCriancas.some(criancaId =>
      existingTasks.some(t => t.nome === template.nome && t.atribuida_a === criancaId)
    );
  };

  const executeCriarTarefas = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate || !selectedCriancas.length || !selectedDate) throw new Error("Dados incompletos");

      const template = templates?.find(t => t.id === selectedTemplate);
      if (!template) throw new Error("Modelo não encontrado");

      const inicio = selectedDate;
      const meses = parseInt(mesesReplicar) ?? 0;

      for (const criancaId of selectedCriancas) {
        const isUnica = periodicidade === "unica";
        const finalDiasSemana = (periodicidade === "diaria" || isUnica) ? [] :
          (periodicidade === "semanal" || periodicidade === "quinzenal") ? diasSemana :
          [];

        // Generate instance dates
        const effectiveMeses = isUnica ? 0 : meses;
        const dates = generateDates(inicio, periodicidade, finalDiasSemana, effectiveMeses, filtroDias);
        if (dates.length === 0) continue;

        // Only create recurrence rule if not única and meses > 0
        let recId: string | null = null;
        if (!isUnica && effectiveMeses > 0) {
          const { data: rec, error: recError } = await supabase
            .from("tarefa_recorrente")
            .insert([{
              familia_id: profile!.familia_id,
              tarefa_padrao_id: template.id,
              atribuida_a: criancaId,
              periodicidade: periodicidade as "diaria" | "semanal" | "quinzenal" | "mensal",
              dias_semana: finalDiasSemana,
              data_inicio: format(inicio, "yyyy-MM-dd"),
              data_fim: format(addMonths(inicio, meses), "yyyy-MM-dd"),
            }])
            .select("id")
            .single();
          if (recError) throw recError;
          recId = rec.id;
        }

        // Create task instances in batches
        const batchSize = 50;
        for (let i = 0; i < dates.length; i += batchSize) {
          const batch = dates.slice(i, i + batchSize).map(d => ({
            nome: template.nome,
            descricao: template.descricao,
            categoria: template.categoria as "limpeza" | "estudos" | "exercicio" | "higiene" | "alimentacao" | "organizacao" | "outros",
            valor_moedas: template.valor_moedas,
            atribuida_a: criancaId,
            familia_id: profile!.familia_id,
            criada_por: profile!.user_id,
            data_prevista: format(d, "yyyy-MM-dd"),
            tarefa_recorrente_id: recId,
          }));
          const { error } = await supabase.from("tarefa").insert(batch);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-calendario"] });
      queryClient.invalidateQueries({ queryKey: ["tarefas-recorrentes"] });
      toast({ title: "Tarefas criadas no calendário! 📅" });
      setCreateDialogOpen(false);
      setConfirmDuplicateOpen(false);
      resetForm();
    },
    onError: (e) => toast({ title: "Erro ao criar tarefas", description: String(e), variant: "destructive" }),
  });

  const handleCriarTarefas = () => {
    if (checkDuplicates()) {
      setConfirmDuplicateOpen(true);
    } else {
      executeCriarTarefas.mutate();
    }
  };

  const aprovarTarefa = useMutation({
    mutationFn: async (tarefaId: string) => {
      const tarefa = selectedDateTasks.find(t => t.id === tarefaId);
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

      await supabase.from("profiles")
        .update({ saldo_moedas: anterior + tarefa.valor_moedas })
        .eq("user_id", tarefa.atribuida_a);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-calendario"] });
      toast({ title: "Tarefa aprovada! 🎉", description: "Moedas creditadas." });
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejeitarTarefa = useMutation({
    mutationFn: async ({ tarefaId, comentario }: { tarefaId: string; comentario: string }) => {
      const { error } = await supabase.from("tarefa")
        .update({ status: "rejeitada", comentario_responsavel: comentario || null })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-calendario"] });
      toast({ title: "Tarefa devolvida" });
      setRejectId(null);
      setRejectComment("");
    },
    onError: () => toast({ title: "Erro ao rejeitar", variant: "destructive" }),
  });

  const deletarTarefa = useMutation({
    mutationFn: async () => {
      if (!deletingTarefa) return;
      if (deleteScope === "serie" && deletingTarefa.tarefa_recorrente_id) {
        const { error: delInstances } = await supabase
          .from("tarefa")
          .delete()
          .eq("tarefa_recorrente_id", deletingTarefa.tarefa_recorrente_id)
          .gte("data_prevista", format(new Date(), "yyyy-MM-dd"))
          .eq("status", "a_fazer");
        if (delInstances) throw delInstances;

        const { error: delRule } = await supabase
          .from("tarefa_recorrente")
          .update({ ativa: false, data_fim: format(new Date(), "yyyy-MM-dd") })
          .eq("id", deletingTarefa.tarefa_recorrente_id);
        if (delRule) throw delRule;
      } else {
        const { error } = await supabase.from("tarefa").delete().eq("id", deletingTarefa.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tarefas-calendario"] });
      queryClient.invalidateQueries({ queryKey: ["tarefas-recorrentes"] });
      toast({ title: deleteScope === "serie" ? "Série removida" : "Instância removida" });
      setDeleteDialogOpen(false);
      setDeletingTarefa(null);
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  const resetForm = () => {
    setSelectedTemplate("");
    setSelectedCriancas([]);
    setPeriodicidade("unica");
    setDiasSemana([]);
    setMesesReplicar("3");
    setFiltroDias("todos");
  };

  const openCreateOnDate = (date: Date) => {
    setSelectedDate(date);
    resetForm();
    setCreateDialogOpen(true);
  };

  const openDelete = (tarefa: Tarefa) => {
    setDeletingTarefa(tarefa);
    setDeleteScope("instancia");
    setDeleteDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Calendário de Tarefas 📅</h1>
          <p className="text-muted-foreground">Atribua tarefas recorrentes pelo calendário</p>
        </motion.div>

        {/* Calendar Header with child filter */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-display text-lg font-semibold capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Child filter */}
        {criancas && criancas.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filtroCrianca} onValueChange={setFiltroCrianca}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por criança" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as crianças</SelectItem>
                {criancas.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Calendar Grid */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-7">
              {diasSemanaLabel.map(d => (
                <div key={d} className="border-b bg-muted/50 p-2 text-center text-xs font-semibold text-muted-foreground">
                  {d}
                </div>
              ))}
              {Array.from({ length: calendarDays.startPadding }).map((_, i) => (
                <div key={`pad-${i}`} className="border-b border-r bg-muted/20 p-2 min-h-[80px]" />
              ))}
              {calendarDays.days.map(day => {
                const key = format(day, "yyyy-MM-dd");
                const dayTasks = tasksByDate.get(key) ?? [];
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const today = isToday(day);

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDate(day)}
                    className={`cursor-pointer border-b border-r p-1.5 min-h-[80px] transition-colors hover:bg-muted/30 ${
                      isSelected ? "bg-primary/10 ring-2 ring-primary ring-inset" : ""
                    } ${today ? "bg-accent/10" : ""}`}
                  >
                    <div className={`text-xs font-semibold mb-1 ${today ? "text-primary" : "text-foreground"}`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map(t => (
                        <div
                          key={t.id}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${
                            t.status === "concluida" ? "bg-accent/20 text-accent-foreground" :
                            t.status === "pendente_aprovacao" ? "bg-secondary/20 text-secondary-foreground" :
                            t.status === "rejeitada" ? "bg-destructive/20 text-destructive" :
                            "bg-primary/10 text-primary"
                          }`}
                        >
                          {categoriasEmoji[t.categoria]} {t.nome}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{dayTasks.length - 3} mais</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected day detail */}
        {selectedDate && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold">
                    {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <Button size="sm" onClick={() => openCreateOnDate(selectedDate)}>
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>
                {selectedDateTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa neste dia.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDateTasks.map(tarefa => (
                      <div key={tarefa.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="text-xl">{categoriasEmoji[tarefa.categoria] ?? "⭐"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{tarefa.nome}</span>
                            <Badge variant={statusConfig[tarefa.status]?.variant ?? "outline"} className="text-[10px]">
                              {statusConfig[tarefa.status]?.label ?? tarefa.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                              <Coins className="h-3 w-3 text-coin" /> {tarefa.valor_moedas}
                            </span>
                            <span>→ {getCriancaNome(tarefa.atribuida_a)}</span>
                            {tarefa.tarefa_recorrente_id && <CalendarClock className="h-3 w-3" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {tarefa.status === "pendente_aprovacao" && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => aprovarTarefa.mutate(tarefa.id)}>
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRejectId(tarefa.id)}>
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {tarefa.status === "a_fazer" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDelete(tarefa)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Create recurrence dialog */}
        <Dialog open={createDialogOpen} onOpenChange={(o) => { if (!o) setCreateDialogOpen(false); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">
                Adicionar Tarefa — {selectedDate && format(selectedDate, "dd/MM/yyyy")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Modelo de Tarefa</Label>
                {!templates?.length ? (
                  <p className="text-sm text-muted-foreground mt-1">Cadastre modelos em "Tarefas" primeiro.</p>
                ) : (
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {categoriasEmoji[t.categoria]} {t.nome} ({t.valor_moedas} 🪙)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label>Atribuir a</Label>
                {!criancas?.length ? (
                  <p className="text-sm text-muted-foreground mt-1">Nenhuma criança cadastrada</p>
                ) : (
                  <div className="mt-2 space-y-2">
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
                      <Button type="button" variant="ghost" size="sm" className="text-xs"
                        onClick={() => setSelectedCriancas(prev =>
                          prev.length === criancas.length ? [] : criancas.map(c => c.user_id)
                        )}
                      >
                        {selectedCriancas.length === criancas.length ? "Desmarcar todas" : "Selecionar todas"}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label>Periodicidade</Label>
                <Select value={periodicidade} onValueChange={setPeriodicidade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(periodicidadeLabel).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(periodicidade === "semanal" || periodicidade === "quinzenal") && (
                <div>
                  <Label>Dias da semana</Label>
                  <div className="flex gap-1 mt-2">
                    {diasSemanaLabel.map((label, i) => (
                      <Button
                        key={i}
                        type="button"
                        size="sm"
                        variant={diasSemana.includes(i) ? "default" : "outline"}
                        className="h-8 w-10 p-0 text-xs"
                        onClick={() => setDiasSemana(prev =>
                          prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                        )}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {periodicidade !== "unica" && (
                <>
                  <div>
                    <Label>Replicar por quantos meses?</Label>
                    <Input type="number" min="0" max="12" value={mesesReplicar} onChange={e => setMesesReplicar(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-1">
                      {parseInt(mesesReplicar) === 0
                        ? "Apenas neste dia"
                        : parseInt(mesesReplicar) === 1
                        ? "Durante o mês atual"
                        : `Durante ${mesesReplicar} meses a partir desta data`}
                    </p>
                  </div>

                  {/* Weekday filter */}
                  <div>
                    <Label>Dias de replicação</Label>
                    <RadioGroup value={filtroDias} onValueChange={(v) => setFiltroDias(v as FiltroDias)} className="mt-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="todos" id="filtro-todos" />
                        <Label htmlFor="filtro-todos" className="font-normal">Todos os dias</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="uteis" id="filtro-uteis" />
                        <Label htmlFor="filtro-uteis" className="font-normal">Apenas dias úteis (Seg-Sex)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={handleCriarTarefas}
                disabled={!selectedTemplate || !selectedCriancas.length || executeCriarTarefas.isPending ||
                  ((periodicidade === "semanal" || periodicidade === "quinzenal") && diasSemana.length === 0)}
              >
                {executeCriarTarefas.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Tarefas"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm duplicate dialog */}
        <Dialog open={confirmDuplicateOpen} onOpenChange={(o) => { if (!o) setConfirmDuplicateOpen(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Tarefa duplicada</DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              Já existe uma tarefa com o mesmo nome atribuída à mesma criança neste dia. Deseja criar mesmo assim?
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDuplicateOpen(false)}>Cancelar</Button>
              <Button onClick={() => executeCriarTarefas.mutate()} disabled={executeCriarTarefas.isPending}>
                {executeCriarTarefas.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar mesmo assim"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(o) => { if (!o) { setDeleteDialogOpen(false); setDeletingTarefa(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Remover Tarefa</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm">Como deseja remover <strong>{deletingTarefa?.nome}</strong>?</p>
              <RadioGroup value={deleteScope} onValueChange={(v) => setDeleteScope(v as any)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="instancia" id="del-inst" />
                  <Label htmlFor="del-inst">Apenas neste dia</Label>
                </div>
                {deletingTarefa?.tarefa_recorrente_id && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="serie" id="del-serie" />
                    <Label htmlFor="del-serie">Toda a recorrência futura</Label>
                  </div>
                )}
              </RadioGroup>
            </div>
            <DialogFooter>
              <Button variant="destructive" onClick={() => deletarTarefa.mutate()} disabled={deletarTarefa.isPending}>
                {deletarTarefa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
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
