import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TarefaHistoricoSheet } from "@/components/TarefaHistoricoSheet";
import { InteracaoInput } from "@/components/InteracaoInput";
import { salvarInteracao } from "@/lib/interacao";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import {
  CalendarDays, Plus, Loader2, Check, Trash2, Edit, BookOpen,
  Stethoscope, Dumbbell, User, MoreHorizontal, CalendarIcon, Clock,
  Coins, CheckCircle2, AlertTriangle, MessageSquare, Shield, Search,
  XCircle, Square, CheckSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  format, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, isSameDay, parseISO, isBefore,
  eachDayOfInterval, getDay, isToday, isFuture,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRegrasOuroStatus } from "@/hooks/useRegrasOuroStatus";
import type { Tables } from "@/integrations/supabase/types";

type CategoriaCompromisso = "prova" | "medico" | "esporte" | "pessoal" | "outro";
type Tarefa = Tables<"tarefa">;
type FiltroPeriodo = "hoje" | "semana" | "mes" | "15dias";

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

const statusTarefaLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  a_fazer: { label: "A Fazer", variant: "outline", className: "border-blue-400 text-blue-700 dark:text-blue-400" },
  pendente_aprovacao: { label: "Em validação", variant: "secondary", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300" },
  concluida: { label: "Concluída", variant: "default", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-300" },
  rejeitada: { label: "Devolvida", variant: "destructive", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-300" },
  dispensa_solicitada: { label: "Dispensa solicitada", variant: "secondary", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300" },
  arquivada: { label: "Dispensada", variant: "outline", className: "border-muted-foreground/50 text-muted-foreground" },
};

const periodoLabels: Record<FiltroPeriodo, string> = {
  hoje: "Hoje",
  semana: "Semana",
  mes: "Mês",
  "15dias": "15 dias",
};

const dayNames = ["D", "S", "T", "Q", "Q", "S", "S"];

type DayTab = "compromissos" | "tarefas" | "deveres";
type FiltroSituacaoCompromisso = "todos" | "pendentes" | "concluidos";
type FiltroSituacaoTarefa = "todos" | "a_fazer" | "em_validacao" | "concluidas";

export default function MeusCompromissos() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("semana");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dayTab, setDayTab] = useState<DayTab>("compromissos");

  // Compromisso filters
  const [filtroSitComp, setFiltroSitComp] = useState<FiltroSituacaoCompromisso>("todos");
  // Tarefa filters
  const [filtroSitTarefa, setFiltroSitTarefa] = useState<FiltroSituacaoTarefa>("todos");

  // Compromisso dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<CategoriaCompromisso>("outro");
  const [dataCompromisso, setDataCompromisso] = useState<Date>(new Date());
  const [hora, setHora] = useState("08:00");
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Tarefa dialog states
  const [comentarTarefaId, setComentarTarefaId] = useState<string | null>(null);
  const [mensagemComentario, setMensagemComentario] = useState("");
  const [fotoComentario, setFotoComentario] = useState<File | null>(null);
  const [dispensaTarefaId, setDispensaTarefaId] = useState<string | null>(null);
  const [justificativaDispensa, setJustificativaDispensa] = useState("");
  const [fotoDispensa, setFotoDispensa] = useState<File | null>(null);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successEmoji, setSuccessEmoji] = useState("✅");
  const [successMessage, setSuccessMessage] = useState("");

  // Extra task
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  const [extraNome, setExtraNome] = useState("");
  const [extraDescricao, setExtraDescricao] = useState("");
  const [extraMensagem, setExtraMensagem] = useState("");
  const [extraFoto, setExtraFoto] = useState<File | null>(null);
  const [extraSelectedTemplate, setExtraSelectedTemplate] = useState<string>("__novo__");

  // Deveres (regras de ouro)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { regrasOuro, hasRules } = useRegrasOuroStatus(profile?.user_id, profile?.familia_id);

  const { data: temContratoVigente } = useQuery({
    queryKey: ["contrato-vigente-crianca", profile?.familia_id, profile?.user_id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contrato_versao")
        .select("id", { count: "exact", head: true })
        .eq("familia_id", profile!.familia_id)
        .eq("crianca_id", profile!.user_id)
        .eq("status", "vigente");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!profile,
  });

  const contratoAtivo = temContratoVigente === true;
  const deveresAtivos = contratoAtivo && hasRules;

  // Fetch all checkins for the visible period (for calendar coloring)
  const { data: allCheckins } = useQuery({
    queryKey: ["regra-ouro-checkins-all", profile?.user_id, profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("data, cumprida, regra")
        .eq("crianca_id", profile!.user_id)
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Today's checkins for deveres tab
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: checkinsForDate } = useQuery({
    queryKey: ["regra-ouro-checkin", profile?.user_id, selectedDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("*")
        .eq("crianca_id", profile!.user_id)
        .eq("familia_id", profile!.familia_id)
        .eq("data", selectedDateStr);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const checkinMap = new Map((checkinsForDate ?? []).map((c) => [c.regra, c]));

  const resetForm = () => {
    setNome(""); setDescricao(""); setCategoria("outro");
    setDataCompromisso(new Date()); setHora("08:00"); setDiaInteiro(false); setEditingId(null);
  };
  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (c: Compromisso) => {
    setEditingId(c.id); setNome(c.nome); setDescricao(c.descricao ?? "");
    setCategoria(c.categoria);
    const dt = parseISO(c.data_hora);
    setDataCompromisso(dt);
    const timeStr = format(dt, "HH:mm");
    const isDia = timeStr === "00:00";
    setDiaInteiro(isDia); setHora(isDia ? "08:00" : timeStr);
    setDialogOpen(true);
  };

  // Fetch compromissos
  const { data: compromissos, isLoading: loadingCompromissos } = useQuery({
    queryKey: ["compromissos", profile?.user_id, profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compromisso").select("*")
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
        .from("tarefa").select("*")
        .eq("atribuida_a", profile!.user_id)
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  // Templates for extra task
  const { data: templates } = useQuery({
    queryKey: ["tarefa-padrao", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tarefa_padrao").select("*").eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const isLoading = loadingCompromissos || loadingTarefas;

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile || !nome.trim()) throw new Error("Nome obrigatório");
      const dt = new Date(dataCompromisso);
      if (diaInteiro) { dt.setHours(0, 0, 0, 0); } else { const [h, m] = hora.split(":").map(Number); dt.setHours(h, m, 0, 0); }
      if (editingId) {
        const { error } = await supabase.from("compromisso")
          .update({ nome: nome.trim(), descricao: descricao.trim() || null, categoria, data_hora: dt.toISOString() })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("compromisso").insert({
          familia_id: profile.familia_id, crianca_id: profile.user_id, criado_por: profile.user_id,
          nome: nome.trim(), descricao: descricao.trim() || null, categoria, data_hora: dt.toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      toast({ title: editingId ? "Compromisso atualizado! ✏️" : "Compromisso criado! 📌" });
      setDialogOpen(false); resetForm();
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["compromissos"] }); toast({ title: "Compromisso excluído 🗑️" }); },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  // Tarefa mutations
  const concluirMutation = useMutation({
    mutationFn: async (tarefaId: string) => {
      const tarefa = tarefas?.find(t => t.id === tarefaId);
      const statusAnterior = tarefa?.status ?? "a_fazer";
      const { error } = await supabase.from("tarefa")
        .update({ status: "pendente_aprovacao" as any, data_conclusao: new Date().toISOString() })
        .eq("id", tarefaId);
      if (error) throw error;
      await salvarInteracao({
        tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id,
        statusAnterior, statusNovo: "pendente_aprovacao", mensagem: "", foto: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["crianca-stats"] });
      setSuccessEmoji("🎉"); setSuccessMessage("Tarefa concluída!"); setShowSuccess(true);
      toast({ title: "Tarefa concluída! 🎉" });
    },
    onError: () => toast({ title: "Erro ao concluir", variant: "destructive" }),
  });

  const comentarMutation = useMutation({
    mutationFn: async ({ tarefaId, mensagem, foto }: { tarefaId: string; mensagem: string; foto: File | null }) => {
      const tarefa = tarefas?.find(t => t.id === tarefaId);
      if (!tarefa) throw new Error("Tarefa não encontrada");
      const { error } = await supabase.from("tarefa").update({ justificativa: mensagem || null }).eq("id", tarefaId);
      if (error) throw error;
      await salvarInteracao({
        tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id,
        statusAnterior: tarefa.status, statusNovo: tarefa.status, mensagem, foto,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-tarefas"] });
      toast({ title: "Comentário enviado! 💬" });
      setComentarTarefaId(null); setMensagemComentario(""); setFotoComentario(null);
    },
    onError: () => toast({ title: "Erro ao enviar comentário", variant: "destructive" }),
  });

  const dispensaMutation = useMutation({
    mutationFn: async ({ tarefaId, justificativa, foto }: { tarefaId: string; justificativa: string; foto: File | null }) => {
      const { error } = await supabase.from("tarefa")
        .update({ status: "dispensa_solicitada" as any, justificativa })
        .eq("id", tarefaId);
      if (error) throw error;
      await salvarInteracao({
        tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id,
        statusAnterior: "a_fazer", statusNovo: "dispensa_solicitada", mensagem: justificativa, foto,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-tarefas"] });
      setSuccessEmoji("🙏"); setSuccessMessage("Pedido de dispensa enviado!"); setShowSuccess(true);
      toast({ title: "Pedido enviado! 🙏" });
      setDispensaTarefaId(null); setJustificativaDispensa(""); setFotoDispensa(null);
    },
    onError: () => toast({ title: "Erro ao pedir dispensa", variant: "destructive" }),
  });

  const criarTarefaExtra = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Sem perfil");
      const isTemplate = extraSelectedTemplate !== "__novo__";
      const template = isTemplate ? templates?.find(t => t.id === extraSelectedTemplate) : null;
      const n = isTemplate && template ? template.nome : extraNome.trim();
      if (!n) throw new Error("Nome obrigatório");
      const tarefaData = {
        nome: n,
        descricao: isTemplate && template ? template.descricao : (extraDescricao.trim() || null),
        categoria: (isTemplate && template ? template.categoria : "outros") as any,
        valor_moedas: isTemplate && template ? template.valor_moedas : 0,
        atribuida_a: profile.user_id, familia_id: profile.familia_id, criada_por: profile.user_id,
        data_prevista: format(new Date(), "yyyy-MM-dd"),
        status: "pendente_aprovacao" as const, data_conclusao: new Date().toISOString(), tarefa_extra: true,
        justificativa: extraMensagem.trim() || null,
      };
      const { data: novaTarefa, error } = await supabase.from("tarefa").insert(tarefaData).select("id").single();
      if (error) throw error;
      await salvarInteracao({
        tarefaId: novaTarefa.id, familiaId: profile.familia_id, userId: profile.user_id,
        statusAnterior: null, statusNovo: "pendente_aprovacao",
        mensagem: extraMensagem.trim() || `Tarefa extra: ${n}`, foto: extraFoto,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      setSuccessEmoji("⭐"); setSuccessMessage("Tarefa extra enviada!"); setShowSuccess(true);
      toast({ title: "Tarefa extra enviada! ⭐" });
      setExtraDialogOpen(false);
      setExtraNome(""); setExtraDescricao(""); setExtraMensagem(""); setExtraFoto(null); setExtraSelectedTemplate("__novo__");
    },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  // Deveres toggle
  const toggleDever = useMutation({
    mutationFn: async ({ regra, cumprida }: { regra: string; cumprida: boolean }) => {
      const existing = checkinMap.get(regra);
      if (existing) {
        const { error } = await supabase.from("regra_ouro_checkin").update({ cumprida }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("regra_ouro_checkin").insert({
          crianca_id: profile!.user_id, familia_id: profile!.familia_id, data: selectedDateStr, regra, cumprida,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regra-ouro-checkin"] });
      queryClient.invalidateQueries({ queryKey: ["regra-ouro-checkins-all"] });
    },
    onError: () => toast({ title: "Erro ao atualizar dever", variant: "destructive" }),
  });

  // Date range
  const dateRange = useMemo(() => {
    const now = new Date();
    if (filtroPeriodo === "hoje") return { start: startOfDay(now), end: endOfDay(now) };
    if (filtroPeriodo === "semana") return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    if (filtroPeriodo === "mes") return { start: startOfMonth(now), end: endOfMonth(now) };
    return { start: startOfDay(now), end: endOfDay(addDays(now, 14)) };
  }, [filtroPeriodo]);

  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    const firstDay = getDay(days[0]);
    const padding: (Date | null)[] = Array(firstDay).fill(null);
    return [...padding, ...days];
  }, [dateRange]);

  // Helpers
  const getCompromissosForDay = (day: Date) =>
    (compromissos ?? []).filter(c => isSameDay(parseISO(c.data_hora), day));
  const getTarefasForDay = (day: Date) =>
    (tarefas ?? []).filter(t => t.data_prevista && isSameDay(new Date(t.data_prevista + "T12:00:00"), day));

  // Day completion status for calendar coloring
  const getDayCompletionStatus = (day: Date): "complete" | "incomplete" | "future" | "neutral" => {
    if (isFuture(startOfDay(day)) && !isToday(day)) return "future";
    const dayStr = format(day, "yyyy-MM-dd");

    const dayCompromissos = getCompromissosForDay(day);
    const dayTarefas = getTarefasForDay(day);

    // Check deveres for this day — deveres ativos count even without checkins (unchecked = not done)
    const dayCheckins = (allCheckins ?? []).filter(c => c.data === dayStr);
    const deveresForDay = deveresAtivos ? regrasOuro : [];
    const deveresCumpridos = deveresForDay.length > 0
      ? deveresForDay.every(r => dayCheckins.some(c => c.regra === r && c.cumprida))
      : true;

    const compromissosCumpridos = dayCompromissos.length > 0
      ? dayCompromissos.every(c => c.concluido)
      : true;

    const tarefasCumpridas = dayTarefas.length > 0
      ? dayTarefas.every(t => ["concluida", "arquivada"].includes(t.status))
      : true;

    // Days with active deveres always have "something" even without checkins
    const hasAnything = dayCompromissos.length > 0 || dayTarefas.length > 0 || deveresForDay.length > 0;

    if (!hasAnything) return "neutral";
    if (compromissosCumpridos && tarefasCumpridas && deveresCumpridos) return "complete";
    
    // Anything not fully complete on a past/today day is incomplete (pink)
    return "incomplete";
  };

  // Filtered items for selected day
  const selectedDayCompromissos = useMemo(() => {
    let items = getCompromissosForDay(selectedDate);
    if (filtroSitComp === "pendentes") items = items.filter(c => !c.concluido);
    if (filtroSitComp === "concluidos") items = items.filter(c => c.concluido);
    return items;
  }, [compromissos, selectedDate, filtroSitComp]);

  const selectedDayTarefas = useMemo(() => {
    let items = getTarefasForDay(selectedDate);
    if (filtroSitTarefa === "a_fazer") items = items.filter(t => ["a_fazer", "rejeitada"].includes(t.status));
    if (filtroSitTarefa === "em_validacao") items = items.filter(t => ["pendente_aprovacao", "dispensa_solicitada"].includes(t.status));
    if (filtroSitTarefa === "concluidas") items = items.filter(t => ["concluida", "arquivada"].includes(t.status));
    return items;
  }, [tarefas, selectedDate, filtroSitTarefa]);

  // Deveres for selected day
  const isSelectedDayToday = isSameDay(selectedDate, new Date());
  const deveresCumpridos = regrasOuro.filter(r => checkinMap.get(r)?.cumprida === true).length;
  const allDeveresCumpridos = regrasOuro.length > 0 && deveresCumpridos === regrasOuro.length;

  const handlePeriodoChange = (p: FiltroPeriodo) => {
    setFiltroPeriodo(p);
    setSelectedDate(new Date());
  };

  // Count items for badges in tabs
  const compCount = getCompromissosForDay(selectedDate).length;
  const tarefaCount = getTarefasForDay(selectedDate).length;

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
              <button onClick={() => toggleConcluido.mutate({ id: c.id, concluido: !c.concluido })}
                className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  c.concluido ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 hover:border-primary"
                )}>
                {c.concluido && <Check className="h-3.5 w-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-base shrink-0">{cat.emoji}</span>
                  <span className={cn("font-display font-semibold text-sm truncate", c.concluido && "line-through text-muted-foreground")}>{c.nome}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{isDiaInteiro ? "Dia inteiro" : format(dt, "HH:mm")}</span>
                  <Badge variant="outline" className="text-[10px]">{cat.label}</Badge>
                  {isOverdue && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                </div>
                {c.descricao && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.descricao}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
    const isAFazer = t.status === "a_fazer" || t.status === "rejeitada";
    const isEmValidacao = t.status === "pendente_aprovacao" || t.status === "dispensa_solicitada";
    return (
      <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
        <Card className={cn("border-2 transition-shadow hover:shadow-md", isConcluida ? "border-muted bg-muted/30 opacity-70" : "border-border")}>
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                isConcluida ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
              )}>
                {isConcluida && <Check className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedTarefa(t)}>
                <div className="flex items-center gap-1.5">
                  <span className="text-base shrink-0">{emoji}</span>
                  <span className={cn("font-display font-semibold text-sm truncate", isConcluida && "line-through text-muted-foreground")}>{t.nome}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                    <Coins className="h-3 w-3 text-coin" /> {t.valor_moedas}
                  </span>
                  <Badge variant={statusTarefaLabel[t.status]?.variant ?? "outline"} className={`text-[10px] ${statusTarefaLabel[t.status]?.className ?? ""}`}>
                    {statusTarefaLabel[t.status]?.label ?? t.status}
                  </Badge>
                  {t.tarefa_extra && <Badge variant="outline" className="text-[10px]">Extra</Badge>}
                </div>
                {t.status === "rejeitada" && t.comentario_responsavel && (
                  <p className="mt-1 text-xs text-destructive">💬 {t.comentario_responsavel}</p>
                )}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex justify-end mt-2">
              <div className="flex flex-wrap gap-1">
                {isAFazer && (
                  <>
                    <Button size="sm" onClick={() => concluirMutation.mutate(t.id)} disabled={concluirMutation.isPending} className="text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Feito!
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setComentarTarefaId(t.id); setMensagemComentario(""); setFotoComentario(null); }} className="text-xs">
                      <MessageSquare className="h-3.5 w-3.5 mr-1" /> Comentar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDispensaTarefaId(t.id)} className="text-xs">
                      🙏 Dispensa
                    </Button>
                  </>
                )}
                {isEmValidacao && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Em validação
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <>
      <SuccessAnimation show={showSuccess} emoji={successEmoji} message={successMessage} onComplete={() => setShowSuccess(false)} />
      <AppLayout>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-primary" /> Minha Agenda
              </h1>
              <p className="text-sm text-muted-foreground">Compromissos, tarefas e deveres em um só lugar</p>
            </div>
            <div className="flex gap-1">
              <Button onClick={() => { setExtraNome(""); setExtraDescricao(""); setExtraMensagem(""); setExtraFoto(null); setExtraSelectedTemplate("__novo__"); setExtraDialogOpen(true); }} size="sm" variant="outline" className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Tarefa
              </Button>
              <Button onClick={openCreate} size="sm" className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Compromisso
              </Button>
            </div>
          </div>

          {/* Period Filter */}
          <Tabs value={filtroPeriodo} onValueChange={(v) => handlePeriodoChange(v as FiltroPeriodo)}>
            <TabsList className="w-full">
              {Object.entries(periodoLabels).map(([key, label]) => (
                <TabsTrigger key={key} value={key} className="flex-1 text-xs sm:text-sm">{label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Calendar Grid with colored days */}
              <Card>
                <CardContent className="p-2 sm:p-3">
                  <div className="grid grid-cols-7 mb-1">
                    {dayNames.map((d, i) => (
                      <div key={i} className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                    {calendarDays.map((day, i) => {
                      if (!day) return <div key={`pad-${i}`} />;
                      const isSelected = isSameDay(day, selectedDate);
                      const today = isToday(day);
                      const status = getDayCompletionStatus(day);

                      let bgClass = "hover:bg-muted";
                      if (status === "complete") bgClass = "bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 dark:hover:bg-emerald-900/50";
                      else if (status === "incomplete") bgClass = "bg-rose-100 dark:bg-rose-900/30 hover:bg-rose-200 dark:hover:bg-rose-900/50";

                      return (
                        <button key={day.toISOString()} onClick={() => setSelectedDate(day)}
                          className={cn(
                            "relative flex flex-col items-center justify-center rounded-lg py-1.5 sm:py-2 transition-colors text-xs sm:text-sm",
                            isSelected
                              ? "bg-primary text-primary-foreground font-bold"
                              : today ? "ring-2 ring-primary font-semibold " + bgClass : bgClass
                          )}>
                          <span>{format(day, "d")}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-3 mt-2 justify-center text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-800" /> 100% realizado</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-200 dark:bg-rose-800" /> Não realizado total/parcialmente</span>
                  </div>
                </CardContent>
              </Card>

              {/* Selected day detail with 3 tabs */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </h3>

                <Tabs value={dayTab} onValueChange={(v) => setDayTab(v as DayTab)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="compromissos" className="flex-1 gap-1 text-xs">
                      📌 Compromissos
                      {compCount > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{compCount}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="tarefas" className="flex-1 gap-1 text-xs">
                      ✅ Tarefas
                      {tarefaCount > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{tarefaCount}</Badge>}
                    </TabsTrigger>
                    {deveresAtivos && (
                      <TabsTrigger value="deveres" className="flex-1 gap-1 text-xs">
                        🛡️ Deveres
                        {regrasOuro.length > 0 && (
                          <Badge variant={allDeveresCumpridos ? "default" : "secondary"} className="text-[10px] ml-1">
                            {deveresCumpridos}/{regrasOuro.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {/* Compromissos tab */}
                  <TabsContent value="compromissos" className="space-y-2 mt-2">
                    <Select value={filtroSitComp} onValueChange={(v) => setFiltroSitComp(v as FiltroSituacaoCompromisso)}>
                      <SelectTrigger className="w-auto min-w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas situações</SelectItem>
                        <SelectItem value="pendentes">Pendentes</SelectItem>
                        <SelectItem value="concluidos">Concluídos</SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedDayCompromissos.length > 0
                      ? selectedDayCompromissos.map((c, i) => renderCompromissoCard(c, i))
                      : <p className="text-sm text-muted-foreground py-4 text-center">Nenhum compromisso neste dia</p>}
                  </TabsContent>

                  {/* Tarefas tab */}
                  <TabsContent value="tarefas" className="space-y-2 mt-2">
                    <Select value={filtroSitTarefa} onValueChange={(v) => setFiltroSitTarefa(v as FiltroSituacaoTarefa)}>
                      <SelectTrigger className="w-auto min-w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas situações</SelectItem>
                        <SelectItem value="a_fazer">A fazer</SelectItem>
                        <SelectItem value="em_validacao">Em validação</SelectItem>
                        <SelectItem value="concluidas">Concluídas</SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedDayTarefas.length > 0
                      ? selectedDayTarefas.map((t, i) => renderTarefaCard(t, i))
                      : <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma tarefa neste dia</p>}
                  </TabsContent>

                  {/* Deveres tab */}
                  {deveresAtivos && (
                    <TabsContent value="deveres" className="space-y-3 mt-2">
                      {isSelectedDayToday ? (
                        <>
                          <div className="flex items-center justify-between">
                            <Badge variant={allDeveresCumpridos ? "default" : "secondary"} className="gap-1">
                              {allDeveresCumpridos ? <CheckCircle2 className="h-3 w-3" /> : null}
                              {deveresCumpridos}/{regrasOuro.length} cumpridos
                            </Badge>
                          </div>
                          {regrasOuro.map((regra, i) => {
                            const cumprida = checkinMap.get(regra)?.cumprida === true;
                            return (
                              <motion.div key={regra} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                                <Card className={cn("border-2 transition-colors", cumprida ? "border-primary/30 bg-primary/5" : "border-muted")}>
                                  <CardContent className="flex items-center gap-4 py-3">
                                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl shrink-0",
                                      cumprida ? "bg-primary/10" : "bg-muted")}>
                                      {cumprida ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground/50" />}
                                    </div>
                                    <p className={cn("flex-1 font-medium text-sm", cumprida ? "text-foreground" : "text-muted-foreground")}>{regra}</p>
                                    <Switch checked={cumprida} onCheckedChange={(checked) => toggleDever.mutate({ regra, cumprida: checked })} disabled={toggleDever.isPending} />
                                  </CardContent>
                                </Card>
                              </motion.div>
                            );
                          })}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          Os deveres só podem ser marcados no dia de hoje
                        </p>
                      )}
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            </>
          )}
        </div>

        {/* Create/Edit Compromisso Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editingId ? "Editar Compromisso" : "Novo Compromisso"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Prova de Matemática" /></div>
              <div>
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaCompromisso)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoriasConfig).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.emoji} {cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data *</Label>
                <Input type="date" value={format(dataCompromisso, "yyyy-MM-dd")}
                  onChange={(e) => { if (e.target.value) setDataCompromisso(new Date(e.target.value + "T12:00:00")); }} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="dia-inteiro" checked={diaInteiro} onCheckedChange={(v) => setDiaInteiro(!!v)} />
                  <Label htmlFor="dia-inteiro" className="text-sm cursor-pointer">Dia inteiro</Label>
                </div>
                {!diaInteiro && <div className="flex-1"><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>}
              </div>
              <div><Label>Descrição</Label><Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes opcionais..." rows={2} /></div>
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

        {/* Comentar Dialog */}
        <Dialog open={!!comentarTarefaId} onOpenChange={(o) => { if (!o) { setComentarTarefaId(null); setMensagemComentario(""); setFotoComentario(null); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Enviar Comentário 💬</DialogTitle></DialogHeader>
            <InteracaoInput label="Mensagem para o responsável" placeholder="Conte como você fez a tarefa..." mensagem={mensagemComentario} onMensagemChange={setMensagemComentario} foto={fotoComentario} onFotoChange={setFotoComentario} />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setComentarTarefaId(null); }}>Cancelar</Button>
              <Button onClick={() => comentarTarefaId && (mensagemComentario.trim() || fotoComentario) && comentarMutation.mutate({ tarefaId: comentarTarefaId, mensagem: mensagemComentario, foto: fotoComentario })}
                disabled={comentarMutation.isPending || (!mensagemComentario.trim() && !fotoComentario)}>
                {comentarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dispensa Dialog */}
        <Dialog open={!!dispensaTarefaId} onOpenChange={(o) => { if (!o) { setDispensaTarefaId(null); setJustificativaDispensa(""); setFotoDispensa(null); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Pedir Dispensa 🙏</DialogTitle></DialogHeader>
            {(() => { const t = tarefas?.find(t => t.id === dispensaTarefaId); return t ? (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <p className="font-semibold">{categoriaTarefaEmoji[t.categoria] ?? "⭐"} {t.nome}</p>
                {t.descricao && <p className="text-xs text-muted-foreground">{t.descricao}</p>}
              </div>
            ) : null; })()}
            <InteracaoInput label="Por que você não pode fazer essa tarefa? *" placeholder="Explique o motivo..." mensagem={justificativaDispensa} onMensagemChange={setJustificativaDispensa} foto={fotoDispensa} onFotoChange={setFotoDispensa} required />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDispensaTarefaId(null); }}>Cancelar</Button>
              <Button onClick={() => dispensaTarefaId && justificativaDispensa.trim() && dispensaMutation.mutate({ tarefaId: dispensaTarefaId, justificativa: justificativaDispensa, foto: fotoDispensa })}
                disabled={dispensaMutation.isPending || !justificativaDispensa.trim()}>
                {dispensaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar Pedido"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Extra Task Dialog */}
        <Dialog open={extraDialogOpen} onOpenChange={(o) => { if (!o) setExtraDialogOpen(false); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display">Registrar Tarefa Extra ⭐</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Selecionar tarefa</Label>
                <Select value={extraSelectedTemplate} onValueChange={setExtraSelectedTemplate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__novo__">✨ Nova tarefa (não está na lista)</SelectItem>
                    {(templates ?? []).map(t => (
                      <SelectItem key={t.id} value={t.id}>{categoriaTarefaEmoji[t.categoria] ?? "⭐"} {t.nome} ({t.valor_moedas} 🪙)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {extraSelectedTemplate === "__novo__" && (
                <>
                  <div><Label>Nome da tarefa *</Label><Input placeholder="O que você fez?" value={extraNome} onChange={e => setExtraNome(e.target.value)} /></div>
                  <div><Label>Descrição (opcional)</Label><Textarea placeholder="Descreva o que fez..." value={extraDescricao} onChange={e => setExtraDescricao(e.target.value)} /></div>
                </>
              )}
              <InteracaoInput label="Mensagem para o responsável (opcional)" placeholder="Conte o que fez..." mensagem={extraMensagem} onMensagemChange={setExtraMensagem} foto={extraFoto} onFotoChange={setExtraFoto} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExtraDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => criarTarefaExtra.mutate()} disabled={criarTarefaExtra.isPending || (extraSelectedTemplate === "__novo__" && !extraNome.trim())}>
                {criarTarefaExtra.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar para Avaliação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Task History Sheet */}
        <TarefaHistoricoSheet tarefa={selectedTarefa} onClose={() => setSelectedTarefa(null)}
          getNomeUsuario={(userId) => {
            if (!userId) return "Sem atribuição";
            if (userId === profile?.user_id) return profile?.nome ?? "Eu";
            return "Responsável";
          }} />
      </AppLayout>
    </>
  );
}
