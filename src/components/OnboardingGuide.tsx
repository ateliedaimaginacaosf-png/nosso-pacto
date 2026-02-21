import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Users, ClipboardList, CalendarDays, FileText, Sparkles, ChevronDown, ChevronUp, ClipboardCheck, Gift, Trophy, HandHeart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";

interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  icon: typeof Users;
  linkTo: string;
  linkLabel: string;
  done: boolean;
}

const howItWorksItems = [
  {
    emoji: "📋",
    title: "Tarefas",
    description: "As crianças marcam como feito e você recebe para validar.",
    icon: ClipboardCheck,
  },
  {
    emoji: "🙏",
    title: "Dispensas",
    description: "Se não puderem fazer, pedem dispensa e você decide.",
    icon: HandHeart,
  },
  {
    emoji: "🎁",
    title: "Resgates",
    description: "Trocam moedas por recompensas e você aprova.",
    icon: Gift,
  },
  {
    emoji: "🏅",
    title: "Conquistas",
    description: "Badges desbloqueados automaticamente ao atingir metas.",
    icon: Trophy,
  },
];

export function OnboardingGuide() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(true);

  const { data } = useQuery({
    queryKey: ["onboarding-progress", profile?.familia_id],
    queryFn: async () => {
      const familiaId = profile!.familia_id;

      const [criancasRes, tarefasRes, contratosRes, familiaRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", familiaId)
          .eq("tipo_perfil", "crianca"),
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", familiaId),
        supabase
          .from("contrato_versao")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", familiaId)
          .eq("status", "vigente"),
        supabase
          .from("familia")
          .select("onboarding_dismissed")
          .eq("id", familiaId)
          .single(),
      ]);

      return {
        hasCriancas: (criancasRes.count ?? 0) > 0,
        hasTarefas: (tarefasRes.count ?? 0) > 0,
        hasContrato: (contratosRes.count ?? 0) > 0,
        dismissed: familiaRes.data?.onboarding_dismissed === true,
      };
    },
    enabled: !!profile,
  });

  if (!data) return null;

  const steps: OnboardingStep[] = [
    {
      key: "membros",
      title: "Cadastre os membros",
      description: "Adicione as crianças da família para começar.",
      icon: Users,
      linkTo: "/responsavel/membros",
      linkLabel: "Ir para Membros",
      done: data.hasCriancas,
    },
    {
      key: "tarefas-recompensas",
      title: "Revise tarefas e recompensas",
      description: "Modelos pré-cadastrados foram criados. Adapte à sua realidade.",
      icon: ClipboardList,
      linkTo: "/responsavel/tarefas",
      linkLabel: "Ver Modelos",
      done: data.hasCriancas, // Always marked if they have kids (templates are auto-created)
    },
    {
      key: "calendario",
      title: "Atribua tarefas no calendário",
      description: "Escolha os modelos e atribua aos filhos nos dias desejados.",
      icon: CalendarDays,
      linkTo: "/responsavel/atribuicao",
      linkLabel: "Abrir Calendário",
      done: data.hasTarefas,
    },
    {
      key: "contrato",
      title: "Celebre o contrato de autonomia",
      description: "Formalize direitos, deveres e consequências com cada filho.",
      icon: FileText,
      linkTo: "/responsavel/contrato",
      linkLabel: "Criar Contrato",
      done: data.hasContrato,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const isFullyDismissed = allDone && data.dismissed;

  // After all done AND dismissed → show "Como funciona" permanently
  if (isFullyDismissed) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="flex flex-row items-center gap-3 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#805589]/15">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="font-display text-lg">Como funciona no dia a dia</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="pt-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  {howItWorksItems.map((item) => (
                    <div key={item.title} className="flex items-start gap-3 rounded-lg border p-3">
                      <span className="text-xl">{item.emoji}</span>
                      <div>
                        <p className="font-display font-semibold text-sm">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    );
  }

  // Show onboarding steps
  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="flex flex-row items-center gap-3 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <CardTitle className="font-display text-lg">
            {allDone ? "Tudo pronto! 🎉" : "Primeiros passos"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {allDone
              ? "Parabéns! Sua família está configurada."
              : `${completedCount} de ${steps.length} concluídos`}
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {completedCount}/{steps.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Progress bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / steps.length) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isNext = !step.done && steps.slice(0, i).every((s) => s.done);
            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  step.done
                    ? "border-primary/20 bg-primary/5"
                    : isNext
                      ? "border-primary/40 bg-background shadow-sm"
                      : "border-transparent bg-muted/30 opacity-60"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-display text-sm font-semibold ${step.done ? "line-through text-muted-foreground" : ""}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                {!step.done && isNext && (
                  <Link to={step.linkTo}>
                    <Button size="sm" variant="outline" className="shrink-0 text-xs">
                      {step.linkLabel}
                    </Button>
                  </Link>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* All done → show dismiss + how it works */}
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 pt-2"
          >
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="font-display font-semibold text-sm mb-3">Como funciona no dia a dia:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {howItWorksItems.map((item) => (
                  <div key={item.title} className="flex items-start gap-2">
                    <span className="text-base">{item.emoji}</span>
                    <div>
                      <p className="font-semibold text-xs">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={async () => {
                await supabase
                  .from("familia")
                  .update({ onboarding_dismissed: true })
                  .eq("id", profile?.familia_id);
                queryClient.invalidateQueries({ queryKey: ["onboarding-progress"] });
              }}
            >
              Entendi! ✨
            </Button>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
