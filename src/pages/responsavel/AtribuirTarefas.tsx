import { useAuth } from "@/contexts/AuthContext";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Coins, Plus, ChevronLeft, ChevronRight, Trash2, CalendarClock, Filter, Search, Undo2, Star, MessageSquare, Clock, AlertTriangle, Archive, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InteracaoInput } from "@/components/InteracaoInput";
import { TarefaHistoricoSheet } from "@/components/TarefaHistoricoSheet";
import { salvarInteracao } from "@/lib/interacao";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, getDay, isToday, addDays, isWeekend, isBefore, startOfDay, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";

type Tarefa = Tables<"tarefa">;
type Profile = Tables<"profiles">;
type StatusTarefa = "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "arquivada" | "dispensa_solicitada";

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

const categoriasLabel: Record<string, string> = {
  limpeza: "Limpeza", estudos: "Estudos", exercicio: "Exercício", higiene: "Higiene",
  alimentacao: "Alimentação", organizacao: "Organização", outros: "Outros",
};

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A fazer", icon: ClipboardList, color: "text-primary", badgeVariant: "default" },
  nao_feita: { label: "Não feita", icon: XCircle, color: "text-muted-foreground", badgeVariant: "destructive" },
  pendente_aprovacao: { label: "Em validação", icon: Clock, color: "text-yellow-600", badgeVariant: "outline" },
  concluida: { label: "Concluída", icon: CheckCircle2, color: "text-success", badgeVariant: "secondary" },
  rejeitada: { label: "Rejeitada", icon: AlertTriangle, color: "text-destructive", badgeVariant: "destructive" },
  dispensa_solicitada: { label: "Dispensa", icon: Clock, color: "text-orange-500", badgeVariant: "outline" },
  arquivada: { label: "Dispensada", icon: Archive, color: "text-muted-foreground", badgeVariant: "outline" },
};

const diasSemanaLabelCalendar = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const diasSemanaLabel = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const periodicidadeLabel: Record<string, string> = {
  unica: "Única",
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

type FiltroDias = "todos" | "uteis" | "nao_uteis";
type StatusFiltro = "todos" | "a_fazer" | "nao_feita" | "pendente_aprovacao" | "concluida" | "rejeitada" | "dispensa_solicitada" | "arquivada";

type DialogAction = {
  type: "aprovar" | "rejeitar" | "aceitar_dispensa" | "negar_dispensa" | "reverter_aprovacao" | "reverter_rejeicao" | "comentar";
  tarefaId: string;
  tarefa?: Tarefa;
};

function getEffectiveStatus(t: Tarefa): string {
  if (t.status === "a_fazer" && t.data_prevista) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const prevista = new Date(t.data_prevista + "T00:00:00");
    if (prevista < today) return "nao_feita";
  }
  return t.status;
}

type CalendarViewType = "hoje" | "semanal" | "quinzenal_view" | "mensal";

