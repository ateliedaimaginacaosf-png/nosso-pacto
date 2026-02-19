import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Coins, ClipboardList, Gift, CheckCircle2, Clock, AlertTriangle, Trophy, FileText, AlertCircle, Camera, Loader2, Shield, XCircle, Star } from "lucide-react";
import { getAvatarUrl } from "@/lib/avatar";
import { format, subDays } from "date-fns";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, Routes, Route } from "react-router-dom";
import { useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useRegrasOuroStatus } from "@/hooks/useRegrasOuroStatus";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import MinhasTarefas from "./crianca/MinhasTarefas";
import LojaRecompensas from "./crianca/LojaRecompensas";
import MinhasMoedas from "./crianca/MinhasMoedas";
import MeusResgates from "./crianca/MeusResgates";
import ContratoAutonomiaCrianca from "./crianca/ContratoAutonomia";
import RegrasOuro from "./crianca/RegrasOuro";
import MinhasConquistas from "./crianca/MinhasConquistas";
import { useBadgeChecker } from "@/hooks/useBadgeChecker";
import { SuccessAnimation } from "@/components/SuccessAnimation";

function DashboardHome() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Realtime: auto-refresh when data changes
  useRealtimeSubscription(
    ["tarefa", "resgate_recompensa", "transacao", "regra_ouro_checkin", "notificacao", "profiles"],
    [
      ["saldo-crianca"],
      ["saldo-provisionado"],
      ["tarefas-crianca"],
      ["resgates-crianca"],
      ["regra-ouro"],
    ]
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
        .from("resgate_recompensa")
        .select("custo_moedas")
        .eq("crianca_id", profile!.user_id)
        .eq("status", "pendente");
      if (error) throw error;
      return data.reduce((sum, r) => sum + r.custo_moedas, 0);
    },
    enabled: !!profile,
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: moedasAConquistar } = useQuery({
    queryKey: ["moedas-a-conquistar", profile?.user_id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("valor_moedas")
        .eq("atribuida_a", profile!.user_id)
        .in("status", ["a_fazer", "pendente_aprovacao", "dispensa_solicitada", "rejeitada"])
        .eq("data_prevista", todayStr);
      if (error) throw error;
      return (data ?? []).reduce((sum, t) => sum + (t.valor_moedas ?? 0), 0);
    },
    enabled: !!profile,
  });

  const { regrasOuro, hasRules, bloqueado, diasDescumpridos, checkinsOntem, limiteLiberdade } =
    useRegrasOuroStatus(profile?.user_id, profile?.familia_id);

  // Check if child has a vigente contract
  const { data: temContratoVigente } = useQuery({
    queryKey: ["contrato-vigente-exists", profile?.familia_id, profile?.user_id],
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

  // Today's checkins for duties counter
  const { data: checkinsHoje } = useQuery({
    queryKey: ["regra-ouro-checkin", profile?.user_id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("*")
        .eq("crianca_id", profile!.user_id)
        .eq("familia_id", profile!.familia_id)
        .eq("data", todayStr);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const deveresCumpridos = hasRules
    ? regrasOuro.filter((r) => (checkinsHoje ?? []).find((c) => c.regra === r && c.cumprida)).length
    : 0;
  const deveresTotal = regrasOuro.length;
  const deveresFaltam = deveresTotal - deveresCumpridos;
  const currentHour = new Date().getHours();
  const showDeveresAlert = hasRules && temContratoVigente && currentHour >= 17 && deveresFaltam > 0;

  const { data: stats } = useQuery({
    queryKey: ["crianca-stats", profile?.user_id, todayStr],
    queryFn: async () => {
      const [aFazer, pendentes, rejeitadas, concluidas, resgatesPendentes, contratoPendente] = await Promise.all([
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .eq("status", "a_fazer")
          .eq("data_prevista", todayStr),
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .in("status", ["pendente_aprovacao", "dispensa_solicitada"])
          .eq("data_prevista", todayStr),
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .eq("status", "rejeitada"),
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .in("status", ["concluida", "arquivada"])
          .eq("data_prevista", todayStr),
        supabase
          .from("resgate_recompensa")
          .select("id", { count: "exact", head: true })
          .eq("crianca_id", profile!.user_id)
          .in("status", ["pendente", "cancelamento_solicitado"]),
        supabase
          .from("contrato_versao")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", profile!.familia_id)
          .eq("crianca_id", profile!.user_id)
          .eq("status", "pendente_aprovacao"),
      ]);
      return {
        aFazer: aFazer.count ?? 0,
        pendentes: pendentes.count ?? 0,
        rejeitadas: rejeitadas.count ?? 0,
        concluidas: concluidas.count ?? 0,
        resgatesPendentes: resgatesPendentes.count ?? 0,
        contratoPendente: (contratoPendente.count ?? 0),
      };
    },
    enabled: !!profile,
  });

  const handlePhotoUpload = async (file: File) => {
    if (!profile) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB.", variant: "destructive" });
      return;
    }
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
      // Refresh profile in auth context
      window.location.reload();
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <label className="group relative cursor-pointer">
            <Avatar className="h-12 w-12 border-2 border-primary/20">
              <AvatarImage src={getAvatarUrl(profile?.foto_url ?? null) ?? undefined} alt={profile?.nome} />
              <AvatarFallback className="bg-primary/10"><Star className="h-5 w-5 text-primary" /></AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
              {uploadingPhoto ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Camera className="h-4 w-4 text-white" />
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhotoUpload(f);
                e.target.value = "";
              }}
            />
          </label>
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              Olá, {profile?.nome}! 🚀
            </h1>
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
                    Você ainda tem <strong>{deveresFaltam}</strong> {deveresFaltam === 1 ? "dever" : "deveres"} não {deveresFaltam === 1 ? "cumprido" : "cumpridos"} hoje. 
                    Cumpra antes do fim do dia para não ter resgates bloqueados amanhã!
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
                    Você não cumpriu todos os seus deveres ontem, por isso os resgates estão bloqueados hoje.
                    {diasDescumpridos > 0 && (
                      <> Este mês você já deixou de cumprir <strong>{diasDescumpridos}</strong> {diasDescumpridos === 1 ? "vez" : "vezes"} com seus deveres!</>
                    )}
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
                  <p className="text-sm text-muted-foreground">
                    Seu responsável liberou os resgates com um limite de <strong>{limiteLiberdade} moedas</strong> hoje.
                    {diasDescumpridos > 0 && (
                      <> Este mês você já deixou de cumprir <strong>{diasDescumpridos}</strong> {diasDescumpridos === 1 ? "vez" : "vezes"} com seus deveres!</>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}


        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Link to="/crianca/moedas" className="block">
            <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5 transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex items-center gap-4 py-6 flex-wrap">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-coin/20 shrink-0">
                  <Coins className="h-7 w-7 text-coin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Disponível</p>
                  <p className="font-display text-3xl font-bold text-coin-foreground">{(saldo ?? 0) - (provisionado ?? 0)} moedas</p>
                  {(provisionado ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ({provisionado} provisionadas para resgates pendentes • total: {saldo ?? 0})
                    </p>
                  )}
                </div>
                {(moedasAConquistar ?? 0) > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground leading-tight">A conquistar hoje</p>
                      <p className="font-display text-lg font-bold text-primary">+{moedasAConquistar} 🪙</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* 1. Deveres */}
          {hasRules && temContratoVigente && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Link to="/crianca/deveres" className="block">
                <Card className={`border-2 transition-shadow hover:shadow-md ${deveresFaltam > 0 ? "border-destructive/20" : "border-primary/20"}`}>
                  <CardHeader className="flex flex-row items-center gap-3 pb-2">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${deveresFaltam > 0 ? "bg-destructive/10" : "bg-primary/10"}`}>
                      <Shield className={`h-5 w-5 ${deveresFaltam > 0 ? "text-destructive" : "text-primary"}`} />
                    </div>
                    <CardTitle className="font-display text-lg">Deveres</CardTitle>
                    <Badge variant={deveresFaltam > 0 ? "destructive" : "default"} className="ml-auto gap-1">
                      {deveresFaltam > 0 ? (
                        <><XCircle className="h-3 w-3" /> {deveresFaltam} {deveresFaltam === 1 ? "falta" : "faltam"}</>
                      ) : (
                        <><CheckCircle2 className="h-3 w-3" /> Tudo ok</>
                      )}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(() => {
                      const pct = deveresTotal > 0 ? Math.round((deveresCumpridos / deveresTotal) * 100) : 0;
                      return (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">
                              {deveresCumpridos} de {deveresTotal} cumpridos hoje
                            </span>
                            <span className="font-bold text-primary">{pct}%</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            <motion.div
                              className="h-full rounded-full bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                            />
                          </div>
                          {pct === 100 && (
                            <p className="text-xs text-primary font-semibold">🎉 Todos cumpridos!</p>
                          )}
                        </div>
                      );
                    })()}
                    {diasDescumpridos > 0 && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {diasDescumpridos} {diasDescumpridos === 1 ? "dia" : "dias"} com deveres pendentes nos últimos 30 dias
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          )}

          {/* 2. Tarefas do Dia — with progress bar */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Link to="/crianca/tarefas" className="block">
              <Card className="border-2 border-primary/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="font-display text-lg">Tarefas do Dia</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Progress bar */}
                  {(() => {
                    const total = (stats?.aFazer ?? 0) + (stats?.pendentes ?? 0) + (stats?.concluidas ?? 0);
                    const concluidas = stats?.concluidas ?? 0;
                    const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
                    return total > 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            {concluidas} de {total} concluídas
                          </span>
                          <span className="font-bold text-primary">{pct}%</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full rounded-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                          />
                        </div>
                        {pct === 100 && (
                          <p className="text-xs text-primary font-semibold text-center">🎉 Todas concluídas! Parabéns!</p>
                        )}
                      </div>
                    ) : null;
                  })()}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">{stats?.aFazer ?? 0}</span>
                      <span className="text-xs text-muted-foreground">a fazer</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">{stats?.pendentes ?? 0}</span>
                      <span className="text-xs text-muted-foreground">em validação</span>
                    </div>
                    {(stats?.rejeitadas ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="text-sm font-semibold text-destructive">{stats!.rejeitadas}</span>
                        <span className="text-xs text-destructive">devolvidas</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Trophy className="h-4 w-4 text-success" />
                      <span className="text-sm font-semibold">{stats?.concluidas ?? 0}</span>
                      <span className="text-xs text-muted-foreground">concluídas</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* 3. Loja de Recompensas */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
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

          {/* 4. Meus Resgates */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
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

          {/* 5. Contrato de Autonomia */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Link to="/crianca/contrato" className="block">
              <Card className={`border-2 transition-shadow hover:shadow-md ${(stats?.contratoPendente ?? 0) > 0 ? "border-yellow-500/40 bg-yellow-500/5" : "border-primary/20"}`}>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${(stats?.contratoPendente ?? 0) > 0 ? "bg-yellow-500/10" : "bg-primary/10"}`}>
                    <FileText className={`h-5 w-5 ${(stats?.contratoPendente ?? 0) > 0 ? "text-yellow-600" : "text-primary"}`} />
                  </div>
                  <CardTitle className="font-display text-lg">Contrato de Autonomia</CardTitle>
                  {(stats?.contratoPendente ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Aprovar
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {(stats?.contratoPendente ?? 0) > 0
                      ? "Você tem um contrato aguardando sua aprovação!"
                      : "Consulte suas regras e combinados"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* 6. Conquistas */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <Link to="/crianca/conquistas" className="block">
              <Card className="border-2 border-primary/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="font-display text-lg">Conquistas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Desbloqueie medalhas completando desafios! 🏆</p>
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

  // Check badges on mount and when profile changes
  useEffect(() => {
    checkBadges();
  }, [checkBadges]);

  return (
    <>
      <SuccessAnimation
        show={!!newBadge}
        emoji={newBadge?.emoji ?? "🏅"}
        message={`${newBadge?.nome} desbloqueada!`}
        onComplete={clearNewBadge}
      />
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="tarefas" element={<MinhasTarefas />} />
        <Route path="loja" element={<LojaRecompensas />} />
        <Route path="moedas" element={<MinhasMoedas />} />
        <Route path="resgates" element={<MeusResgates />} />
        <Route path="contrato" element={<ContratoAutonomiaCrianca />} />
        <Route path="deveres" element={<RegrasOuro />} />
        <Route path="conquistas" element={<MinhasConquistas />} />
      </Routes>
    </>
  );
}
