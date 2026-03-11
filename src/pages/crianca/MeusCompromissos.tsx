import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Plus, Loader2, Check, Trash2, Edit, BookOpen,
  Stethoscope, Dumbbell, User, MoreHorizontal, CalendarIcon, Clock,
  Coins, CheckCircle2, AlertTriangle, Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  format, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, isSameDay, parseISO, isBefore, isAfter,
  eachDayOfInterval, getDay, isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Tables } from "@/integrations/supabase/types";

type CategoriaCompromisso = "prova" | "medico" | "esporte" | "pessoal" | "outro";
type Tarefa = Tables<"tarefa">;
type FiltroPeriodo = "hoje" | "semana" | "mes" | "15dias";
type FiltroTipo = "todos" | "compromissos" | "tarefas";
type FiltroSituacao = "todos" | "pendentes" | "concluidos";

interface Compromisso {
  id: string;
  familia_id: string;
  crianca_id: string;
  criado_por: string;
  nome: string;
  descricao: string | null;
  categoria: CategoriaCompromisso;
  data_hora: string;
  concluido: boolean;
  created_at: string;
  updated_at: string;
}

const categoriasConfig: Record<CategoriaCompromisso, { label: string; emoji: string; icon: typeof BookOpen; color: string }> = {
  prova: { label: "Prova", emoji: "📝", icon: BookOpen, color: "text-blue-600" },
  medico: { label: "Médico", emoji: "🏥", icon: Stethoscope, color: "text-red-500" },
  esporte: { label: "Esporte", emoji: "⚽", icon: Dumbbell, color: "text-green-600" },
  pessoal: { label: "Pessoal", emoji: "👤", icon: User, color: "text-purple-600" },
  outro: { label: "Outro", emoji: "📌", icon: MoreHorizontal, color: "text-muted-foreground" },
};

const categoriaTarefaEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

const statusTarefaLabel: Record<string, string> = {
  a_fazer: "A Fazer",
  pendente_aprovacao: "Em validação",
  concluida: "Concluída",
  rejeitada: "Devolvida",
  dispensa_solicitada: "Dispensa Pedida",
  arquivada: "Dispensada",
};

const periodoLabels: Record<FiltroPeriodo, string> = {
  hoje: "Hoje",
  semana: "Semana",
  mes: "Mês",
  "15dias": "15 dias",
};

const dayNames = ["D", "S", "T", "Q", "Q", "S", "S"];

