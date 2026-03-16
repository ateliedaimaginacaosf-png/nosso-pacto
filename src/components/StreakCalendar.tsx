import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Flame, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfDay, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StreakCalendarProps {
  userId?: string;
  familiaId?: string;
}

type DayStatus = "full" | "partial" | "missed" | "no_rules" | "future";

export const StreakCalendar = memo(function StreakCalendar({ userId, familiaId }: StreakCalendarProps) {
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const daysInMonth = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart.getTime()]);

  // Day of week offset (0=Sun). We want Mon-start, so shift: (getDay()+6)%7
  const firstDayOffset = useMemo(() => (getDay(monthStart) + 6) % 7, [monthStart.getTime()]);

  const { data: checkins } = useQuery({
    queryKey: ["streak-checkins", userId, familiaId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const startDate = format(monthStart, "yyyy-MM-dd");
      const endDate = format(monthEnd, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("data, regra, cumprida")
        .eq("crianca_id", userId!)
        .eq("familia_id", familiaId!)
        .gte("data", startDate)
        .lte("data", endDate);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!familiaId,
  });

  const { data: config } = useQuery({
    queryKey: ["streak-config", familiaId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("regras_ouro, regras_ouro_inativas")
        .eq("familia_id", familiaId!)
        .eq("crianca_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!familiaId,
  });

  const activeRules = useMemo(() => {
    if (!config?.regras_ouro) return [];
    const inativas = config.regras_ouro_inativas ?? [];
    return config.regras_ouro.filter((r: string) => !inativas.includes(r));
  }, [config]);

  const { dayStatuses, currentStreak, bestStreak } = useMemo(() => {
    const statuses: { date: Date; status: DayStatus; cumpridas: number; total: number }[] = [];
    let best = 0;
    let tempStreak = 0;

    daysInMonth.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const isFuture = day > today;
      const isToday = dateStr === format(today, "yyyy-MM-dd");

      if (isFuture) {
        statuses.push({ date: day, status: "future", cumpridas: 0, total: 0 });
        return;
      }

      if (activeRules.length === 0) {
        statuses.push({ date: day, status: "no_rules", cumpridas: 0, total: 0 });
        return;
      }

      const dayCheckins = (checkins ?? []).filter((c) => c.data === dateStr);
      const cumpridas = activeRules.filter((r: string) =>
        dayCheckins.some((c) => c.regra === r && c.cumprida)
      ).length;
      const total = activeRules.length;

      let status: DayStatus;
      if (cumpridas === total) {
        status = "full";
        tempStreak++;
        best = Math.max(best, tempStreak);
      } else if (cumpridas > 0) {
        status = "partial";
        tempStreak = 0;
      } else {
        status = isToday ? "partial" : "missed";
        if (!isToday) tempStreak = 0;
      }

      statuses.push({ date: day, status, cumpridas, total });
    });

    return { dayStatuses: statuses, currentStreak: tempStreak, bestStreak: best };
  }, [daysInMonth, checkins, activeRules, today]);

  if (activeRules.length === 0) return null;

  const getColor = (status: DayStatus) => {
    switch (status) {
      case "full": return "bg-primary";
      case "partial": return "bg-[#a68faa]";
      case "missed": return "bg-[#e8b4b8]";
      case "no_rules": return "bg-muted";
      case "future": return "bg-muted/30";
    }
  };

  const getTooltip = (day: { date: Date; status: DayStatus; cumpridas: number; total: number }) => {
    const dateLabel = format(day.date, "dd/MM (EEE)", { locale: ptBR });
    if (day.status === "full") return `${dateLabel} ✅ Todos cumpridos`;
    if (day.status === "partial") return `${dateLabel} — ${day.cumpridas}/${day.total}`;
    if (day.status === "missed") return `${dateLabel} ❌ Não cumprido`;
    return dateLabel;
  };

  const monthLabel = format(today, "MMMM 'de' yyyy", { locale: ptBR });
  const weekDayHeaders = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <Card className="border-2 border-[#a68faa]/40">
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Flame className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <CardTitle className="font-display text-lg">Meus Deveres</CardTitle>
          <p className="text-xs text-muted-foreground capitalize">{monthLabel}</p>
        </div>
        {currentStreak > 0 && (
          <div className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5">
            <Flame className="h-4 w-4 text-primary" />
            <span className="font-display font-bold text-primary">{currentStreak}</span>
            <span className="text-[10px] text-muted-foreground">dias</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Week day headers */}
        <div className="grid grid-cols-7 gap-[3px]">
          {weekDayHeaders.map((d) => (
            <div key={d} className="text-center text-[9px] font-medium text-muted-foreground">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-[3px]">
          {/* Empty cells for offset */}
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="h-[14px] sm:h-4" />
          ))}
          {dayStatuses.map((day, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.015, duration: 0.2 }}
              title={getTooltip(day)}
              className={`h-[14px] rounded-[3px] ${getColor(day.status)} transition-transform hover:scale-125 cursor-default sm:h-4 sm:rounded flex items-center justify-center`}
            >
              <span className="text-[8px] font-medium text-white/80 sm:text-[9px]">{format(day.date, "d")}</span>
            </motion.div>
          ))}
        </div>

        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-[#e8b4b8]" /> Não cumprido
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-[#a68faa]" /> Parcial
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-primary" /> Completo
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Atual:</span>
            <span>{currentStreak} {currentStreak === 1 ? "dia" : "dias"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Recorde:</span>
            <span>{bestStreak} {bestStreak === 1 ? "dia" : "dias"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
