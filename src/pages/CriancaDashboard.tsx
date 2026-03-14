import { useEffect, lazy, Suspense } from "react";
import { RouteErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Coins, Gift, CheckCircle2, Clock, AlertTriangle, Trophy, FileText, AlertCircle, Camera, Loader2, Shield, XCircle, Star, Flame, CalendarDays } from "lucide-react";
import { StreakCalendar } from "@/components/StreakCalendar";
import { NivelXP } from "@/components/NivelXP";
import { getAvatarUrl } from "@/lib/avatar";
import { format, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, isToday, isFuture, startOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Routes, Route } from "react-router-dom";
import { useRef, useState, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import { useRegrasOuroStatus } from "@/hooks/useRegrasOuroStatus";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useBadgeChecker } from "@/hooks/useBadgeChecker";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { cn } from "@/lib/utils";

// Lazy load sub-pages
const LojaRecompensas = lazy(() => import("./crianca/LojaRecompensas"));
const MinhasMoedas = lazy(() => import("./crianca/MinhasMoedas"));
const MeusResgates = lazy(() => import("./crianca/MeusResgates"));
const ContratoAutonomiaCrianca = lazy(() => import("./crianca/ContratoAutonomia"));
const RegrasOuro = lazy(() => import("./crianca/RegrasOuro"));
const MinhasConquistas = lazy(() => import("./crianca/MinhasConquistas"));
const MeusCompromissos = lazy(() => import("./crianca/MeusCompromissos"));
const MinhasTarefas = lazy(() => import("./crianca/MinhasTarefas"));

const SubPageLoader = () => (
  <AppLayout>
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  </AppLayout>
);

