import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Coins, Loader2, ShoppingBag, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Recompensa = Tables<"recompensa">;

export default function LojaRecompensas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: recompensas, isLoading } = useQuery({
    queryKey: ["loja-recompensas", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recompensa")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("ativa", true)
        .order("custo_moedas", { ascending: true });
      if (error) throw error;
      return data as Recompensa[];
    },
    enabled: !!profile,
  });

  const { data: saldo } = useQuery({
    queryKey: ["saldo-crianca", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("calcular_saldo", { _user_id: profile!.user_id });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!profile,
  });

  const resgatarMutation = useMutation({
    mutationFn: async (recompensa: Recompensa) => {
      const status = recompensa.exige_aprovacao ? "pendente" : "aprovada";
      const { error } = await supabase.from("resgate_recompensa").insert({
        recompensa_id: recompensa.id,
        crianca_id: profile!.user_id,
        familia_id: profile!.familia_id,
        custo_moedas: recompensa.custo_moedas,
        status,
      });
      if (error) throw error;

      if (!recompensa.exige_aprovacao) {
        // Debit coins immediately
        const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: profile!.user_id });
        const anterior = (saldoAtual as number) ?? 0;
        await supabase.from("transacao").insert({
          user_id: profile!.user_id,
          familia_id: profile!.familia_id,
          tipo: "resgate_recompensa" as const,
          quantidade_moedas: recompensa.custo_moedas,
          saldo_anterior: anterior,
          saldo_posterior: anterior - recompensa.custo_moedas,
          descricao: `Resgate: ${recompensa.nome}`,
        });
        await supabase.from("profiles").update({ saldo_moedas: anterior - recompensa.custo_moedas }).eq("user_id", profile!.user_id);
      }
    },
    onSuccess: (_, recompensa) => {
      queryClient.invalidateQueries({ queryKey: ["loja-recompensas"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-crianca"] });
      if (recompensa.exige_aprovacao) {
        toast({ title: "Resgate solicitado! 🎁", description: "Aguardando aprovação do responsável." });
      } else {
        toast({ title: "Resgate aprovado! 🎉", description: "Recompensa resgatada com sucesso!" });
      }
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível solicitar o resgate.", variant: "destructive" });
    },
  });

  const currentSaldo = saldo ?? 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Loja de Recompensas 🎁</h1>
          <p className="text-muted-foreground">Troque suas moedas por prêmios incríveis!</p>
        </motion.div>

        {/* Balance bar */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Coins className="h-6 w-6 text-coin" />
              <span className="text-sm font-medium text-muted-foreground">Seu saldo:</span>
              <span className="font-display text-2xl font-bold text-coin-foreground">{currentSaldo}</span>
              <span className="text-sm text-muted-foreground">moedas</span>
            </CardContent>
          </Card>
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !recompensas?.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingBag className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Loja vazia por enquanto</p>
              <p className="text-sm text-muted-foreground">Seu responsável ainda não adicionou recompensas.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recompensas.map((rec, i) => {
              const canAfford = currentSaldo >= rec.custo_moedas;
              return (
                <motion.div
                  key={rec.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className={`border-2 transition-all ${canAfford ? "border-primary/20 hover:shadow-lg hover:border-primary/40" : "border-muted opacity-70"}`}>
                    <CardContent className="flex flex-col gap-3 py-5">
                      <div className="flex items-start justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10">
                          <Gift className="h-5 w-5 text-accent" />
                        </div>
                        <Badge variant={canAfford ? "default" : "secondary"} className="gap-1">
                          <Coins className="h-3 w-3" /> {rec.custo_moedas}
                        </Badge>
                      </div>
                      <div>
                        <p className="font-display font-semibold">{rec.nome}</p>
                        {rec.descricao && <p className="text-sm text-muted-foreground line-clamp-2">{rec.descricao}</p>}
                      </div>
                      <Button
                        className="mt-auto w-full gap-2"
                        disabled={!canAfford || resgatarMutation.isPending}
                        onClick={() => resgatarMutation.mutate(rec)}
                      >
                        {resgatarMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            {canAfford ? "Resgatar!" : "Moedas insuficientes"}
                          </>
                        )}
                      </Button>
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