export default function AtribuirTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get("status");
  const urlAutoChild = searchParams.get("auto_child") === "1";
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [calendarView, setCalendarView] = useState<CalendarViewType>(isMobile ? "hoje" : "semanal");
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { selectedChildId: filtroCrianca, setSelectedChildId: setFiltroCrianca } = useSelectedChild();
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false);

  // Create form state
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [selectedCriancas, setSelectedCriancas] = useState<string[]>([]);
  const [periodicidade, setPeriodicidade] = useState<string>("unica");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [mesesReplicar, setMesesReplicar] = useState("3");
  const [filtroDias, setFiltroDias] = useState<FiltroDias>("todos");
  const [deleteScope, setDeleteScope] = useState<"instancia" | "serie">("instancia");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTarefa, setDeletingTarefa] = useState<Tarefa | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategoria, setTemplateCategoria] = useState("todas");
  const [taskListSearch, setTaskListSearch] = useState("");
  const [taskListCategoria, setTaskListCategoria] = useState("todas");
  const [taskListStatus, setTaskListStatus] = useState<StatusFiltro>(urlStatus ? "todos" : "todos");
  const [urlStatusFilters] = useState<string[]>(urlStatus ? urlStatus.split(",") : []);

  // Action dialog state (ported from AcompanharTarefas)
  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [dialogMensagem, setDialogMensagem] = useState("");
  const [dialogFoto, setDialogFoto] = useState<File | null>(null);
  const [extraCategoria, setExtraCategoria] = useState("outros");
  const [extraMoedas, setExtraMoedas] = useState("5");
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [calendarDayTab, setCalendarDayTab] = useState<"tarefas" | "compromissos" | "deveres">("tarefas");

  // Compromisso creation dialog state
  const [compDialogOpen, setCompDialogOpen] = useState(false);
  const [compNome, setCompNome] = useState("");
  const [compDescricao, setCompDescricao] = useState("");
  const [compCategoria, setCompCategoria] = useState("outro");
  const [compCriancaId, setCompCriancaId] = useState("");
  const [compDataHora, setCompDataHora] = useState("");
  const [compDiaInteiro, setCompDiaInteiro] = useState(false);

  const closeActionDialog = () => {
    setDialogAction(null);
    setDialogMensagem("");
    setDialogFoto(null);
    setExtraCategoria("outros");
    setExtraMoedas("5");
  };

  const openActionDialog = (type: DialogAction["type"], tarefaId: string, tarefa?: Tarefa) => {
    setDialogAction({ type, tarefaId, tarefa });
    setDialogMensagem("");
    setDialogFoto(null);
    if (tarefa?.tarefa_extra) {
      setExtraCategoria(tarefa.categoria);
      setExtraMoedas(String(tarefa.valor_moedas));
    } else {
      setExtraCategoria("outros");
      setExtraMoedas("5");
    }
  };

  const { data: membrosAll } = useQuery({
    queryKey: ["membros-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("*")
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  const criancas = membrosAll?.filter(m => m.tipo_perfil === "crianca") ?? [];

  // Auto-select first child if none selected
  useEffect(() => {
    if (criancas && criancas.length > 0 && filtroCrianca === "todos") {
      setFiltroCrianca(criancas[0].user_id);
    }
  }, [criancas]);

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
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });

  // Determine query range based on view
  const queryStart = calendarView === "mensal" ? monthStart : calendarView === "semanal" ? currentWeekStart : calendarView === "quinzenal_view" ? startOfDay(new Date()) : startOfDay(new Date());
  const queryEnd = calendarView === "mensal" ? monthEnd : calendarView === "semanal" ? weekEnd : calendarView === "quinzenal_view" ? addDays(startOfDay(new Date()), 15) : addDays(startOfDay(new Date()), 1);

  const { data: tarefasMes, isLoading } = useQuery({
    queryKey: ["tarefas-calendario", profile?.familia_id, format(queryStart, "yyyy-MM-dd"), format(queryEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .gte("data_prevista", format(queryStart, "yyyy-MM-dd"))
        .lte("data_prevista", format(queryEnd, "yyyy-MM-dd"))
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

  // Compromissos for the family
  const { data: compromissosFamilia } = useQuery({
    queryKey: ["compromissos-familia", profile?.familia_id],
    queryFn: async () => {
      let query = supabase.from("compromisso").select("*").eq("familia_id", profile!.familia_id).order("data_hora", { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Configuracao familia (deveres/regras de ouro) for all children
  const { data: configsFamilia } = useQuery({
    queryKey: ["configs-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracao_familia").select("*").eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Regra ouro checkins
  const { data: allCheckins } = useQuery({
    queryKey: ["regra-ouro-checkins-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("regra_ouro_checkin").select("*").eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });


  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    return templates.filter(t => {
      const matchAtiva = (t as any).ativa !== false;
      const matchSearch = !templateSearch ||
        t.nome.toLowerCase().includes(templateSearch.toLowerCase()) ||
        (t.descricao ?? "").toLowerCase().includes(templateSearch.toLowerCase());
      const matchCategoria = templateCategoria === "todas" || t.categoria === templateCategoria;
      return matchAtiva && matchSearch && matchCategoria;
    });
  }, [templates, templateSearch, templateCategoria]);

  // Filter tasks by selected child
  const tarefasFiltradas = useMemo(() => {
    if (!tarefasMes) return [];
    if (filtroCrianca === "todos") return tarefasMes;
    return tarefasMes.filter(t => t.atribuida_a === filtroCrianca);
  }, [tarefasMes, filtroCrianca]);

  // Build calendar days
  const calendarDays = useMemo(() => {
    if (calendarView === "hoje") {
      const today = startOfDay(new Date());
      const tomorrow = addDays(today, 1);
      return { days: [today, tomorrow], startPadding: 0 };
    }
    if (calendarView === "quinzenal_view") {
      const today = startOfDay(new Date());
      const days = eachDayOfInterval({ start: today, end: addDays(today, 14) });
      return { days, startPadding: 0 };
    }
    if (calendarView === "semanal") {
      const days = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });
      return { days, startPadding: 0 };
    }
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);
    return { days, startPadding };
  }, [currentMonth, currentWeekStart, calendarView]);

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

  const selectedDateTasks = useMemo(() => {
    const dayTasks = selectedDate
      ? tasksByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? []
      : [];
    return dayTasks.filter(t => {
      const matchSearch = !taskListSearch ||
        t.nome.toLowerCase().includes(taskListSearch.toLowerCase()) ||
        (t.descricao ?? "").toLowerCase().includes(taskListSearch.toLowerCase());
      const matchCategoria = taskListCategoria === "todas" || t.categoria === taskListCategoria;
      const effective = getEffectiveStatus(t);
      const matchStatus = urlStatusFilters.length > 0
        ? urlStatusFilters.includes(effective)
        : taskListStatus === "todos" || effective === taskListStatus;
      return matchSearch && matchCategoria && matchStatus;
    });
  }, [selectedDate, tasksByDate, taskListSearch, taskListCategoria, taskListStatus, urlStatusFilters]);

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
    if (periodicidade === "unica" || meses === 0) {
      return [inicio];
    }
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

  const [duplicateDetails, setDuplicateDetails] = useState<string[]>([]);

  const checkDuplicates = (): boolean => {
    if (!selectedDate || !selectedTemplates.length || !selectedCriancas.length) return false;
    const selectedTpls = templates?.filter(t => selectedTemplates.includes(t.id)) ?? [];
    if (!selectedTpls.length) return false;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const existingTasks = tasksByDate.get(dateStr) ?? [];
    const duplicates: string[] = [];
    selectedCriancas.forEach(criancaId => {
      const criancaNome = getCriancaNome(criancaId);
      selectedTpls.forEach(template => {
        if (existingTasks.some(t => t.nome === template.nome && t.atribuida_a === criancaId)) {
          duplicates.push(`"${template.nome}" → ${criancaNome}`);
        }
      });
    });
    setDuplicateDetails(duplicates);
    return duplicates.length > 0;
  };

  const executeCriarTarefas = useMutation({
    mutationFn: async () => {
      if (!selectedTemplates.length || !selectedCriancas.length || !selectedDate) throw new Error("Dados incompletos");
      const selectedTpls = templates?.filter(t => selectedTemplates.includes(t.id)) ?? [];
      if (!selectedTpls.length) throw new Error("Modelo não encontrado");
      const inicio = selectedDate;
      const meses = parseInt(mesesReplicar) ?? 0;
      for (const template of selectedTpls) {
        for (const criancaId of selectedCriancas) {
          const isUnica = periodicidade === "unica";
          const finalDiasSemana = (periodicidade === "diaria" || isUnica) ? [] :
            (periodicidade === "semanal" || periodicidade === "quinzenal") ? diasSemana : [];
          const effectiveMeses = isUnica ? 0 : meses;
          const dates = generateDates(inicio, periodicidade, finalDiasSemana, effectiveMeses, filtroDias);
          if (dates.length === 0) continue;
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
      }
    },
    onSuccess: () => {
      invalidateAll();
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

  // Full action mutation (ported from AcompanharTarefas)
  const actionMutation = useMutation({
    mutationFn: async ({ action, mensagem, foto, extraEdit }: { action: DialogAction; mensagem: string; foto: File | null; extraEdit?: { categoria: string; valor_moedas: number } }) => {
      const { type, tarefaId } = action;
      const tarefa = action.tarefa ?? tarefasMes?.find(t => t.id === tarefaId);
      if (!tarefa) throw new Error("Tarefa não encontrada");
      const statusAnterior = tarefa.status;

      if (type === "aprovar") {
        if (!tarefa.atribuida_a) throw new Error("Tarefa sem atribuição");
        const valorMoedas = extraEdit ? extraEdit.valor_moedas : tarefa.valor_moedas;
        const updateData: Record<string, unknown> = {
          status: "concluida",
          data_aprovacao: new Date().toISOString(),
          comentario_responsavel: mensagem || null,
        };
        if (extraEdit) {
          updateData.categoria = extraEdit.categoria;
          updateData.valor_moedas = extraEdit.valor_moedas;
        }
        const { error: taskError } = await supabase.from("tarefa").update(updateData).eq("id", tarefaId);
        if (taskError) throw taskError;
        const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: tarefa.atribuida_a });
        const anterior = (saldoAtual as number) ?? 0;
        const { error: txError } = await supabase.from("transacao").insert({
          user_id: tarefa.atribuida_a,
          familia_id: profile!.familia_id,
          tipo: "ganho_tarefa",
          quantidade_moedas: valorMoedas,
          saldo_anterior: anterior,
          saldo_posterior: anterior + valorMoedas,
          referencia_id: tarefaId,
          descricao: `Tarefa: ${tarefa.nome}`,
        });
        if (txError) throw txError;
        await supabase.from("profiles").update({ saldo_moedas: anterior + valorMoedas }).eq("user_id", tarefa.atribuida_a);
        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "concluida", mensagem, foto });
      }

      if (type === "rejeitar") {
        const { error } = await supabase.from("tarefa")
          .update({ status: "rejeitada" as StatusTarefa, comentario_responsavel: mensagem || null })
          .eq("id", tarefaId);
        if (error) throw error;
        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "rejeitada", mensagem, foto });
      }

      if (type === "aceitar_dispensa") {
        const { error } = await supabase.from("tarefa")
          .update({ status: "arquivada" as StatusTarefa, comentario_responsavel: mensagem || "Dispensa aceita", data_aprovacao: new Date().toISOString() })
          .eq("id", tarefaId);
        if (error) throw error;
        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "arquivada", mensagem: mensagem || "Dispensa aceita", foto });
      }

      if (type === "negar_dispensa") {
        const { error } = await supabase.from("tarefa")
          .update({ status: "a_fazer" as StatusTarefa, comentario_responsavel: mensagem || "Dispensa negada", justificativa: null })
          .eq("id", tarefaId);
        if (error) throw error;
        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "a_fazer", mensagem: mensagem || "Dispensa negada", foto });
      }

      if (type === "reverter_aprovacao") {
        if (!tarefa.atribuida_a) throw new Error("Tarefa sem atribuição");
        if (tarefa.status === "concluida") {
          const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: tarefa.atribuida_a });
          const anterior = (saldoAtual as number) ?? 0;
          const novoSaldo = anterior - tarefa.valor_moedas;
          const { error: txError } = await supabase.from("transacao").insert({
            user_id: tarefa.atribuida_a,
            familia_id: profile!.familia_id,
            tipo: "reversao",
            quantidade_moedas: -tarefa.valor_moedas,
            saldo_anterior: anterior,
            saldo_posterior: novoSaldo,
            referencia_id: tarefaId,
            descricao: `Reversão: ${tarefa.nome}`,
          });
          if (txError) throw txError;
          await supabase.from("profiles").update({ saldo_moedas: novoSaldo }).eq("user_id", tarefa.atribuida_a);
          const { error } = await supabase.from("tarefa")
            .update({ status: "pendente_aprovacao" as StatusTarefa, data_aprovacao: null, comentario_responsavel: mensagem || null })
            .eq("id", tarefaId);
          if (error) throw error;
        } else if (tarefa.status === "arquivada") {
          const { error } = await supabase.from("tarefa")
            .update({ status: "dispensa_solicitada" as StatusTarefa, data_aprovacao: null, comentario_responsavel: mensagem || null })
            .eq("id", tarefaId);
          if (error) throw error;
        }
        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: tarefa.status === "concluida" ? "pendente_aprovacao" : "dispensa_solicitada", mensagem, foto });
      }

      if (type === "reverter_rejeicao") {
        const { error } = await supabase.from("tarefa")
          .update({ status: "pendente_aprovacao" as StatusTarefa, comentario_responsavel: mensagem || null })
          .eq("id", tarefaId);
        if (error) throw error;
        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "pendente_aprovacao", mensagem, foto });
      }

      if (type === "comentar") {
        if (mensagem || foto) {
          const { error } = await supabase.from("tarefa")
            .update({ comentario_responsavel: mensagem || null })
            .eq("id", tarefaId);
          if (error) throw error;
          await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: statusAnterior, mensagem, foto });
        }
      }
    },
    onSuccess: (_, vars) => {
      invalidateAll();
      const msgs: Record<string, string> = {
        aprovar: "Tarefa aprovada! 🎉",
        rejeitar: "Tarefa devolvida para a criança",
        aceitar_dispensa: "Dispensa aceita ✅",
        negar_dispensa: "Dispensa negada - tarefa devolvida",
        reverter_aprovacao: "Decisão revertida ↩️",
        reverter_rejeicao: "Rejeição revertida ↩️",
        comentar: "Comentário enviado! 💬",
      };
      toast({ title: msgs[vars.action.type] ?? "Ação realizada" });
      closeActionDialog();
    },
    onError: () => toast({ title: "Erro ao executar ação", variant: "destructive" }),
  });

  const deletarTarefa = useMutation({
    mutationFn: async () => {
      if (!deletingTarefa) return;
      if (deleteScope === "serie" && deletingTarefa.tarefa_recorrente_id) {
        const { error: delInstances } = await supabase
          .from("tarefa").delete()
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
      invalidateAll();
      toast({ title: deleteScope === "serie" ? "Série removida" : "Instância removida" });
      setDeleteDialogOpen(false);
      setDeletingTarefa(null);
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tarefas-calendario"] });
    queryClient.invalidateQueries({ queryKey: ["tarefas-recorrentes"] });
    queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
    queryClient.invalidateQueries({ queryKey: ["acompanhar-tarefas"] });
    queryClient.invalidateQueries({ queryKey: ["responsavel-stats"] });
    queryClient.invalidateQueries({ queryKey: ["crianca"] });
    queryClient.invalidateQueries({ queryKey: ["compromissos-familia"] });
    queryClient.invalidateQueries({ queryKey: ["regra-ouro-checkins-familia"] });
    setBatchSelected(new Set());
  };

  const batchActionMutation = useMutation({
    mutationFn: async ({ type }: { type: "aprovar" | "rejeitar" }) => {
      const ids = Array.from(batchSelected);
      const tasks = ids.map(id => tarefasMes?.find(t => t.id === id)).filter(Boolean) as Tarefa[];
      const eligible = tasks.filter(t => type === "rejeitar" || !t.tarefa_extra);
      for (const tarefa of eligible) {
        const statusAnterior = tarefa.status;
        if (type === "aprovar") {
          if (!tarefa.atribuida_a) continue;
          const { error: taskError } = await supabase.from("tarefa").update({
            status: "concluida",
            data_aprovacao: new Date().toISOString(),
          }).eq("id", tarefa.id);
          if (taskError) throw taskError;
          const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: tarefa.atribuida_a });
          const anterior = (saldoAtual as number) ?? 0;
          await supabase.from("transacao").insert({
            user_id: tarefa.atribuida_a,
            familia_id: profile!.familia_id,
            tipo: "ganho_tarefa",
            quantidade_moedas: tarefa.valor_moedas,
            saldo_anterior: anterior,
            saldo_posterior: anterior + tarefa.valor_moedas,
            referencia_id: tarefa.id,
            descricao: `Tarefa: ${tarefa.nome}`,
          });
          await supabase.from("profiles").update({ saldo_moedas: anterior + tarefa.valor_moedas }).eq("user_id", tarefa.atribuida_a);
          await salvarInteracao({ tarefaId: tarefa.id, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "concluida", mensagem: "", foto: null });
        } else {
          await supabase.from("tarefa").update({ status: "rejeitada" as StatusTarefa }).eq("id", tarefa.id);
          await salvarInteracao({ tarefaId: tarefa.id, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "rejeitada", mensagem: "", foto: null });
        }
      }
      return { count: eligible.length, skippedExtras: tasks.length - eligible.length };
    },
    onSuccess: (result, vars) => {
      invalidateAll();
      const action = vars.type === "aprovar" ? "aprovada" : "rejeitada";
      let msg = `${result.count} tarefa${result.count > 1 ? "s" : ""} ${action}${result.count > 1 ? "s" : ""}`;
      if (result.skippedExtras > 0) msg += ` (${result.skippedExtras} extra${result.skippedExtras > 1 ? "s" : ""} ignorada${result.skippedExtras > 1 ? "s" : ""} — precisa aprovar individualmente)`;
      toast({ title: vars.type === "aprovar" ? `${msg} 🎉` : msg });
    },
    onError: () => toast({ title: "Erro ao executar ação em lote", variant: "destructive" }),
  });

  const resetForm = () => {
    setSelectedTemplates([]);
    setSelectedCriancas(criancas.length === 1 ? [criancas[0].user_id] : []);
    setPeriodicidade("unica");
    setDiasSemana([]);
    setMesesReplicar("3");
    setFiltroDias("todos");
  };

  // Compromisso creation mutation
  const criarCompromisso = useMutation({
    mutationFn: async () => {
      if (!compNome || !compCriancaId) throw new Error("Dados incompletos");
      const dataHora = compDiaInteiro
        ? new Date(selectedDate!.getFullYear(), selectedDate!.getMonth(), selectedDate!.getDate(), 0, 0, 0).toISOString()
        : new Date(compDataHora).toISOString();
      const { error } = await supabase.from("compromisso").insert({
        familia_id: profile!.familia_id,
        crianca_id: compCriancaId,
        criado_por: profile!.user_id,
        nome: compNome,
        descricao: compDescricao || null,
        categoria: compCategoria as any,
        data_hora: dataHora,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Compromisso criado! 📌" });
      setCompDialogOpen(false);
      setCompNome("");
      setCompDescricao("");
      setCompCategoria("outro");
      setCompDiaInteiro(false);
      setCompDataHora("");
    },
    onError: (e) => toast({ title: "Erro ao criar compromisso", description: String(e), variant: "destructive" }),
  });

  const openCompDialog = (date: Date) => {
    setSelectedDate(date);
    setCompNome("");
    setCompDescricao("");
    setCompCategoria("outro");
    setCompDiaInteiro(false);
    setCompCriancaId(criancas.length === 1 ? criancas[0].user_id : "");
    const dateStr = format(date, "yyyy-MM-dd");
    setCompDataHora(`${dateStr}T08:00`);
    setCompDialogOpen(true);
  };

  // Deveres toggle mutation
  const toggleDeverMutation = useMutation({
    mutationFn: async ({ criancaId, regra, data, cumprida }: { criancaId: string; regra: string; data: string; cumprida: boolean }) => {
      const existing = (allCheckins ?? []).find(ck => ck.crianca_id === criancaId && ck.regra === regra && ck.data === data);
      if (existing) {
        const { error } = await supabase.from("regra_ouro_checkin").update({ cumprida }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("regra_ouro_checkin").insert({
          familia_id: profile!.familia_id,
          crianca_id: criancaId,
          regra,
          data,
          cumprida,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
    },
    onError: () => toast({ title: "Erro ao atualizar dever", variant: "destructive" }),
  });

  const openCreateOnDate = (date: Date) => {
    if (isBefore(date, startOfDay(new Date()))) {
      toast({ title: "Não é possível criar tarefas em datas passadas", variant: "destructive" });
      return;
    }
    setSelectedDate(date);
    resetForm();
    setTemplateSearch("");
    setTemplateCategoria("todas");
    setCreateDialogOpen(true);
  };

  const openDelete = (tarefa: Tarefa) => {
    setDeletingTarefa(tarefa);
    setDeleteScope("instancia");
    setDeleteDialogOpen(true);
  };

  // Get action buttons for each task
  const getActionButtons = (t: Tarefa) => {
    const effective = getEffectiveStatus(t);
    if (effective === "pendente_aprovacao") {
      return (
        <div className="flex items-center gap-1 shrink-0">
          {t.tarefa_extra ? (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openActionDialog("aprovar", t.id, t); }}>
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="h-7 w-7"
              disabled={actionMutation.isPending}
              onClick={(e) => { e.stopPropagation(); actionMutation.mutate({ action: { type: "aprovar", tarefaId: t.id, tarefa: t }, mensagem: "", foto: null }); }}>
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openActionDialog("comentar", t.id, t); }}>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openActionDialog("rejeitar", t.id, t); }}>
            <XCircle className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      );
    }
    if (effective === "dispensa_solicitada") {
      return (
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 text-xs px-1.5" onClick={(e) => { e.stopPropagation(); openActionDialog("aceitar_dispensa", t.id, t); }}>
            <CheckCircle2 className="h-3.5 w-3.5 text-primary mr-0.5" /> Aceitar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-1.5" onClick={(e) => { e.stopPropagation(); openActionDialog("negar_dispensa", t.id, t); }}>
            <XCircle className="h-3.5 w-3.5 text-destructive mr-0.5" /> Negar
          </Button>
        </div>
      );
    }
    if (effective === "concluida" || effective === "arquivada") {
      return (
        <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0 px-1.5" onClick={(e) => { e.stopPropagation(); openActionDialog("reverter_aprovacao", t.id, t); }}>
          <Undo2 className="h-3.5 w-3.5 mr-0.5" /> Reverter
        </Button>
      );
    }
    if (effective === "rejeitada") {
      return (
        <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0 px-1.5" onClick={(e) => { e.stopPropagation(); openActionDialog("reverter_rejeicao", t.id, t); }}>
          <Undo2 className="h-3.5 w-3.5 mr-0.5" /> Reverter
        </Button>
      );
    }
    if (effective === "a_fazer") {
      return (
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); openDelete(t); }}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      );
    }
    return null;
  };

  const dialogConfig: Record<string, { title: string; label: string; placeholder: string; btnLabel: string; btnVariant?: "destructive" | "default" }> = {
    aprovar: { title: "Aprovar Tarefa Extra ⭐", label: "Mensagem para a criança (opcional)", placeholder: "Parabéns! Muito bem...", btnLabel: "Aprovar" },
    rejeitar: { title: "Devolver Tarefa", label: "Mensagem para a criança (opcional)", placeholder: "Explique o motivo da devolução...", btnLabel: "Devolver", btnVariant: "destructive" },
    aceitar_dispensa: { title: "Aceitar Dispensa ✅", label: "Mensagem (opcional)", placeholder: "Tudo bem, entendo...", btnLabel: "Aceitar Dispensa" },
    negar_dispensa: { title: "Negar Dispensa", label: "Mensagem para a criança (opcional)", placeholder: "Explique por que a dispensa não foi aceita...", btnLabel: "Negar", btnVariant: "destructive" },
    reverter_aprovacao: { title: "Reverter Decisão ↩️", label: "Motivo da reversão (opcional)", placeholder: "Explique por que está revertendo...", btnLabel: "Reverter" },
    reverter_rejeicao: { title: "Reverter Rejeição ↩️", label: "Motivo da reversão (opcional)", placeholder: "Explique por que está revertendo...", btnLabel: "Reverter" },
    comentar: { title: "Enviar Comentário 💬", label: "Mensagem para a criança", placeholder: "Escreva um comentário...", btnLabel: "Enviar" },
  };

  const currentActionConfig = dialogAction ? dialogConfig[dialogAction.type] : null;

  // Count pending tasks for the badge
  const pendingCount = useMemo(() => {
    if (!tarefasMes) return 0;
    return tarefasMes.filter(t => t.status === "pendente_aprovacao" || t.status === "dispensa_solicitada").length;
  }, [tarefasMes]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Calendário de Tarefas 📅</h1>
          <p className="text-muted-foreground">Gerencie todas as tarefas pelo calendário</p>
        </motion.div>

        {/* View toggle + child filter on same line */}
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={calendarView} onValueChange={(v) => setCalendarView(v as CalendarViewType)}>
            <TabsList className="h-9">
              <TabsTrigger value="hoje" className="text-xs px-2.5">Hoje</TabsTrigger>
              <TabsTrigger value="semanal" className="text-xs px-2.5">Semana</TabsTrigger>
              <TabsTrigger value="quinzenal_view" className="text-xs px-2.5">15 dias</TabsTrigger>
              <TabsTrigger value="mensal" className="text-xs px-2.5">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
          {criancas && criancas.length > 0 && (
            <Select value={filtroCrianca} onValueChange={setFiltroCrianca}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Criança" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {criancas.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Calendar navigation */}
        {(calendarView === "semanal" || calendarView === "mensal") && (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => calendarView === "semanal" ? setCurrentWeekStart(subWeeks(currentWeekStart, 1)) : setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="font-display text-base font-semibold capitalize">
              {calendarView === "semanal"
                ? `${format(currentWeekStart, "dd MMM", { locale: ptBR })} – ${format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), "dd MMM yyyy", { locale: ptBR })}`
                : format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </h2>
            <Button variant="outline" size="sm" onClick={() => calendarView === "semanal" ? setCurrentWeekStart(addWeeks(currentWeekStart, 1)) : setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Calendar Grid - only for semanal and mensal */}
        {calendarView !== "hoje" && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="grid grid-cols-7">
                {diasSemanaLabelCalendar.map(d => (
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
                  const hasPending = dayTasks.some(t => t.status === "pendente_aprovacao" || t.status === "dispensa_solicitada");

                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedDate(day)}
                      className={`cursor-pointer border-b border-r p-1.5 transition-colors hover:bg-muted/30 ${calendarView === "semanal" ? "min-h-[120px]" : "min-h-[80px]"} ${
                        isSelected ? "bg-primary/10 ring-2 ring-primary ring-inset" : ""
                      } ${today ? "bg-accent/10" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold mb-1 ${today ? "text-primary" : "text-foreground"}`}>
                          {format(day, "d")}
                        </span>
                        {hasPending && (
                          <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {dayTasks.slice(0, calendarView === "semanal" ? 6 : 3).map(t => (
                          <div
                            key={t.id}
                            className={`truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${
                              t.status === "concluida" ? "bg-accent/20 text-accent-foreground" :
                              t.status === "pendente_aprovacao" || t.status === "dispensa_solicitada" ? "bg-yellow-500/20 text-yellow-700" :
                              t.status === "rejeitada" ? "bg-destructive/20 text-destructive" :
                              t.status === "arquivada" ? "bg-muted text-muted-foreground" :
                              "bg-primary/10 text-primary"
                            }`}
                          >
                            {categoriasEmoji[t.categoria]} {t.nome}
                          </div>
                        ))}
                        {dayTasks.length > (calendarView === "semanal" ? 6 : 3) && (
                          <div className="text-[10px] text-muted-foreground">+{dayTasks.length - (calendarView === "semanal" ? 6 : 3)} mais</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selected day detail - for "hoje" view, show both days inline */}
        {calendarView === "hoje" ? (
          calendarDays.days.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = (tasksByDate.get(key) ?? []).filter(t => {
              const matchSearch = !taskListSearch || t.nome.toLowerCase().includes(taskListSearch.toLowerCase()) || (t.descricao ?? "").toLowerCase().includes(taskListSearch.toLowerCase());
              const matchCategoria = taskListCategoria === "todas" || t.categoria === taskListCategoria;
              const effective = getEffectiveStatus(t);
              const matchStatus = urlStatusFilters.length > 0
                ? urlStatusFilters.includes(effective)
                : taskListStatus === "todos" || effective === taskListStatus;
              return matchSearch && matchCategoria && matchStatus;
            });
            const isPast = isBefore(day, startOfDay(new Date()));
            return (
              <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <div>
                        <h3 className="font-display font-semibold capitalize">
                          {isToday(day) ? "Hoje" : "Amanhã"} — {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
                        </h3>
                        {filtroCrianca !== "todos" && (
                          <p className="text-sm text-muted-foreground">{getCriancaNome(filtroCrianca)}</p>
                        )}
                      </div>
                      {!isPast && (
                        <Button size="sm" onClick={() => openCreateOnDate(day)}>
                          <Plus className="h-4 w-4" /> Adicionar
                        </Button>
                      )}
                    </div>

                    {/* Filters for the day's tasks - status next to category on mobile */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Select value={taskListStatus} onValueChange={(v) => setTaskListStatus(v as StatusFiltro)}>
                        <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos status</SelectItem>
                          <SelectItem value="a_fazer">A fazer</SelectItem>
                          <SelectItem value="nao_feita">Não feita</SelectItem>
                          <SelectItem value="pendente_aprovacao">Em validação</SelectItem>
                          <SelectItem value="concluida">Concluída</SelectItem>
                          <SelectItem value="rejeitada">Rejeitada</SelectItem>
                          <SelectItem value="dispensa_solicitada">Dispensa</SelectItem>
                          <SelectItem value="arquivada">Dispensada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={taskListCategoria} onValueChange={setTaskListCategoria}>
                        <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Categorias</SelectItem>
                          {Object.entries(categoriasLabel).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{categoriasEmoji[k]} {label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative flex-1 min-w-[120px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar..." value={taskListSearch} onChange={e => setTaskListSearch(e.target.value)} className="pl-9 h-9 text-xs" />
                      </div>
                    </div>

                    {dayTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa neste dia.</p>
                    ) : (
                      <div className="space-y-2">
                        {dayTasks.map(tarefa => renderTaskCard(tarefa))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        ) : selectedDate && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="font-display font-semibold">
                      {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </h3>
                    {filtroCrianca !== "todos" && (
                      <p className="text-sm text-muted-foreground">
                        {getCriancaNome(filtroCrianca)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {!isBefore(selectedDate, startOfDay(new Date())) && (
                      <Button size="sm" onClick={() => openCreateOnDate(selectedDate)}>
                        <Plus className="h-4 w-4" /> Tarefa
                      </Button>
                    )}
                  </div>
                </div>

                <Tabs value={calendarDayTab} onValueChange={(v) => setCalendarDayTab(v as any)}>
                  <TabsList className="w-full mb-3">
                    <TabsTrigger value="tarefas" className="flex-1 gap-1 text-xs">
                      ✅ Tarefas
                      {selectedDateTasks.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{selectedDateTasks.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="compromissos" className="flex-1 gap-1 text-xs">
                      📌 Compromissos
                      {(() => {
                        const dateStr = format(selectedDate, "yyyy-MM-dd");
                        const comps = (compromissosFamilia ?? []).filter(c => {
                          const cDate = format(new Date(c.data_hora), "yyyy-MM-dd");
                          const matchChild = filtroCrianca === "todos" || c.crianca_id === filtroCrianca;
                          return cDate === dateStr && matchChild;
                        });
                        return comps.length > 0 ? <Badge variant="secondary" className="text-[10px] ml-1">{comps.length}</Badge> : null;
                      })()}
                    </TabsTrigger>
                    <TabsTrigger value="deveres" className="flex-1 gap-1 text-xs">
                      🛡️ Deveres
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="tarefas" className="space-y-2 mt-0">
                    {/* Filters for the day's tasks */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Select value={taskListStatus} onValueChange={(v) => setTaskListStatus(v as StatusFiltro)}>
                        <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos status</SelectItem>
                          <SelectItem value="a_fazer">A fazer</SelectItem>
                          <SelectItem value="nao_feita">Não feita</SelectItem>
                          <SelectItem value="pendente_aprovacao">Em validação</SelectItem>
                          <SelectItem value="concluida">Concluída</SelectItem>
                          <SelectItem value="rejeitada">Rejeitada</SelectItem>
                          <SelectItem value="dispensa_solicitada">Dispensa</SelectItem>
                          <SelectItem value="arquivada">Dispensada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={taskListCategoria} onValueChange={setTaskListCategoria}>
                        <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Categorias</SelectItem>
                          {Object.entries(categoriasLabel).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{categoriasEmoji[k]} {label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative flex-1 min-w-[120px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar..." value={taskListSearch} onChange={e => setTaskListSearch(e.target.value)} className="pl-9 h-9 text-xs" />
                      </div>
                    </div>

                    {/* Batch action buttons */}
                    {(() => {
                      const pendingTasks = selectedDateTasks.filter(t => getEffectiveStatus(t) === "pendente_aprovacao");
                      if (pendingTasks.length > 1) {
                        const allPendingSelected = pendingTasks.every(t => batchSelected.has(t.id));
                        return (
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <Button size="sm" variant="outline" className="text-xs"
                              onClick={() => {
                                const newSet = new Set(batchSelected);
                                if (allPendingSelected) pendingTasks.forEach(t => newSet.delete(t.id));
                                else pendingTasks.forEach(t => newSet.add(t.id));
                                setBatchSelected(newSet);
                              }}>
                              {allPendingSelected ? "Desmarcar todos" : `Selecionar ${pendingTasks.length} pendentes`}
                            </Button>
                            {batchSelected.size > 0 && (
                              <>
                                <Button size="sm" className="text-xs" disabled={batchActionMutation.isPending} onClick={() => batchActionMutation.mutate({ type: "aprovar" })}>
                                  {batchActionMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                  Aprovar {batchSelected.size}
                                </Button>
                                <Button size="sm" variant="destructive" className="text-xs" disabled={batchActionMutation.isPending} onClick={() => batchActionMutation.mutate({ type: "rejeitar" })}>
                                  <XCircle className="h-3 w-3 mr-1" /> Rejeitar {batchSelected.size}
                                </Button>
                              </>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {selectedDateTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa neste dia.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedDateTasks.map(tarefa => renderTaskCard(tarefa))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="compromissos" className="space-y-2 mt-0">
                    {(() => {
                      const dateStr = format(selectedDate, "yyyy-MM-dd");
                      const dayComps = (compromissosFamilia ?? []).filter(c => {
                        const cDate = format(new Date(c.data_hora), "yyyy-MM-dd");
                        const matchChild = filtroCrianca === "todos" || c.crianca_id === filtroCrianca;
                        return cDate === dateStr && matchChild;
                      });
                      if (dayComps.length === 0) {
                        return <p className="text-sm text-muted-foreground text-center py-4">Nenhum compromisso neste dia.</p>;
                      }
                      const catConfig: Record<string, { label: string; emoji: string }> = {
                        prova: { label: "Prova", emoji: "📝" },
                        medico: { label: "Médico", emoji: "🏥" },
                        esporte: { label: "Esporte", emoji: "⚽" },
                        pessoal: { label: "Pessoal", emoji: "👤" },
                        outro: { label: "Outro", emoji: "📌" },
                      };
                      return dayComps.map(c => {
                        const cat = catConfig[c.categoria] ?? catConfig.outro;
                        const dt = new Date(c.data_hora);
                        const isDiaInteiro = format(dt, "HH:mm") === "00:00";
                        return (
                          <Card key={c.id} className={`border-2 ${c.concluido ? "border-muted bg-muted/30 opacity-70" : "border-border"}`}>
                            <CardContent className="py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{cat.emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold truncate ${c.concluido ? "line-through text-muted-foreground" : ""}`}>{c.nome}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                    <span>{isDiaInteiro ? "Dia inteiro" : format(dt, "HH:mm")}</span>
                                    <Badge variant="outline" className="text-[10px]">{cat.label}</Badge>
                                    <span>{getCriancaNome(c.crianca_id)}</span>
                                    {c.concluido && <Badge variant="default" className="text-[10px]">Concluído</Badge>}
                                  </div>
                                  {c.descricao && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.descricao}</p>}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      });
                    })()}
                  </TabsContent>

                  <TabsContent value="deveres" className="space-y-2 mt-0">
                    {(() => {
                      const dateStr = format(selectedDate, "yyyy-MM-dd");
                      const relevantConfigs = (configsFamilia ?? []).filter(cfg => {
                        const matchChild = filtroCrianca === "todos" || cfg.crianca_id === filtroCrianca;
                        return matchChild && (cfg.regras_ouro ?? []).length > 0;
                      });
                      if (relevantConfigs.length === 0) {
                        return <p className="text-sm text-muted-foreground text-center py-4">Nenhum dever configurado.</p>;
                      }
                      return relevantConfigs.map(cfg => {
                        const regras = (cfg.regras_ouro ?? []).filter(r => !(cfg.regras_ouro_inativas ?? []).includes(r));
                        if (regras.length === 0) return null;
                        const checkins = (allCheckins ?? []).filter(ck => ck.crianca_id === cfg.crianca_id && ck.data === dateStr);
                        const cumpridos = regras.filter(r => checkins.some(ck => ck.regra === r && ck.cumprida)).length;
                        return (
                          <div key={cfg.crianca_id} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">{getCriancaNome(cfg.crianca_id)}</p>
                              <Badge variant={cumpridos === regras.length ? "default" : "secondary"} className="text-xs">
                                {cumpridos}/{regras.length} cumpridos
                              </Badge>
                            </div>
                            {regras.map(regra => {
                              const cumprida = checkins.some(ck => ck.regra === regra && ck.cumprida);
                              return (
                                <Card key={regra} className={`border ${cumprida ? "border-primary/30 bg-primary/5" : "border-muted"}`}>
                                  <CardContent className="py-2 flex items-center gap-3">
                                    <div className={`flex h-6 w-6 items-center justify-center rounded-full shrink-0 ${cumprida ? "bg-primary/10" : "bg-muted"}`}>
                                      {cumprida ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                                    </div>
                                    <p className={`flex-1 text-sm ${cumprida ? "text-foreground" : "text-muted-foreground"}`}>{regra}</p>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        );
                      });
                    })()}
                  </TabsContent>
                </Tabs>
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
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar modelo..." value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} className="pl-9" />
                      </div>
                      <Select value={templateCategoria} onValueChange={setTemplateCategoria}>
                        <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas</SelectItem>
                          {Object.entries(categoriasLabel).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{categoriasEmoji[key]} {label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-md border p-2">
                      {filteredTemplates.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">Nenhum modelo encontrado</p>
                      ) : (
                        filteredTemplates.map(t => (
                          <label key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                            <Checkbox
                              checked={selectedTemplates.includes(t.id)}
                              onCheckedChange={(checked) => {
                                setSelectedTemplates(prev =>
                                  checked ? [...prev, t.id] : prev.filter(id => id !== t.id)
                                );
                              }}
                            />
                            <span className="truncate">{categoriasEmoji[t.categoria]} {t.nome}</span>
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">{t.valor_moedas} 🪙</span>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedTemplates.length > 0 && (
                      <p className="text-xs text-muted-foreground">{selectedTemplates.length} modelo{selectedTemplates.length > 1 ? "s" : ""} selecionado{selectedTemplates.length > 1 ? "s" : ""}</p>
                    )}
                  </div>
                )}
              </div>

              {criancas.length > 0 && (
                <div>
                  <Label>Atribuir para</Label>
                  <div className="space-y-1 mt-1">
                    {criancas.map(c => (
                      <label key={c.user_id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                        <Checkbox
                          checked={selectedCriancas.includes(c.user_id)}
                          onCheckedChange={(checked) => {
                            setSelectedCriancas(prev =>
                              checked ? [...prev, c.user_id] : prev.filter(id => id !== c.user_id)
                            );
                          }}
                        />
                        {c.nome}
                      </label>
                    ))}
                  </div>
                </div>
              )}

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

              {(periodicidade === "semanal" || periodicidade === "quinzenal") && (
                <div>
                  <Label>Dias da semana</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {diasSemanaLabel.map((d, i) => (
                      <Button
                        key={i}
                        size="sm"
                        variant={diasSemana.includes(i) ? "default" : "outline"}
                        className="w-10 h-10"
                        onClick={() => {
                          setDiasSemana(prev =>
                            prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                          );
                        }}
                      >
                        {d}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {periodicidade !== "unica" && (
                <>
                  <div>
                    <Label>Replicar por (meses)</Label>
                    <Select value={mesesReplicar} onValueChange={setMesesReplicar}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 6, 12].map(m => (
                          <SelectItem key={m} value={String(m)}>{m} {m === 1 ? "mês" : "meses"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {periodicidade === "diaria" && (
                    <div>
                      <Label>Dias de replicação</Label>
                      <RadioGroup value={filtroDias} onValueChange={(v) => setFiltroDias(v as FiltroDias)} className="mt-1">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="todos" id="todos" /><Label htmlFor="todos">Todos os dias</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="uteis" id="uteis" /><Label htmlFor="uteis">Dias úteis</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="nao_uteis" id="nao_uteis" /><Label htmlFor="nao_uteis">Finais de semana</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleCriarTarefas}
                disabled={!selectedTemplates.length || !selectedCriancas.length || executeCriarTarefas.isPending}
              >
                {executeCriarTarefas.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Tarefas"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Duplicates Dialog */}
        <Dialog open={confirmDuplicateOpen} onOpenChange={setConfirmDuplicateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Tarefas duplicadas encontradas</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">As seguintes tarefas já existem nesta data:</p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {duplicateDetails.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
              <p className="text-sm font-medium">Deseja criar mesmo assim?</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDuplicateOpen(false)}>Cancelar</Button>
              <Button onClick={() => executeCriarTarefas.mutate()} disabled={executeCriarTarefas.isPending}>
                {executeCriarTarefas.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar mesmo assim"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Task Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(o) => { if (!o) { setDeleteDialogOpen(false); setDeletingTarefa(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Remover Tarefa</DialogTitle>
            </DialogHeader>
            {deletingTarefa && (
              <div className="space-y-4">
                <p className="text-sm">
                  <strong>{deletingTarefa.nome}</strong> — {deletingTarefa.data_prevista && format(new Date(deletingTarefa.data_prevista + "T12:00:00"), "dd/MM/yyyy")}
                </p>
                {deletingTarefa.tarefa_recorrente_id && (
                  <RadioGroup value={deleteScope} onValueChange={(v) => setDeleteScope(v as "instancia" | "serie")}>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="instancia" id="instancia" />
                      <Label htmlFor="instancia">Apenas esta instância</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="serie" id="serie" />
                      <Label htmlFor="serie">Esta e todas futuras (a fazer)</Label>
                    </div>
                  </RadioGroup>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingTarefa(null); }}>Cancelar</Button>
              <Button variant="destructive" onClick={() => deletarTarefa.mutate()} disabled={deletarTarefa.isPending}>
                {deletarTarefa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Action Dialog */}
        <Dialog open={!!dialogAction} onOpenChange={(o) => { if (!o) closeActionDialog(); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            {currentActionConfig && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display">{currentActionConfig.title}</DialogTitle>
                </DialogHeader>

                {dialogAction?.type === "aprovar" && dialogAction.tarefa?.tarefa_extra && (
                  <div className="space-y-3 rounded-lg border-2 border-accent/30 bg-accent/5 p-3">
                    <p className="text-xs font-semibold flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Tarefa Extra — defina a categoria e moedas</p>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{dialogAction.tarefa.nome}</p>
                      {dialogAction.tarefa.descricao && <p className="text-xs text-muted-foreground">{dialogAction.tarefa.descricao}</p>}
                      {dialogAction.tarefa.justificativa && <p className="text-xs italic text-foreground/70">📝 "{dialogAction.tarefa.justificativa}"</p>}
                      <p className="text-xs text-muted-foreground">Por: {getCriancaNome(dialogAction.tarefa.atribuida_a)}</p>
                    </div>
                    <div>
                      <Label>Categoria</Label>
                      <Select value={extraCategoria} onValueChange={setExtraCategoria}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(categoriasLabel).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{categoriasEmoji[k]} {v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Moedas</Label>
                      <Input type="number" min="0" value={extraMoedas} onChange={e => setExtraMoedas(e.target.value)} />
                    </div>
                  </div>
                )}

                <InteracaoInput
                  label={currentActionConfig.label}
                  placeholder={currentActionConfig.placeholder}
                  mensagem={dialogMensagem}
                  onMensagemChange={setDialogMensagem}
                  foto={dialogFoto}
                  onFotoChange={setDialogFoto}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={closeActionDialog}>Cancelar</Button>
                  <Button
                    variant={currentActionConfig.btnVariant ?? "default"}
                    onClick={() => {
                      if (!dialogAction) return;
                      const isExtraApproval = dialogAction.type === "aprovar" && dialogAction.tarefa?.tarefa_extra;
                      actionMutation.mutate({
                        action: dialogAction,
                        mensagem: dialogMensagem,
                        foto: dialogFoto,
                        extraEdit: isExtraApproval ? { categoria: extraCategoria, valor_moedas: parseInt(extraMoedas) || 0 } : undefined,
                      });
                    }}
                    disabled={actionMutation.isPending}
                  >
                    {actionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : currentActionConfig.btnLabel}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Task Detail Sheet */}
        <TarefaHistoricoSheet
          tarefa={selectedTarefa}
          onClose={() => setSelectedTarefa(null)}
          getNomeUsuario={(userId) => {
            if (!userId) return "Sem atribuição";
            const member = membrosAll?.find(m => m.user_id === userId);
            return member?.nome ?? "Usuário";
          }}
        />
      </div>
    </AppLayout>
  );

  // Render task card helper - mobile-optimized layout
  function renderTaskCard(tarefa: Tarefa) {
    const effective = getEffectiveStatus(tarefa);
    const cfg = statusConfig[effective] ?? statusConfig.a_fazer;
    const isPending = effective === "pendente_aprovacao";
    const isChecked = batchSelected.has(tarefa.id);
    return (
      <div key={tarefa.id} className="rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedTarefa(tarefa)}>
        <div className="flex items-start gap-2">
          {isPending && selectedDateTasks.filter(t => getEffectiveStatus(t) === "pendente_aprovacao").length > 1 && (
            <Checkbox
              checked={isChecked}
              onCheckedChange={(checked) => {
                const newSet = new Set(batchSelected);
                if (checked) newSet.add(tarefa.id);
                else newSet.delete(tarefa.id);
                setBatchSelected(newSet);
              }}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 mt-1"
            />
          )}
          <div className="flex-1 min-w-0">
            {/* Line 1: emoji + name */}
            <p className="font-medium text-sm truncate">
              {categoriasEmoji[tarefa.categoria] ?? "⭐"} {tarefa.nome}
            </p>
            {/* Line 2: coins + child + recurrence icon */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                <Coins className="h-3 w-3 text-coin" /> {tarefa.valor_moedas}
              </span>
              <span>→ {getCriancaNome(tarefa.atribuida_a)}</span>
              {tarefa.tarefa_recorrente_id && <CalendarClock className="h-3 w-3" />}
            </div>
            {/* Line 3: badges */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {tarefa.tarefa_extra && (
                <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground bg-accent/20">
                  <Star className="h-2.5 w-2.5 mr-0.5" />Extra
                </Badge>
              )}
              <Badge variant={cfg.badgeVariant} className="text-[10px]">
                {cfg.label}
              </Badge>
            </div>
            {tarefa.justificativa && (
              <p className="text-xs italic text-foreground/70 mt-0.5">📝 "{tarefa.justificativa}"</p>
            )}
            {tarefa.comentario_responsavel && effective === "rejeitada" && (
              <p className="text-xs text-destructive italic mt-0.5">💬 "{tarefa.comentario_responsavel}"</p>
            )}
          </div>
          <div className="shrink-0">
            {getActionButtons(tarefa)}
          </div>
        </div>
      </div>
    );
  }
}