export default function MeusCompromissos() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("hoje");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>("todos");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<CategoriaCompromisso>("outro");
  const [dataCompromisso, setDataCompromisso] = useState<Date>(new Date());
  const [hora, setHora] = useState("08:00");
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const resetForm = () => {
    setNome("");
    setDescricao("");
    setCategoria("outro");
    setDataCompromisso(new Date());
    setHora("08:00");
    setDiaInteiro(false);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (c: Compromisso) => {
    setEditingId(c.id);
    setNome(c.nome);
    setDescricao(c.descricao ?? "");
    setCategoria(c.categoria);
    const dt = parseISO(c.data_hora);
    setDataCompromisso(dt);
    const timeStr = format(dt, "HH:mm");
    const isDiaInteiro = timeStr === "00:00";
    setDiaInteiro(isDiaInteiro);
    setHora(isDiaInteiro ? "08:00" : timeStr);
    setDialogOpen(true);
  };

  // Fetch compromissos
  const { data: compromissos, isLoading: loadingCompromissos } = useQuery({
    queryKey: ["compromissos", profile?.user_id, profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compromisso")
        .select("*")
        .eq("crianca_id", profile!.user_id)
        .eq("familia_id", profile!.familia_id)
        .order("data_hora", { ascending: true });
      if (error) throw error;
      return data as Compromisso[];
    },
    enabled: !!profile,
  });

  // Fetch tarefas
  const { data: tarefas, isLoading: loadingTarefas } = useQuery({
    queryKey: ["agenda-tarefas", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("*")
        .eq("atribuida_a", profile!.user_id)
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  const isLoading = loadingCompromissos || loadingTarefas;

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile || !nome.trim()) throw new Error("Nome obrigatório");
      const dt = new Date(dataCompromisso);
      if (diaInteiro) {
        dt.setHours(0, 0, 0, 0);
      } else {
        const [h, m] = hora.split(":").map(Number);
        dt.setHours(h, m, 0, 0);
      }

      if (editingId) {
        const { error } = await supabase
          .from("compromisso")
          .update({ nome: nome.trim(), descricao: descricao.trim() || null, categoria, data_hora: dt.toISOString() })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("compromisso")
          .insert({
            familia_id: profile.familia_id, crianca_id: profile.user_id, criado_por: profile.user_id,
            nome: nome.trim(), descricao: descricao.trim() || null, categoria, data_hora: dt.toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      toast({ title: editingId ? "Compromisso atualizado! ✏️" : "Compromisso criado! 📌" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  const toggleConcluido = useMutation({
    mutationFn: async ({ id, concluido }: { id: string; concluido: boolean }) => {
      const { error } = await supabase.from("compromisso").update({ concluido }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compromissos"] }),
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("compromisso").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      toast({ title: "Compromisso excluído 🗑️" });
    },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  // Date range for current period filter
  const dateRange = useMemo(() => {
    const now = new Date();
    if (filtroPeriodo === "hoje") return { start: startOfDay(now), end: endOfDay(now) };
    if (filtroPeriodo === "semana") return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    if (filtroPeriodo === "mes") return { start: startOfMonth(now), end: endOfMonth(now) };
    // 15dias
    return { start: startOfDay(now), end: endOfDay(addDays(now, 14)) };
  }, [filtroPeriodo]);

  // Calendar days to display
  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    // Pad start to align with weekday columns
    const firstDay = getDay(days[0]);
    const padding: (Date | null)[] = Array(firstDay).fill(null);
    return [...padding, ...days];
  }, [dateRange]);

  // Overdue compromissos (before current range, still pending)
  const overdueCompromissos = useMemo(() => {
    const now = new Date();
    return (compromissos ?? []).filter((c) => !c.concluido && isBefore(parseISO(c.data_hora), startOfDay(now)));
  }, [compromissos]);

  // Items for a given day
  const getCompromissosForDay = (day: Date) =>
    (compromissos ?? []).filter((c) => isSameDay(parseISO(c.data_hora), day));

  const getTarefasForDay = (day: Date) =>
    (tarefas ?? []).filter((t) => t.data_prevista && isSameDay(new Date(t.data_prevista + "T12:00:00"), day));

  const getDayHasItems = (day: Date) => {
    const hasC = getCompromissosForDay(day).length > 0;
    const hasT = getTarefasForDay(day).length > 0;
    return { hasC, hasT };
  };

  // Items for the selected day, filtered
  const selectedDayCompromissos = useMemo(() => {
    let items = getCompromissosForDay(selectedDate);
    if (filtroSituacao === "pendentes") items = items.filter((c) => !c.concluido);
    if (filtroSituacao === "concluidos") items = items.filter((c) => c.concluido);
    return items;
  }, [compromissos, selectedDate, filtroSituacao]);

  const selectedDayTarefas = useMemo(() => {
    let items = getTarefasForDay(selectedDate);
    if (filtroSituacao === "pendentes") items = items.filter((t) => ["a_fazer", "rejeitada"].includes(t.status));
    if (filtroSituacao === "concluidos") items = items.filter((t) => ["concluida", "arquivada"].includes(t.status));
    return items;
  }, [tarefas, selectedDate, filtroSituacao]);

  const [dayTab, setDayTab] = useState<"compromissos" | "tarefas">("compromissos");

  // Auto-select today when changing period
  const handlePeriodoChange = (p: FiltroPeriodo) => {
    setFiltroPeriodo(p);
    setSelectedDate(new Date());
  };

  const renderCompromissoCard = (c: Compromisso, i: number) => {
    const cat = categoriasConfig[c.categoria];
    const dt = parseISO(c.data_hora);
    const isOverdue = !c.concluido && isBefore(dt, new Date());
    const isDiaInteiro = format(dt, "HH:mm") === "00:00";

    return (
      <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
        <Card className={cn(
          "border-2 transition-shadow hover:shadow-md",
          c.concluido ? "border-muted bg-muted/30 opacity-70" : isOverdue ? "border-destructive/30" : "border-border"
        )}>
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <button
                onClick={() => toggleConcluido.mutate({ id: c.id, concluido: !c.concluido })}
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  c.concluido ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 hover:border-primary"
                )}
              >
                {c.concluido && <Check className="h-3.5 w-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-base shrink-0">{cat.emoji}</span>
                  <span className={cn("font-display font-semibold text-sm truncate", c.concluido && "line-through text-muted-foreground")}>{c.nome}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-0.5">
                    <CalendarIcon className="h-3 w-3" />
                    {format(dt, "dd/MM", { locale: ptBR })}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {isDiaInteiro ? "Dia inteiro" : format(dt, "HH:mm")}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{cat.label}</Badge>
                  {isOverdue && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                </div>
                {c.descricao && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.descricao}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const renderTarefaCard = (t: Tarefa, i: number) => {
    const emoji = categoriaTarefaEmoji[t.categoria] ?? "⭐";
    const isConcluida = ["concluida", "arquivada"].includes(t.status);
    return (
      <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
        <Card className={cn("border-2 transition-shadow hover:shadow-md", isConcluida ? "border-muted bg-muted/30 opacity-70" : "border-border")}>
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <div className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                isConcluida ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
              )}>
                {isConcluida && <Check className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-base shrink-0">{emoji}</span>
                  <span className={cn("font-display font-semibold text-sm truncate", isConcluida && "line-through text-muted-foreground")}>{t.nome}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                    <Coins className="h-3 w-3 text-coin" /> {t.valor_moedas}
                  </span>
                  <Badge variant={isConcluida ? "default" : "outline"} className="text-[10px]">
                    {statusTarefaLabel[t.status] ?? t.status}
                  </Badge>
                  {t.tarefa_extra && <Badge variant="outline" className="text-[10px]">Extra</Badge>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" /> Minha Agenda
            </h1>
            <p className="text-sm text-muted-foreground">Provas, consultas, compromissos e tarefas</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </div>

        {/* Period Filter */}
        <Tabs value={filtroPeriodo} onValueChange={(v) => handlePeriodoChange(v as FiltroPeriodo)}>
          <TabsList className="w-full">
            {Object.entries(periodoLabels).map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="flex-1 text-xs sm:text-sm">{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as FiltroTipo)}>
            <SelectTrigger className="w-auto min-w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">📋 Tudo</SelectItem>
              <SelectItem value="compromissos">📌 Compromissos</SelectItem>
              <SelectItem value="tarefas">✅ Tarefas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroSituacao} onValueChange={(v) => setFiltroSituacao(v as FiltroSituacao)}>
            <SelectTrigger className="w-auto min-w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas situações</SelectItem>
              <SelectItem value="pendentes">Pendentes</SelectItem>
              <SelectItem value="concluidos">Concluídos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Overdue alert */}
        {overdueCompromissos.length > 0 && filtroTipo !== "tarefas" && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive font-medium">
                {overdueCompromissos.length} compromisso{overdueCompromissos.length > 1 ? "s" : ""} atrasado{overdueCompromissos.length > 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Responsive Calendar Grid */}
            <Card>
              <CardContent className="p-2 sm:p-3">
                {/* Day names header */}
                <div className="grid grid-cols-7 mb-1">
                  {dayNames.map((d, i) => (
                    <div key={i} className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {calendarDays.map((day, i) => {
                    if (!day) return <div key={`pad-${i}`} />;
                    const { hasC, hasT } = getDayHasItems(day);
                    const isSelected = isSameDay(day, selectedDate);
                    const today = isToday(day);
                    const dayCompromissos = getCompromissosForDay(day);
                    const hasOverdue = dayCompromissos.some(c => !c.concluido && isBefore(parseISO(c.data_hora), new Date()));

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          "relative flex flex-col items-center justify-center rounded-lg py-1.5 sm:py-2 transition-colors text-xs sm:text-sm",
                          isSelected
                            ? "bg-primary text-primary-foreground font-bold"
                            : today
                              ? "bg-accent text-accent-foreground font-semibold"
                              : "hover:bg-muted",
                          hasOverdue && !isSelected && "ring-1 ring-destructive/40"
                        )}
                      >
                        <span>{format(day, "d")}</span>
                        {/* Indicator dots */}
                        <div className="flex gap-0.5 mt-0.5">
                          {hasC && <span className={cn("h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-primary")} />}
                          {hasT && <span className={cn("h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full", isSelected ? "bg-primary-foreground/60" : "bg-coin")} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Selected day detail */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </h3>

              {filtroTipo === "todos" ? (
                <Tabs value={dayTab} onValueChange={(v) => setDayTab(v as "compromissos" | "tarefas")}>
                  <TabsList className="w-full">
                    <TabsTrigger value="compromissos" className="flex-1 gap-1 text-xs">
                      📌 Compromissos
                      {selectedDayCompromissos.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-1">{selectedDayCompromissos.length}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="tarefas" className="flex-1 gap-1 text-xs">
                      ✅ Tarefas
                      {selectedDayTarefas.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-1">{selectedDayTarefas.length}</Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="compromissos" className="space-y-2 mt-2">
                    {selectedDayCompromissos.length > 0
                      ? selectedDayCompromissos.map((c, i) => renderCompromissoCard(c, i))
                      : <p className="text-sm text-muted-foreground py-4 text-center">Nenhum compromisso neste dia</p>}
                  </TabsContent>
                  <TabsContent value="tarefas" className="space-y-2 mt-2">
                    {selectedDayTarefas.length > 0
                      ? selectedDayTarefas.map((t, i) => renderTarefaCard(t, i))
                      : <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma tarefa neste dia</p>}
                  </TabsContent>
                </Tabs>
              ) : filtroTipo === "compromissos" ? (
                <div className="space-y-2">
                  {selectedDayCompromissos.length > 0
                    ? selectedDayCompromissos.map((c, i) => renderCompromissoCard(c, i))
                    : <p className="text-sm text-muted-foreground py-4 text-center">Nenhum compromisso neste dia</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDayTarefas.length > 0
                    ? selectedDayTarefas.map((t, i) => renderTarefaCard(t, i))
                    : <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma tarefa neste dia</p>}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Compromisso" : "Novo Compromisso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Prova de Matemática" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaCompromisso)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoriasConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.emoji} {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data *</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dataCompromisso, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3">
                    <div className="rdp">
                      {/* Using inline calendar from shadcn */}
                    </div>
                  </div>
                  {/* Fallback to input for simplicity */}
                  <div className="p-3 pt-0">
                    <Input
                      type="date"
                      value={format(dataCompromisso, "yyyy-MM-dd")}
                      onChange={(e) => {
                        if (e.target.value) {
                          setDataCompromisso(new Date(e.target.value + "T12:00:00"));
                          setDatePickerOpen(false);
                        }
                      }}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dia-inteiro"
                  checked={diaInteiro}
                  onCheckedChange={(v) => setDiaInteiro(!!v)}
                />
                <Label htmlFor="dia-inteiro" className="text-sm cursor-pointer">Dia inteiro</Label>
              </div>
              {!diaInteiro && (
                <div className="flex-1">
                  <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              )}
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Detalhes opcionais..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !nome.trim()}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
