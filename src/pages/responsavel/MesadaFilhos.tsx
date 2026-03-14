import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Loader2, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { format, getDaysInMonth, eachDayOfInterval, startOfMonth, endOfMonth, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useMemo } from "react";

export default function MesadaFilhos() {
  const { profile } = useAuth();
  const [selectedChildId, setSelectedChildId] = useState<string>("todos");
  const familiaId = profile?.familia_id;

  const { data: membros, isLoading: loadingMembros } = useQuery({
    queryKey: ["membros-familia", familiaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome, tipo_perfil")
        .eq("familia_id", familiaId!);
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId,
  });

  const criancas = membros?.filter(m => m.tipo_perfil === "crianca") ?? [];

  // Get configs for all children to know which have mesada active
  const { data: configs } = useQuery({
    queryKey: ["configs-familia-mesada", familiaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("crianca_id, usar_mesada, valor_mesada, regras_ouro")
        .eq("familia_id", familiaId!);
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId,
  });

  const criancasComMesada = criancas.filter(c => {
    const cfg = configs?.find(cf => cf.crianca_id === c.user_id);
    return cfg && (cfg as any).usar_mesada === true;
  });

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const today = startOfDay(now);
  const daysUpToToday = eachDayOfInterval({ start: monthStart, end: isBefore(today, monthEnd) ? today : monthEnd });

  // Get all checkins for the current month for all children with mesada
  const childIds = criancasComMesada.map(c => c.user_id);

  const { data: checkins } = useQuery({
    queryKey: ["checkins-mesada", familiaId, format(now, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("crianca_id, data, cumprida, regra")
        .eq("familia_id", familiaId!)
        .gte("data", format(monthStart, "yyyy-MM-dd"))
        .lte("data", format(today, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId && childIds.length > 0,
  });

  const calcMesadaData = (childId: string) => {
    const cfg = configs?.find(cf => cf.crianca_id === childId);
    if (!cfg || !(cfg as any).usar_mesada) return null;
    const regras = (cfg as any).regras_ouro as string[] ?? [];
    if (regras.length === 0) return { percent: 100, valorPrevisto: Number((cfg as any).valor_mesada ?? 0), valorAtual: Number((cfg as any).valor_mesada ?? 0), dailyData: [] };

    const valorPrevisto = Number((cfg as any).valor_mesada ?? 0);
    const childCheckins = (checkins ?? []).filter(c => c.crianca_id === childId);

    // Daily breakdown
    const dailyData = daysUpToToday.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayCheckins = childCheckins.filter(c => c.data === dayStr);
      const cumpridas = regras.filter(r => dayCheckins.some(c => c.regra === r && c.cumprida)).length;
      return { date: day, dateStr: dayStr, cumpridas, total: regras.length, percent: regras.length > 0 ? Math.round((cumpridas / regras.length) * 100) : 100 };
    });

    const totalPossible = daysUpToToday.length * regras.length;
    const totalCumpridas = dailyData.reduce((sum, d) => sum + d.cumpridas, 0);
    const percent = totalPossible > 0 ? Math.round((totalCumpridas / totalPossible) * 100) : 100;
    const valorAtual = valorPrevisto * (percent / 100);

    return { percent, valorPrevisto, valorAtual, dailyData };
  };

  const filhosToShow = selectedChildId === "todos" ? criancasComMesada : criancasComMesada.filter(c => c.user_id === selectedChildId);

  if (loadingMembros) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Mesada dos Filhos 💵</h1>
          <p className="text-muted-foreground">Acompanhe o cumprimento dos deveres e o valor da mesada — {format(now, "MMMM yyyy", { locale: ptBR })}</p>
        </motion.div>

        {criancasComMesada.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="py-8 text-center">
              <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Nenhum filho com mesada ativa.</p>
              <p className="text-sm text-muted-foreground">Ative o esquema de mesada no Contrato de Autonomia.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {criancasComMesada.length > 1 && (
              <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os filhos</SelectItem>
                  {criancasComMesada.map(c => (
                    <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {filhosToShow.map(child => {
              const data = calcMesadaData(child.user_id);
              if (!data) return null;

              return (
                <motion.div key={child.user_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="border-2">
                    <CardHeader className="flex flex-row items-center gap-3 pb-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{child.nome.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <CardTitle className="font-display text-lg">{child.nome}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground">Cumprimento</p>
                          <p className="font-display text-xl font-bold text-primary">{data.percent}%</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground">Previsto</p>
                          <p className="font-display text-xl font-bold">R$ {data.valorPrevisto.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground">Atual</p>
                          <p className="font-display text-xl font-bold text-emerald-600">R$ {data.valorAtual.toFixed(2)}</p>
                        </div>
                      </div>

                      <Progress value={data.percent} className="h-3" />

                      {/* Daily breakdown */}
                      <div>
                        <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4" /> Detalhamento diário
                        </h4>
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {data.dailyData.slice().reverse().map(d => (
                            <div key={d.dateStr} className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
                              <span>{format(d.date, "dd/MM (EEE)", { locale: ptBR })}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">{d.cumpridas}/{d.total}</span>
                                <Badge variant={d.percent === 100 ? "default" : d.percent >= 50 ? "secondary" : "destructive"} className="text-xs min-w-[3rem] justify-center">
                                  {d.percent}%
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </>
        )}
      </div>
    </AppLayout>
  );
}
