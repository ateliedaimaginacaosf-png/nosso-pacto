import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Loader2, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { format, getDaysInMonth, eachDayOfInterval, startOfMonth, endOfMonth, isBefore, startOfDay, parseISO, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo } from "react";

export default function MinhaMesada() {
  const { profile } = useAuth();
  const familiaId = profile?.familia_id;
  const userId = profile?.user_id;

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ["config-mesada-crianca", familiaId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("usar_mesada, valor_mesada, regras_ouro")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId && !!userId,
  });

  const { data: contrato } = useQuery({
    queryKey: ["contrato-vigente-mesada-crianca", familiaId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_versao")
        .select("data_vigencia")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", userId!)
        .eq("status", "vigente")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId && !!userId,
  });

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const today = startOfDay(now);
  const totalDaysInMonth = getDaysInMonth(now);

  const { data: checkins } = useQuery({
    queryKey: ["checkins-mesada-crianca", familiaId, userId, format(now, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("data, cumprida, regra")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", userId!)
        .gte("data", format(monthStart, "yyyy-MM-dd"))
        .lte("data", format(today, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
    enabled: !!familiaId && !!userId,
  });

  const mesadaData = useMemo(() => {
    if (!config || !(config as any).usar_mesada) return null;
    const regras = ((config as any).regras_ouro as string[]) ?? [];
    const valorTotal = Number((config as any).valor_mesada ?? 0);

    const dataVigencia = contrato?.data_vigencia ? startOfDay(parseISO(contrato.data_vigencia)) : monthStart;
    const effectiveStart = isAfter(dataVigencia, monthStart) ? dataVigencia : monthStart;
    const daysFromSigning = eachDayOfInterval({ start: effectiveStart, end: monthEnd }).length;
    const valorPrevisto = valorTotal * (daysFromSigning / totalDaysInMonth);

    if (regras.length === 0) return { percent: 100, valorPrevisto, valorAtual: valorPrevisto, dailyData: [] };

    const effectiveEnd = isBefore(today, monthEnd) ? today : monthEnd;
    if (isAfter(effectiveStart, effectiveEnd)) {
      return { percent: 100, valorPrevisto, valorAtual: valorPrevisto, dailyData: [] };
    }

    const daysToEvaluate = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });

    const dailyData = daysToEvaluate.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayCheckins = (checkins ?? []).filter(c => c.data === dayStr);
      const cumpridas = regras.filter(r => dayCheckins.some(c => c.regra === r && c.cumprida)).length;
      return { date: day, dateStr: dayStr, cumpridas, total: regras.length, percent: regras.length > 0 ? Math.round((cumpridas / regras.length) * 100) : 100 };
    });

    const totalPossible = daysToEvaluate.length * regras.length;
    const totalCumpridas = dailyData.reduce((sum, d) => sum + d.cumpridas, 0);
    const percent = totalPossible > 0 ? Math.round((totalCumpridas / totalPossible) * 100) : 100;
    const valorAtual = valorPrevisto * (percent / 100);

    return { percent, valorPrevisto, valorAtual, dailyData };
  }, [config, contrato, checkins, monthStart, monthEnd, today, totalDaysInMonth]);

  if (loadingConfig) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  if (!mesadaData) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-3xl">
          <h1 className="font-display text-2xl font-bold">Minha Mesada 💵</h1>
          <Card className="border-2 border-dashed">
            <CardContent className="py-8 text-center">
              <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Mesada não está ativa.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Minha Mesada 💵</h1>
          <p className="text-muted-foreground">{format(now, "MMMM yyyy", { locale: ptBR })}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-2">
            <CardContent className="space-y-4 pt-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Cumprimento</p>
                  <p className="font-display text-xl font-bold text-primary">{mesadaData.percent}%</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Previsto</p>
                  <p className="font-display text-xl font-bold">R$ {mesadaData.valorPrevisto.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Atual</p>
                  <p className="font-display text-xl font-bold text-emerald-600">R$ {mesadaData.valorAtual.toFixed(2)}</p>
                </div>
              </div>

              <Progress value={mesadaData.percent} className="h-3" />

              {/* Daily breakdown */}
              {mesadaData.dailyData.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" /> Detalhamento diário
                  </h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {mesadaData.dailyData.slice().reverse().map(d => (
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
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppLayout>
  );
}
