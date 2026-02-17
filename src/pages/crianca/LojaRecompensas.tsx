import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Coins, Loader2, ShoppingBag, Sparkles, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useRegrasOuroStatus } from "@/hooks/useRegrasOuroStatus";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Tables } from "@/integrations/supabase/types";

type Recompensa = Tables<"recompensa">;

export default function LojaRecompensas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [confirmRecompensa, setConfirmRecompensa] = useState<Recompensa | null>(null);
  const [mensagemResgate, setMensagemResgate] = useState("");

  const { bloqueado, bloqueadoOriginal, liberacao, limiteLiberdade } =
    useRegrasOuroStatus(profile?.user_id, profile?.familia_id);
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

  // Query today's redeemed coins (approved/utilized/pending today)
  const hoje = new Date().toISOString().slice(0, 10);
  const isLimited = bloqueadoOriginal && !bloqueado && limiteLiberdade != null;
  const { data: resgatadosHoje } = useQuery({
    queryKey: ["resgates-hoje", profile?.user_id, hoje],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resgate_recompensa")
        .select("custo_moedas, status")
        .eq("crianca_id", profile!.user_id)
        .gte("created_at", `${hoje}T00:00:00`)
        .lt("created_at", `${hoje}T23:59:59.999`)
        .in("status", ["pendente", "aprovada", "utilizada"]);
      if (error) throw error;
      return data.reduce((sum, r) => sum + r.custo_moedas, 0);
    },
    enabled: !!profile && isLimited,
  });

  const resgatarMutation = useMutation({
    mutationFn: async ({ recompensa, mensagem }: { recompensa: Recompensa; mensagem: string }) => {
      const status = recompensa.exige_aprovacao ? "pendente" : "aprovada";
      const { data: resgate, error } = await supabase.from("resgate_recompensa").insert({
        recompensa_id: recompensa.id,
        crianca_id: profile!.user_id,
        familia_id: profile!.familia_id,
        custo_moedas: recompensa.custo_moedas,
        status,
      }).select("id").single();
      if (error) throw error;

      // Record interaction
      await supabase.from("resgate_interacao").insert({
        resgate_id: resgate.id,
        familia_id: profile!.familia_id,
        user_id: profile!.user_id,
        status_anterior: null,
        status_novo: status,
        mensagem: mensagem.trim() || null,
      });

      if (!recompensa.exige_aprovacao) {
        const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: profile!.user_id });
        const anterior = (saldoAtual as number) ?? 0;
        const { error: txError } = await supabase.from("transacao").insert({
          user_id: profile!.user_id,
          familia_id: profile!.familia_id,
          tipo: "resgate_recompensa" as const,
          quantidade_moedas: recompensa.custo_moedas,
          saldo_anterior: anterior,
          saldo_posterior: anterior - recompensa.custo_moedas,
          descricao: `Resgate: ${recompensa.nome}`,
        });
        if (txError) throw txError;
        await supabase.from("profiles").update({ saldo_moedas: anterior - recompensa.custo_moedas }).eq("user_id", profile!.user_id);
      }
    },
    onSuccess: (_, { recompensa }) => {
      queryClient.invalidateQueries({ queryKey: ["loja-recompensas"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-crianca"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-provisionado"] });
      queryClient.invalidateQueries({ queryKey: ["resgates-hoje"] });
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
  const currentProvisionado = provisionado ?? 0;
  const saldoDisponivel = currentSaldo - currentProvisionado;

  // Calculate effective limit considering golden rule overrides and today's redemptions
  const jaResgatadoHoje = resgatadosHoje ?? 0;
  const limiteRestanteHoje = limiteLiberdade != null ? Math.max(0, limiteLiberdade - jaResgatadoHoje) : null;
  const limiteEfetivo = bloqueado
    ? 0
    : limiteRestanteHoje != null
    ? Math.min(saldoDisponivel, limiteRestanteHoje)
    : saldoDisponivel;
  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Loja de Recompensas 🎁</h1>
          <p className="text-muted-foreground">Troque suas moedas por prêmios incríveis!</p>
        </motion.div>

        {/* Golden rules block warning */}
        {bloqueado && (
          <Card className="border-2 border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Lock className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="font-semibold text-destructive text-sm">Resgates bloqueados</p>
                <p className="text-xs text-muted-foreground">
                  Você não cumpriu todas as regras de ouro ontem. Peça ao seu responsável para liberar.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        {isLimited && (
          <Card className="border-2 border-yellow-500/40 bg-yellow-500/5">
            <CardContent className="flex items-center gap-3 py-4">
              <Lock className="h-5 w-5 text-yellow-600 shrink-0" />
              <div className="text-sm">
                <p>
                  Seu responsável liberou até <strong>{limiteLiberdade} moedas</strong> para resgates hoje.
                </p>
                {jaResgatadoHoje > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {jaResgatadoHoje} já resgatadas • restam <strong>{limiteRestanteHoje}</strong> moedas disponíveis.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5">
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center gap-3">
                <Coins className="h-6 w-6 text-coin" />
                <span className="text-sm font-medium text-muted-foreground">Disponível:</span>
                <span className="font-display text-2xl font-bold text-coin-foreground">{saldoDisponivel}</span>
                <span className="text-sm text-muted-foreground">moedas</span>
              </div>
              {currentProvisionado > 0 && (
                <p className="text-xs text-muted-foreground ml-9">
                  ({currentProvisionado} provisionadas para resgates pendentes • total: {currentSaldo})
                </p>
              )}
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
              const canAfford = limiteEfetivo >= rec.custo_moedas;
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
                        {!rec.exige_aprovacao && (
                          <Badge variant="outline" className="mt-1 gap-1 text-xs border-green-500/30 text-green-600">
                            <Sparkles className="h-3 w-3" /> Resgate automático
                          </Badge>
                        )}
                      </div>
                      <Button
                        className="mt-auto w-full gap-2"
                        disabled={!canAfford || resgatarMutation.isPending || bloqueado}
                        onClick={() => { setConfirmRecompensa(rec); setMensagemResgate(""); }}
                      >
                        {resgatarMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : bloqueado ? (
                          <>
                            <Lock className="h-4 w-4" />
                            Bloqueado
                          </>
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

        <AlertDialog open={!!confirmRecompensa} onOpenChange={(open) => { if (!open) { setConfirmRecompensa(null); setMensagemResgate(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar resgate</AlertDialogTitle>
              <AlertDialogDescription>
                Deseja resgatar <strong>{confirmRecompensa?.nome}</strong> por{" "}
                <strong>{confirmRecompensa?.custo_moedas} moedas</strong>?
                {confirmRecompensa?.exige_aprovacao
                  ? " O pedido será enviado para aprovação do responsável."
                  : " O resgate será feito automaticamente."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label>Mensagem (opcional)</Label>
              <Textarea
                placeholder="Escreva uma mensagem para o responsável..."
                value={mensagemResgate}
                onChange={(e) => setMensagemResgate(e.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmRecompensa) {
                    resgatarMutation.mutate({ recompensa: confirmRecompensa, mensagem: mensagemResgate });
                    setConfirmRecompensa(null);
                    setMensagemResgate("");
                  }
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