function DashboardHome() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Fetch incentive config
  const { data: incentiveConfig } = useQuery({
    queryKey: ["config-incentivo", profile?.familia_id, profile?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("configuracao_familia")
        .select("usar_recompensas, usar_mesada, valor_mesada, regras_ouro")
        .eq("familia_id", profile!.familia_id)
        .eq("crianca_id", profile!.user_id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile,
  });

  const usarRecompensas = (incentiveConfig as any)?.usar_recompensas ?? true;
  const usarMesada = (incentiveConfig as any)?.usar_mesada ?? false;

  useRealtimeSubscription(
    ["tarefa", "resgate_recompensa", "transacao", "regra_ouro_checkin", "notificacao", "profiles", "compromisso"],
    [["saldo-crianca"], ["saldo-provisionado"], ["tarefas-crianca"], ["resgates-crianca"], ["regra-ouro"], ["compromissos"], ["agenda-tarefas"]]
  );

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
        .from("resgate_recompensa").select("custo_moedas")
        .eq("crianca_id", profile!.user_id).eq("status", "pendente");
      if (error) throw error;
      return data.reduce((sum, r) => sum + r.custo_moedas, 0);
    },
    enabled: !!profile,
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: moedasAConquistar } = useQuery({
    queryKey: ["moedas-a-conquistar", profile?.user_id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase.from("tarefa").select("valor_moedas")
        .eq("atribuida_a", profile!.user_id)
        .in("status", ["a_fazer", "pendente_aprovacao", "dispensa_solicitada", "rejeitada"])
        .eq("data_prevista", todayStr);
      if (error) throw error;
      return (data ?? []).reduce((sum, t) => sum + (t.valor_moedas ?? 0), 0);
    },
    enabled: !!profile,
  });

  const { regrasOuro, hasRules, bloqueado, diasDescumpridos, limiteLiberdade } =
    useRegrasOuroStatus(profile?.user_id, profile?.familia_id);

  const { data: temContratoVigente } = useQuery({
    queryKey: ["contrato-vigente-exists", profile?.familia_id, profile?.user_id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contrato_versao").select("id", { count: "exact", head: true })
        .eq("familia_id", profile!.familia_id).eq("crianca_id", profile!.user_id).eq("status", "vigente");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!profile,
  });

  const { data: checkinsHoje } = useQuery({
    queryKey: ["regra-ouro-checkin", profile?.user_id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase.from("regra_ouro_checkin").select("*")
        .eq("crianca_id", profile!.user_id).eq("familia_id", profile!.familia_id).eq("data", todayStr);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const deveresCumpridos = hasRules
    ? regrasOuro.filter((r) => (checkinsHoje ?? []).find((c) => c.regra === r && c.cumprida)).length : 0;
  const deveresTotal = regrasOuro.length;
  const deveresFaltam = deveresTotal - deveresCumpridos;
  const currentHour = new Date().getHours();
  const showDeveresAlert = hasRules && temContratoVigente && currentHour >= 17 && deveresFaltam > 0;
  const deveresAtivos = temContratoVigente === true && hasRules;

  // Tarefas pendentes hoje
  const { data: tarefasPendentesHoje } = useQuery({
    queryKey: ["tarefas-pendentes-hoje", profile?.user_id, todayStr],
    queryFn: async () => {
      const { count, error } = await supabase.from("tarefa").select("id", { count: "exact", head: true })
        .eq("atribuida_a", profile!.user_id).in("status", ["a_fazer", "rejeitada"]).eq("data_prevista", todayStr);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profile,
  });

  const { data: stats } = useQuery({
    queryKey: ["crianca-stats", profile?.user_id, todayStr],
    queryFn: async () => {
      const [resgatesPendentes, contratoPendente] = await Promise.all([
        supabase.from("resgate_recompensa").select("id", { count: "exact", head: true })
          .eq("crianca_id", profile!.user_id).in("status", ["pendente", "cancelamento_solicitado"]),
        supabase.from("contrato_versao").select("id", { count: "exact", head: true })
          .eq("familia_id", profile!.familia_id).eq("crianca_id", profile!.user_id).eq("status", "pendente_aprovacao"),
      ]);
      return {
        resgatesPendentes: resgatesPendentes.count ?? 0,
        contratoPendente: contratoPendente.count ?? 0,
      };
    },
    enabled: !!profile,
  });

  // Mini calendar data - current week
  const now = new Date();
  const weekStart = startOfWeek(now, { locale: ptBR });
  const weekEnd = endOfWeek(now, { locale: ptBR });
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), []);

  // Fetch compromissos for calendar
  const { data: compromissos } = useQuery({
    queryKey: ["compromissos", profile?.user_id, profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("compromisso").select("*")
        .eq("crianca_id", profile!.user_id).eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Fetch tarefas for calendar
  const { data: tarefas } = useQuery({
    queryKey: ["agenda-tarefas", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tarefa").select("*")
        .eq("atribuida_a", profile!.user_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Fetch all checkins for calendar coloring
  const { data: allCheckins } = useQuery({
    queryKey: ["regra-ouro-checkins-all", profile?.user_id, profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("regra_ouro_checkin").select("data, cumprida, regra")
        .eq("crianca_id", profile!.user_id).eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // Compromissos pendentes (hoje e atrasados)
  const compromissosPendentes = useMemo(() => {
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const pending = (compromissos ?? []).filter(c => !c.concluido && new Date(c.data_hora) <= endOfToday);
    const atrasados = pending.filter(c => new Date(c.data_hora) < startOfToday).length;
    const hoje = pending.filter(c => { const d = new Date(c.data_hora); return d >= startOfToday && d <= endOfToday; }).length;
    return { atrasados, hoje, total: pending.length };
  }, [compromissos]);

  const getDayCompletionStatus = (day: Date): "complete" | "incomplete" | "future" | "neutral" => {
    if (isFuture(startOfDay(day)) && !isToday(day)) return "future";
    const dayStr = format(day, "yyyy-MM-dd");
    const dayCompromissos = (compromissos ?? []).filter(c => isSameDay(parseISO(c.data_hora), day));
    const dayTarefas = (tarefas ?? []).filter(t => t.data_prevista && isSameDay(new Date(t.data_prevista + "T12:00:00"), day));
    const dayCheckins = (allCheckins ?? []).filter(c => c.data === dayStr);
    const deveresForDay = deveresAtivos ? regrasOuro : [];
    const deveresCumpridos = deveresForDay.length > 0
      ? deveresForDay.every(r => dayCheckins.some(c => c.regra === r && c.cumprida)) : true;
    const compromissosCumpridos = dayCompromissos.length > 0 ? dayCompromissos.every(c => c.concluido) : true;
    const tarefasCumpridas = dayTarefas.length > 0 ? dayTarefas.every(t => ["concluida", "arquivada"].includes(t.status)) : true;
    const hasAnything = dayCompromissos.length > 0 || dayTarefas.length > 0;
    if (!hasAnything) return "neutral";
    if (compromissosCumpridos && tarefasCumpridas && deveresCumpridos) return "complete";
    return "incomplete";
  };

  const handlePhotoUpload = async (file: File) => {
    if (!profile) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "Máximo 5MB.", variant: "destructive" }); return; }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${profile.user_id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase.from("profiles").update({ foto_url: path }).eq("user_id", profile.user_id);
      if (updateError) throw updateError;
      toast({ title: "Foto atualizada! 📸" });
      queryClient.invalidateQueries({ queryKey: ["membros-familia"] });
      window.location.reload();
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
    } finally { setUploadingPhoto(false); }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <label className="group relative cursor-pointer">
            <Avatar className="h-12 w-12 border-2 border-[#a68faa]/40">
              <AvatarImage src={getAvatarUrl(profile?.foto_url ?? null) ?? undefined} alt={profile?.nome} />
              <AvatarFallback className="bg-primary/10"><Star className="h-5 w-5 text-primary" /></AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
              {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Camera className="h-4 w-4 text-white" />}
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ""; }} />
          </label>
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Olá, {profile?.nome}! 🚀</h1>
            <p className="text-muted-foreground">Seu painel do Nosso Pacto</p>
          </div>
        </motion.div>

        {/* Deveres Alert after 17h */}
        {showDeveresAlert && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-2 border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertTriangle className="h-5 w-5 mt-0.5 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">Atenção! Deveres pendentes</p>
                  <p className="text-sm text-muted-foreground">
                    Você ainda tem <strong>{deveresFaltam}</strong> {deveresFaltam === 1 ? "dever" : "deveres"} não cumprido{deveresFaltam > 1 ? "s" : ""} hoje.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {bloqueado && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-2 border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertCircle className="h-5 w-5 mt-0.5 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">🔒 Resgates bloqueados hoje</p>
                  <p className="text-sm text-muted-foreground">
                    Você não cumpriu todos os seus deveres ontem.
                    {diasDescumpridos > 0 && <> Este mês: <strong>{diasDescumpridos}</strong> {diasDescumpridos === 1 ? "dia" : "dias"} com deveres pendentes.</>}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {limiteLiberdade !== null && limiteLiberdade !== undefined && !bloqueado && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-2 border-coin/40 bg-coin/5">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertCircle className="h-5 w-5 mt-0.5 text-coin" />
                <div>
                  <p className="font-semibold text-coin-foreground">⚠️ Resgates com limite hoje</p>
                  <p className="text-sm text-muted-foreground">Limite de <strong>{limiteLiberdade} moedas</strong> para resgates hoje.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Nível XP */}
        {usarRecompensas && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.08 }}>
            <NivelXP userId={profile?.user_id} />
          </motion.div>
        )}

        {/* Moedas */}
        {usarRecompensas && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
            <Link to="/crianca/moedas" className="block">
              <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5 transition-shadow hover:shadow-md cursor-pointer">
                <CardContent className="py-5 px-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-coin/20 shrink-0">
                      <Coins className="h-6 w-6 text-coin" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Disponível</p>
                      <p className="font-display text-2xl font-bold text-coin-foreground leading-tight">{(saldo ?? 0) - (provisionado ?? 0)} moedas</p>
                    </div>
                    {(moedasAConquistar ?? 0) > 0 && (
                      <div className="ml-auto flex items-center gap-1.5 rounded-xl bg-primary/10 px-2.5 py-1.5 shrink-0">
                        <Trophy className="h-4 w-4 text-primary" />
                        <div className="text-right">
                          <p className="text-[9px] font-medium text-muted-foreground leading-tight">Hoje</p>
                          <p className="font-display text-sm font-bold text-primary leading-tight">+{moedasAConquistar} 🪙</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {(provisionado ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">{provisionado} provisionadas • total: {saldo ?? 0}</p>
                  )}
              </CardContent>
            </Card>
          </Link>
          </motion.div>
        )}
        {/* Streak Calendar */}
        {hasRules && temContratoVigente && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <StreakCalendar userId={profile?.user_id} familiaId={profile?.familia_id} />
          </motion.div>
        )}

        {/* Notifications for pending items */}
        {((tarefasPendentesHoje ?? 0) > 0 || compromissosPendentes.total > 0 || (deveresAtivos && deveresFaltam > 0)) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <Card className="border-2 border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="py-3 space-y-1">
                <p className="text-sm font-semibold flex items-center gap-1.5">⏳ Pendências de hoje</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {(tarefasPendentesHoje ?? 0) > 0 && (
                    <Badge variant="outline" className="gap-1">📋 {tarefasPendentesHoje} tarefa{(tarefasPendentesHoje ?? 0) > 1 ? "s" : ""}</Badge>
                  )}
                  {compromissosPendentes.total > 0 && (
                    <Badge variant="outline" className="gap-1">📌 {compromissosPendentes.total} compromisso{compromissosPendentes.total > 1 ? "s" : ""}</Badge>
                  )}
                  {deveresAtivos && deveresFaltam > 0 && (
                    <Badge variant="outline" className="gap-1">🛡️ {deveresFaltam} dever{deveresFaltam > 1 ? "es" : ""}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Minha Agenda - with mini calendar */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Link to="/crianca/agenda" className="block">
              <Card className={cn("border-2 transition-shadow hover:shadow-md",
                compromissosPendentes.atrasados > 0 ? "border-destructive/30" : "border-primary/30"
              )}>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl",
                    compromissosPendentes.atrasados > 0 ? "bg-destructive/10" : "bg-primary/10"
                  )}>
                    <CalendarDays className={cn("h-5 w-5", compromissosPendentes.atrasados > 0 ? "text-destructive" : "text-primary")} />
                  </div>
                  <CardTitle className="font-display text-lg">Minha Agenda</CardTitle>
                  {compromissosPendentes.total > 0 && (
                    <Badge variant={compromissosPendentes.atrasados > 0 ? "destructive" : "default"} className="ml-auto gap-1">
                      {compromissosPendentes.atrasados > 0 && <><AlertTriangle className="h-3 w-3" /> {compromissosPendentes.atrasados}</>}
                      {compromissosPendentes.atrasados > 0 && compromissosPendentes.hoje > 0 && " • "}
                      {compromissosPendentes.hoje > 0 && `${compromissosPendentes.hoje} hoje`}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Mini week calendar with colored days */}
                  <div className="grid grid-cols-7 gap-1">
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                      <div key={i} className="text-center text-[9px] font-medium text-muted-foreground">{d}</div>
                    ))}
                    {weekDays.map(day => {
                      const status = getDayCompletionStatus(day);
                      const today = isToday(day);
                      let bg = "";
                      if (status === "complete") bg = "bg-emerald-200 dark:bg-emerald-800";
                      else if (status === "incomplete") bg = "bg-rose-200 dark:bg-rose-800";
                      else bg = "bg-muted";
                      return (
                        <div key={day.toISOString()}
                          className={cn("flex items-center justify-center rounded-md py-1 text-xs",
                            bg, today && "ring-1 ring-primary font-bold"
                          )}>
                          {format(day, "d")}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Compromissos, tarefas e deveres 📅
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Loja de Recompensas */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Link to="/crianca/loja" className="block">
              <Card className="border-2 border-accent/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                    <Gift className="h-5 w-5 text-accent" />
                  </div>
                  <CardTitle className="font-display text-lg">Loja de Recompensas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Troque moedas por prêmios incríveis! 🎁</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Meus Resgates */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Link to="/crianca/resgates" className="block">
              <Card className="border-2 border-secondary/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10">
                    <Gift className="h-5 w-5 text-secondary" />
                  </div>
                  <CardTitle className="font-display text-lg">Meus Resgates</CardTitle>
                  {(stats?.resgatesPendentes ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-auto">{stats!.resgatesPendentes}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Acompanhe seus pedidos de recompensa</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Contrato de Autonomia */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Link to="/crianca/contrato" className="block">
              <Card className={cn("border-2 transition-shadow hover:shadow-md",
                (stats?.contratoPendente ?? 0) > 0 ? "border-yellow-500/40 bg-yellow-500/5" : "border-[#a68faa]/40"
              )}>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl",
                    (stats?.contratoPendente ?? 0) > 0 ? "bg-yellow-500/10" : "bg-primary/10"
                  )}>
                    <FileText className={cn("h-5 w-5", (stats?.contratoPendente ?? 0) > 0 ? "text-yellow-600" : "text-primary")} />
                  </div>
                  <CardTitle className="font-display text-lg">Contrato</CardTitle>
                  {(stats?.contratoPendente ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto gap-1"><AlertCircle className="h-3 w-3" />Assinar</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {(stats?.contratoPendente ?? 0) > 0 ? "Contrato aguardando assinatura!" : "Regras e combinados"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Conquistas */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Link to="/crianca/conquistas" className="block">
              <Card className="border-2 border-[#a68faa]/40 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="font-display text-lg">Conquistas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Desbloqueie medalhas! 🏆</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function CriancaDashboard() {
  const { profile } = useAuth();
  const { checkBadges, newBadge, clearNewBadge } = useBadgeChecker(profile?.user_id, profile?.familia_id);

  useEffect(() => { checkBadges(); }, [checkBadges]);

  useEffect(() => {
    if (!profile?.familia_id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedCheck = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => checkBadges(), 2000);
    };
    const channel = supabase.channel("badge-trigger")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "resgate_recompensa", filter: `familia_id=eq.${profile.familia_id}` }, debouncedCheck)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "tarefa", filter: `familia_id=eq.${profile.familia_id}` }, debouncedCheck)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "transacao", filter: `familia_id=eq.${profile.familia_id}` }, debouncedCheck)
      .subscribe();
    return () => { if (debounceTimer) clearTimeout(debounceTimer); supabase.removeChannel(channel); };
  }, [profile?.familia_id, checkBadges]);

  return (
    <>
      <SuccessAnimation show={!!newBadge} emoji={newBadge?.emoji ?? "🏅"} message={`${newBadge?.nome} desbloqueada!`} onComplete={clearNewBadge} />
      <RouteErrorBoundary>
        <Suspense fallback={<SubPageLoader />}>
          <Routes>
            <Route index element={<DashboardHome />} />
            <Route path="tarefas" element={<MinhasTarefas />} />
            <Route path="loja" element={<LojaRecompensas />} />
            <Route path="moedas" element={<MinhasMoedas />} />
            <Route path="resgates" element={<MeusResgates />} />
            <Route path="contrato" element={<ContratoAutonomiaCrianca />} />
            <Route path="deveres" element={<RegrasOuro />} />
            <Route path="conquistas" element={<MinhasConquistas />} />
            <Route path="agenda" element={<MeusCompromissos />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </>
  );
}
