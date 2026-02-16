import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CheckCircle2, Clock, Coins, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, getDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A Fazer", variant: "outline" },
  pendente_aprovacao: { label: "Aguardando", variant: "secondary" },
  concluida: { label: "Concluída", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
};

const diasSemanaLabel = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function MinhasTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: tarefasMes, isLoading } = useQuery({
    queryKey: ["minhas-tarefas-cal", profile?.user_id, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("*")
        .eq("atribuida_a", profile!.user_id)
        .gte("data_prevista", format(monthStart, "yyyy-MM-dd"))
        .lte("data_prevista", format(monthEnd, "yyyy-MM-dd"))
        .in("status", ["a_fazer", "pendente_aprovacao", "concluida", "rejeitada"])
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  // Also fetch tasks without data_prevista (legacy)
  const { data: tarefasLegacy } = useQuery({
    queryKey: ["minhas-tarefas-legacy", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("*")
        .eq("atribuida_a", profile!.user_id)
        .is("data_prevista", null)
        .in("status", ["a_fazer", "pendente_aprovacao", "rejeitada"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);
    return { days, startPadding };
  }, [currentMonth]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Tarefa[]>();
    tarefasMes?.forEach(t => {
      if (!t.data_prevista) return;
      const key = t.data_prevista;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tarefasMes]);

  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
  const selectedTasks = tasksByDate.get(selectedDateKey) ?? [];
  const allTasks = [...selectedTasks, ...(isToday(selectedDate) ? (tarefasLegacy ?? []) : [])];

  const concluirMutation = useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase
        .from("tarefa")
        .update({ status: "pendente_aprovacao", data_conclusao: new Date().toISOString() })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas-cal"] });
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas-legacy"] });
      toast({ title: "Tarefa enviada! ✅", description: "Aguardando aprovação do responsável." });
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível concluir a tarefa.", variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Minhas Tarefas 📋</h1>
          <p className="text-muted-foreground">Complete tarefas e ganhe moedas!</p>
        </motion.div>

        {/* Calendar Header */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-display text-base font-semibold capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Mini Calendar */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-7">
              {diasSemanaLabel.map(d => (
                <div key={d} className="border-b bg-muted/50 p-1.5 text-center text-[10px] font-semibold text-muted-foreground">
                  {d}
                </div>
              ))}
              {Array.from({ length: calendarDays.startPadding }).map((_, i) => (
                <div key={`pad-${i}`} className="border-b border-r bg-muted/20 p-1.5 min-h-[40px]" />
              ))}
              {calendarDays.days.map(day => {
                const key = format(day, "yyyy-MM-dd");
                const dayTasks = tasksByDate.get(key) ?? [];
                const isSelected = isSameDay(day, selectedDate);
                const today = isToday(day);
                const hasTasks = dayTasks.length > 0;
                const allDone = hasTasks && dayTasks.every(t => t.status === "concluida");
                const hasPending = dayTasks.some(t => t.status === "a_fazer" || t.status === "rejeitada");

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDate(day)}
                    className={`cursor-pointer border-b border-r p-1.5 min-h-[40px] text-center transition-colors hover:bg-muted/30 ${
                      isSelected ? "bg-primary/10 ring-2 ring-primary ring-inset" : ""
                    } ${today ? "bg-accent/10" : ""}`}
                  >
                    <div className={`text-xs font-semibold ${today ? "text-primary" : ""}`}>
                      {format(day, "d")}
                    </div>
                    {hasTasks && (
                      <div className={`mt-0.5 mx-auto h-1.5 w-1.5 rounded-full ${
                        allDone ? "bg-green-500" : hasPending ? "bg-primary" : "bg-yellow-500"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day tasks */}
        <motion.div key={selectedDateKey} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="font-display font-semibold mb-3 capitalize">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h3>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : allTasks.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <ClipboardList className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="font-display font-semibold">Sem tarefas neste dia</p>
                <p className="text-sm text-muted-foreground">Aproveite o dia livre! 🎉</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {allTasks.map((tarefa, i) => (
                  <motion.div key={tarefa.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="border-2 transition-shadow hover:shadow-md">
                      <CardContent className="flex items-center gap-4 py-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-xl">
                          {categoriasEmoji[tarefa.categoria] ?? "⭐"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-display font-semibold text-sm truncate">{tarefa.nome}</p>
                            <Badge variant={statusLabel[tarefa.status]?.variant ?? "outline"} className="text-[10px]">
                              {statusLabel[tarefa.status]?.label ?? tarefa.status}
                            </Badge>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-coin-foreground">
                            <Coins className="h-3 w-3 text-coin" /> {tarefa.valor_moedas} moedas
                          </div>
                          {tarefa.status === "rejeitada" && tarefa.comentario_responsavel && (
                            <p className="mt-1 text-xs text-destructive">💬 {tarefa.comentario_responsavel}</p>
                          )}
                        </div>
                        {(tarefa.status === "a_fazer" || tarefa.status === "rejeitada") && (
                          <Button size="sm" onClick={() => concluirMutation.mutate(tarefa.id)} disabled={concluirMutation.isPending} className="shrink-0">
                            {concluirMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Feito!</>}
                          </Button>
                        )}
                        {tarefa.status === "pendente_aprovacao" && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Clock className="h-3.5 w-3.5" /> Aguardando
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
