import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function MinhasConquistas() {
  const { profile } = useAuth();

  const { data: allBadges, isLoading: loadingBadges } = useQuery({
    queryKey: ["badges-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badge")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const { data: unlocked, isLoading: loadingUnlocked } = useQuery({
    queryKey: ["badges-desbloqueados", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badge_desbloqueio")
        .select("badge_id, desbloqueado_em")
        .eq("user_id", profile!.user_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const unlockedMap = new Map(
    (unlocked ?? []).map((u) => [u.badge_id, u.desbloqueado_em])
  );

  const isLoading = loadingBadges || loadingUnlocked;
  const totalUnlocked = unlocked?.length ?? 0;
  const totalBadges = allBadges?.length ?? 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Minhas Conquistas 🏆</h1>
          <p className="text-muted-foreground">Desbloqueie medalhas completando desafios!</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5">
            <CardContent className="flex items-center gap-4 py-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
                <Trophy className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conquistas desbloqueadas</p>
                <p className="font-display text-3xl font-bold text-foreground">{totalUnlocked} / {totalBadges}</p>
              </div>
              {totalUnlocked === totalBadges && totalBadges > 0 && (
                <Badge className="ml-auto gap-1">🎉 Todas!</Badge>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !allBadges?.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Trophy className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhuma conquista disponível</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {allBadges.map((badge, i) => {
              const isUnlocked = unlockedMap.has(badge.id);
              const unlockedAt = unlockedMap.get(badge.id);
              return (
                <motion.div
                  key={badge.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className={`border-2 transition-all ${isUnlocked ? "border-primary/30 bg-primary/5" : "border-muted opacity-60"}`}>
                    <CardContent className="flex items-center gap-4 py-5">
                      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${isUnlocked ? "bg-primary/10" : "bg-muted"}`}>
                        {isUnlocked ? badge.emoji : <Lock className="h-6 w-6 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-display font-semibold ${isUnlocked ? "text-foreground" : "text-muted-foreground"}`}>
                          {badge.nome}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">{badge.descricao}</p>
                        {isUnlocked && unlockedAt && (
                          <p className="text-xs text-primary mt-1">
                            Desbloqueada em {new Date(unlockedAt).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                      {isUnlocked && (
                        <Badge variant="default" className="shrink-0">✓</Badge>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
