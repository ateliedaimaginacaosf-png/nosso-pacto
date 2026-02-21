import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";

interface NivelXPProps {
  userId?: string;
}

const LEVELS = [
  { nome: "Iniciante", emoji: "🌱", xpMin: 0 },
  { nome: "Dedicado", emoji: "⭐", xpMin: 50 },
  { nome: "Expert", emoji: "🔥", xpMin: 150 },
  { nome: "Mestre", emoji: "👑", xpMin: 350 },
  { nome: "Lenda", emoji: "💎", xpMin: 700 },
];

function getLevel(xp: number) {
  let current = LEVELS[0];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpMin) {
      current = LEVELS[i];
      break;
    }
  }
  const idx = LEVELS.indexOf(current);
  const next = idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
  const xpInLevel = xp - current.xpMin;
  const xpForNext = next ? next.xpMin - current.xpMin : 0;
  const progress = next ? Math.min((xpInLevel / xpForNext) * 100, 100) : 100;
  return { current, next, idx, xpInLevel, xpForNext, progress };
}

export const NivelXP = memo(function NivelXP({ userId }: NivelXPProps) {
  const { data: totalXP, isLoading } = useQuery({
    queryKey: ["xp-total", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("valor_moedas")
        .eq("atribuida_a", userId!)
        .eq("status", "concluida");
      if (error) throw error;
      return (data ?? []).reduce((sum, t) => sum + (t.valor_moedas ?? 1), 0);
    },
    enabled: !!userId,
  });

  if (isLoading || totalXP === undefined) return null;

  const { current, next, idx, xpInLevel, xpForNext, progress } = getLevel(totalXP);

  return (
    <Card className="border-2 border-primary/20 overflow-hidden">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{current.emoji}</span>
            <div>
              <p className="font-display text-sm font-bold text-foreground">
                Nível: {current.nome}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3 text-primary" />
                {totalXP} XP total
              </p>
            </div>
          </div>
          {next && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Próximo nível</p>
              <p className="text-sm font-semibold">
                {next.emoji} {next.nome}
              </p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#450050] to-[#805589]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            {next ? (
              <>
                <span>{xpInLevel} / {xpForNext} XP</span>
                <span>Faltam {xpForNext - xpInLevel} XP</span>
              </>
            ) : (
              <span className="text-primary font-semibold">🎉 Nível máximo alcançado!</span>
            )}
          </div>
        </div>

        {/* Level indicators */}
        <div className="flex justify-between px-1">
          {LEVELS.map((level, i) => (
            <div
              key={level.nome}
              className={`flex flex-col items-center gap-0.5 ${
                i <= idx ? "opacity-100" : "opacity-30"
              }`}
            >
              <span className="text-base">{level.emoji}</span>
              <span className="text-[9px] font-medium text-muted-foreground leading-tight">
                {level.nome}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
